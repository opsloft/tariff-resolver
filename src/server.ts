/**
 * tariff-resolver — MCP server tra thuế nhập khẩu Mỹ trên dữ liệu USITC public domain.
 *
 * Nguyên tắc thiết kế:
 * - Server làm RETRIEVAL, LLM client làm suy luận: chương 99 trả raw rule + exception,
 *   không tự phán rule nào áp dụng.
 * - Mọi output là ứng viên/ước tính kèm link nguồn chính thức — không phải tư vấn hải quan.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DATASET_INFO, FEES, ch99ForOrigin, ch99FromFootnotes, ch99Universal, diffRates,
  findByCode, loadWatchlist, parseAdderPct, parseRatePct, saveWatchlist,
  searchCandidates, type HtsEntry,
} from "./data.js";

const DISCLAIMER =
  "CANDIDATES/ESTIMATE ONLY — requires licensed customs broker review. Not customs or legal advice.";

const fmtLine = (e: HtsEntry) =>
  [
    `**${e.htsno}** — ${e.path}`,
    `  general (MFN): ${e.eff_general || "—"}${e.rate_inherited ? " (kế thừa dòng cha)" : ""} | special (FTA): ${e.eff_special || "—"} | column 2: ${e.eff_other || "—"}`,
    e.units?.length ? `  đơn vị: ${e.units.join(", ")}` : "",
    `  nguồn: https://hts.usitc.gov/search?query=${encodeURIComponent(e.htsno)} | tiền lệ phân loại: https://rulings.cbp.gov/search?term=${encodeURIComponent(e.htsno.slice(0, 7))}`,
  ].filter(Boolean).join("\n");

const ruleObj = (e: HtsEntry) => ({
  heading: e.htsno,
  adder_pct: parseAdderPct(e.eff_general || e.general || ""),
  rate_text: e.eff_general || e.general || "(xem mô tả)",
  rule_verbatim: e.path,
});

export function buildServer(): McpServer {
  const server = new McpServer({ name: "tariff-resolver", version: "0.1.0" });

  server.registerTool(
    "search_hs_candidates",
    {
      title: "Tìm ứng viên mã HTS theo mô tả sản phẩm",
      description:
        "Trả về top ứng viên mã HTS 8-10 số (kèm thuế MFN/FTA và link tiền lệ CROSS) cho một mô tả sản phẩm. " +
        "Kết quả là ỨNG VIÊN để sàng lọc trước khi hỏi broker, không phải phán quyết phân loại. " +
        "QUAN TRỌNG: HTS dùng thuật ngữ pháp lý, không dùng tên thương mại — TRƯỚC KHI GỌI hãy dịch mô tả sản phẩm " +
        "sang danh từ vật liệu + công dụng kiểu HTS (vd 'pink kids backpack' → 'travel bags of man-made fibers'; " +
        "'water bottle' → 'vacuum flask' hoặc 'bottle of plastics'). Nếu 0 kết quả, thử lại với 2-3 cách diễn đạt khác.",
      inputSchema: {
        product_description: z.string().describe("Mô tả sản phẩm tiếng Anh: chất liệu, công dụng, thành phần (vd 'stainless steel insulated water bottle 500ml')"),
        limit: z.number().int().min(1).max(10).default(5).describe("Số ứng viên"),
      },
    },
    async ({ product_description, limit }) => {
      const hits = searchCandidates(product_description, limit);
      const body = hits.length
        ? hits.map(fmtLine).join("\n\n")
        : "Không thấy ứng viên nào — thử mô tả bằng danh từ vật liệu/công dụng tiếng Anh đơn giản hơn (search theo từ khóa trên văn bản HTS).";
      return {
        content: [{ type: "text", text: `${DISCLAIMER}\n\n${body}` }],
      };
    }
  );

  server.registerTool(
    "calculate_tariff_scenario",
    {
      title: "Kịch bản thuế cho một mã HTS + xuất xứ + trị giá",
      description:
        "Trả về thuế MFN/FTA của mã HTS, TOÀN BỘ rule chương 99 (thuế bổ sung IEEPA/301/232) khớp xuất xứ ở dạng nguyên văn, " +
        "và phí MPF/HMF. LLM hãy tự đọc chuỗi exception của chương 99 để cộng đúng lớp thuế, giải thích từng bước cho user, " +
        "và luôn nhắc đây là ước tính.",
      inputSchema: {
        hts_code: z.string().describe("Mã HTS 8-10 số, có chấm hay không đều được"),
        origin_country: z.string().describe("Nước xuất xứ (tên tiếng Anh, vd 'China', 'Vietnam', 'Mexico')"),
        customs_value_usd: z.number().positive().describe("Trị giá hải quan lô hàng (USD)"),
        ocean_freight: z.boolean().default(false).describe("Hàng đi đường biển? (áp HMF)"),
        weight_kg: z.number().positive().optional().describe("Tổng trọng lượng (kg) — BẮT BUỘC nếu mã có thuế đặc thù theo kg (vd '12.4¢/kg')"),
        quantity: z.number().positive().optional().describe("Số lượng theo đơn vị của mã (No./Dz Pcs...) — cần cho thuế đặc thù theo chiếc"),
      },
    },
    async ({ hts_code, origin_country, customs_value_usd, ocean_freight, weight_kg, quantity }) => {
      const lines = findByCode(hts_code);
      if (!lines.length) {
        return { content: [{ type: "text", text: `Không tìm thấy mã ${hts_code} trong HTS hiện hành (rev ${DATASET_INFO.fetched_at}).` }] };
      }
      // active-only cho LLM (fix P0: LLM hay cộng nhầm rule đã terminated); đếm số rule bị lọc để minh bạch
      const linkedAll = [...new Map(lines.flatMap(ch99FromFootnotes).map((e) => [e.htsno, e])).values()];
      const originAll = ch99ForOrigin(origin_country).filter((e) => !linkedAll.some((l) => l.htsno === e.htsno));
      const linked = linkedAll.filter((e) => !e.terminated);
      const origin = originAll.filter((e) => !e.terminated);
      const universal = ch99Universal().filter((e) => !linked.some((l) => l.htsno === e.htsno) && !origin.some((o) => o.htsno === e.htsno));
      const nTerm = linkedAll.length + originAll.length - linked.length - origin.length;
      const base = lines[0];
      const mpf = Math.min(Math.max(customs_value_usd * FEES.mpf.rate, FEES.mpf.min_usd), FEES.mpf.max_usd);
      const hmf = ocean_freight ? customs_value_usd * FEES.hmf.rate : 0;
      const structured = {
        disclaimer:
          DISCLAIMER +
          " ⚠️ ESTIMATE EXCLUDES Anti-Dumping/Countervailing Duties (AD/CVD) — issued by US DOC, NOT in the HTS file. " +
          "AD/CVD can exceed 200% on goods like steel, aluminum, mattresses, solar, plywood from CN/VN. " +
          "Check https://www.trade.gov/us-antidumping-and-countervailing-duty-case-information before relying on this estimate.",
        hts_revision: DATASET_INFO.fetched_at,
        base_line: {
          htsno: base.htsno, description_path: base.path,
          general_mfn: { text: base.eff_general || null, pct: parseRatePct(base.eff_general || ""), inherited_from_parent: base.rate_inherited },
          special_fta: base.eff_special || null, column2: base.eff_other || null,
          other_candidate_lines: lines.slice(1, 4).map((l) => l.htsno),
        },
        ch99_additional_duties: {
          note: "Các rule dưới đây là ỨNG VIÊN đang active (rule terminated đã lọc). LLM: đọc rule_verbatim — chuỗi 'Except for...' quyết định rule nào áp; adder_pct đã parse sẵn để cộng, KHÔNG tự bịa số.",
          terminated_rules_excluded: nTerm,
          linked_by_footnote: linked.map(ruleObj),
          matched_by_origin_name: origin.map(ruleObj),
          universal_all_countries: universal.map(ruleObj),
        },
        fixed_fees_usd: {
          mpf: Number(mpf.toFixed(2)), mpf_note: FEES.mpf.note,
          hmf: Number(hmf.toFixed(2)), hmf_applied: ocean_freight,
        },
        customs_value_usd,
        weight_kg: weight_kg ?? null,
        quantity: quantity ?? null,
        duty_units: base.units ?? [],
        llm_guidance:
          "landed duty ≈ customs_value × (general_mfn.pct + adder_pct của các rule ch99 áp dụng)/100 + mpf + hmf. " +
          "Nếu general_mfn.pct = null thì đây là thuế đặc thù/hỗn hợp (vd '12.4¢/kg + 2%') — cần weight_kg/quantity để tính; " +
          "nếu user chưa cung cấp, HỎI LẠI thay vì đoán. Với rule ch99 có adder_pct = null, đọc rate_text — có thể là thuế đặc thù. " +
          "Nếu origin thuộc chương trình trong special_fta thì dùng mức special thay cho general. " +
          "Giải thích từng lớp, dẫn heading. Luôn nhắc: ước tính CHƯA GỒM AD/CVD, cần broker xác nhận. " +
          `Nguồn đối chiếu: https://hts.usitc.gov/search?query=${encodeURIComponent(base.htsno)}`,
      };
      return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }] };
    }
  );

  server.registerTool(
    "watch_tariff_changes",
    {
      title: "Đăng ký theo dõi thay đổi thuế cho danh sách mã HTS",
      description:
        "Lưu các mã HTS (kèm xuất xứ) vào watchlist. Sau mỗi lần dataset được cập nhật, gọi check_tariff_updates " +
        "để xem mức thuế của các mã này có đổi không. Đây là cách bám sát biến động thuế quan 2025-2026 mà không phải tự dò.",
      inputSchema: {
        hts_codes: z.array(z.string()).min(1).max(200).describe("Danh sách mã HTS 8-10 số cần theo dõi"),
        origin_country: z.string().optional().describe("Xuất xứ chung của lô hàng (tùy chọn)"),
      },
    },
    async ({ hts_codes, origin_country }) => {
      const list = loadWatchlist();
      const have = new Set(list.map((w) => w.hts_code));
      const added: string[] = [];
      for (const c of hts_codes) {
        if (!findByCode(c).length) continue;
        if (!have.has(c)) { list.push({ hts_code: c, origin: origin_country, added: new Date().toISOString().slice(0, 10) }); added.push(c); }
      }
      saveWatchlist(list);
      return {
        content: [{ type: "text", text: `Đã theo dõi ${added.length} mã mới (bỏ qua mã không tồn tại/đã có). Tổng watchlist: ${list.length} mã. Gọi check_tariff_updates sau mỗi lần dataset cập nhật.` }],
      };
    }
  );

  server.registerTool(
    "check_tariff_updates",
    {
      title: "Kiểm tra thay đổi thuế giữa 2 bản dataset",
      description:
        "So sánh bản HTS hiện tại với bản fetch trước đó. Không truyền mã → kiểm tra toàn bộ watchlist. " +
        "Trả về từng thay đổi: mã, cột (general/special/other/additionalDuties), giá trị cũ → mới.",
      inputSchema: {
        hts_codes: z.array(z.string()).optional().describe("Giới hạn vào các mã này (mặc định: watchlist)"),
      },
    },
    async ({ hts_codes }) => {
      const codes = hts_codes?.length ? hts_codes : loadWatchlist().map((w) => w.hts_code);
      const res = diffRates(codes.length ? codes : undefined);
      if (!res) {
        return { content: [{ type: "text", text: `Chưa có bản dataset trước để so (mới fetch 1 lần — ${DATASET_INFO.fetched_at}). Chạy lại scripts/fetch_hts.py ở lần cập nhật sau.` }] };
      }
      const head = `So sánh ${res.prev_date} → ${DATASET_INFO.fetched_at}` + (codes.length ? ` (phạm vi: ${codes.length} mã)` : " (toàn bộ HTS)");
      const body = res.changes.length
        ? res.changes.slice(0, 100).map((c) => `- **${c.htsno}** [${c.field}]: "${c.old}" → "${c.new}"`).join("\n") +
          (res.changes.length > 100 ? `\n…và ${res.changes.length - 100} thay đổi nữa` : "")
        : "Không có thay đổi nào cho phạm vi này.";
      return { content: [{ type: "text", text: `${head}\n\n${body}` }] };
    }
  );

  server.registerTool(
    "dataset_info",
    {
      title: "Thông tin dataset HTS đang phục vụ",
      description: "Ngày tải, nguồn, license, số dòng — dùng để kiểm tra độ tươi của dữ liệu.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(DATASET_INFO, null, 2) }],
    })
  );

  return server;
}
