/**
 * Lớp dữ liệu: nạp HTS full (USITC, public domain) từ data/hts_full.json.
 *
 * Cấu trúc HTS là cây phân cấp theo `indent`: mô tả của một dòng lá chỉ đầy đủ
 * khi ghép với chuỗi tổ tiên (vd "Umbrellas > Garden or similar umbrellas").
 * Ta dựng `path` cho từng dòng bằng stack theo indent ngay lúc nạp.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_FILE = process.env.HTS_DATA_FILE ?? join(ROOT, "data", "hts_full.json");

export type HtsRow = {
  htsno: string; indent: string; description: string; superior: string | null;
  units: string[]; general: string; special: string; other: string;
  footnotes: { columns?: string[]; value?: string }[] | null;
  quotaQuantity: string | null; additionalDuties: string | null;
};
export type HtsEntry = HtsRow & {
  path: string;
  /** Thuế hiệu lực: của chính dòng, hoặc kế thừa dòng cha gần nhất (suffix 10 số thường trống) */
  eff_general: string; eff_special: string; eff_other: string; rate_inherited: boolean;
  /** Rule ch99 đã bị vô hiệu (compiler's note: provision terminated) */
  terminated: boolean;
};

type Dump = { fetched_at: string; source: string; license: string; rows: HtsRow[] };
const dump: Dump = JSON.parse(readFileSync(DATA_FILE, "utf8"));

const TERMINATED_RX = /provision (?:is )?terminated|no longer in effect|provision has expired/i;

export const entries: HtsEntry[] = [];
{
  type Frame = { indent: number; description: string; general: string; special: string; other: string };
  const stack: Frame[] = [];
  for (const r of dump.rows) {
    const ind = Number(r.indent || 0);
    while (stack.length && stack[stack.length - 1].indent >= ind) stack.pop();
    const path = [...stack.map((s) => s.description), r.description]
      .map((s) => (s ?? "").trim().replace(/:$/, ""))
      .filter(Boolean)
      .join(" > ");
    // Kế thừa thuế từ tổ tiên gần nhất — CHỈ cho suffix thống kê (>=9 số): dòng 8 số
    // không có thuế là heading cấu trúc, kế thừa xuyên cấp sẽ gán nhầm (review agy 18/08)
    let eg = r.general || "", es = r.special || "", eo = r.other || "", inherited = false;
    if (!eg && (r.htsno || "").replace(/\D/g, "").length >= 9) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].general) { eg = stack[i].general; es = es || stack[i].special; eo = eo || stack[i].other; inherited = true; break; }
      }
    }
    entries.push({
      ...r, path, eff_general: eg, eff_special: es, eff_other: eo,
      rate_inherited: inherited, terminated: TERMINATED_RX.test(path),
    });
    stack.push({ indent: ind, description: r.description ?? "", general: r.general || "", special: r.special || "", other: r.other || "" });
  }
}

/** Dòng "tính được thuế": có mã HTS >= 8 số và có cột thuế general khác rỗng. */
export const rateLines: HtsEntry[] = entries.filter(
  (e) => e.htsno && e.htsno.replace(/\D/g, "").length >= 8 && !e.htsno.startsWith("99")
);

/** Chương 99: thuế bổ sung (IEEPA, Section 301, 232...) dạng raw rule. */
export const ch99: HtsEntry[] = entries.filter((e) => e.htsno?.startsWith("99"));

/** Tìm ứng viên mã HS theo mô tả sản phẩm — keyword scoring trên path đầy đủ. */
export function searchCandidates(query: string, limit = 5): HtsEntry[] {
  const q = query.toLowerCase();
  const words = q.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  const scored = rateLines
    .map((e) => {
      const hay = e.path.toLowerCase();
      let score = 0;
      if (hay.includes(q)) score += 8;
      for (const w of words) if (hay.includes(w)) score += 1;
      // ưu tiên dòng lá 10 số (có suffix thống kê) hơn heading 8 số
      if (e.htsno.replace(/\D/g, "").length >= 10) score += 0.5;
      return { e, score };
    })
    .filter((x) => x.score >= Math.min(2, words.length))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.e);
}

/** Tra dòng thuế theo mã (10 số, 8 số, hoặc prefix). */
export function findByCode(code: string): HtsEntry[] {
  const digits = code.replace(/\D/g, "");
  if (!digits) return [];
  const exact = rateLines.filter((e) => e.htsno.replace(/\D/g, "") === digits);
  if (exact.length) return exact;
  // prefix so trên chuỗi đã bỏ chấm — miễn nhiễm mọi kiểu nhập (review agy 18/08)
  return rateLines.filter((e) => e.htsno.replace(/\D/g, "").startsWith(digits)).slice(0, 10);
}

/**
 * Rule chương 99 có thể liên quan tới một xuất xứ: match tên nước trong path.
 * KHÔNG tự suy luận rule nào thắng — trả raw để LLM client đọc chuỗi exception.
 */
export function ch99ForOrigin(origin: string, limit = 25): HtsEntry[] {
  const o = origin.trim().toLowerCase();
  const aliases: Record<string, string[]> = {
    china: ["china", "hong kong", "macau"],
    "united kingdom": ["united kingdom", "uk"],
    "south korea": ["korea"],
    vietnam: ["vietnam", "viet nam"],
  };
  const needles = aliases[o] ?? [o];
  return ch99
    .filter((e) => {
      const hay = e.path.toLowerCase();
      return needles.some((n) => hay.includes(n));
    })
    .slice(0, limit);
}

/** Rule ch99 áp cho MỌI xuất xứ ("all countries"/"any country") — luôn phải trả để không sót (fix P0). */
export function ch99Universal(limit = 10): HtsEntry[] {
  const rx = /all countries|any country|from all|of any country/i;
  return ch99.filter((e) => !e.terminated && rx.test(e.path)).slice(0, limit);
}

/** "+ 25%" trong rule ch99 -> 25; null nếu không parse được (rule dạng khác). */
export const parseAdderPct = (rule: string): number | null => {
  const m = rule.match(/\+\s*([\d.]+)\s*%/);
  return m ? Number(m[1]) : null;
};
/** "7.2%" -> 7.2; null cho thuế đặc thù ("12.4¢/kg") hoặc "Free". */
export const parseRatePct = (rate: string): number | null => {
  if (/^free$/i.test(rate.trim())) return 0;
  const m = rate.trim().match(/^([\d.]+)\s*%$/);
  return m ? Number(m[1]) : null;
};

/** Phí cố định nhập khẩu Mỹ — công thức công khai của CBP, điều chỉnh hằng năm. */
export const FEES = {
  mpf: { rate: 0.003464, min_usd: 33.58, max_usd: 651.5, note: "Merchandise Processing Fee FY2025 — kiểm tra mức min/max hiện hành tại cbp.gov trước quyết định cuối" },
  hmf: { rate: 0.00125, note: "Harbor Maintenance Fee — chỉ áp cho hàng đường biển, không min/max" },
};

/** Rule ch99 được footnote của chính dòng thuế trỏ tới ("See 9903.88.03.") — chính xác hơn match tên nước. */
export function ch99FromFootnotes(e: HtsEntry): HtsEntry[] {
  const refs = new Set<string>();
  for (const f of e.footnotes ?? []) {
    for (const m of (f.value ?? "").matchAll(/99\d{2}\.\d{2}(?:\.\d{2})?/g)) refs.add(m[0]);
  }
  if (!refs.size) return [];
  return ch99.filter((c) => [...refs].some((r) => c.htsno.startsWith(r)));
}

// ---- Watchlist + diff giữa 2 lần fetch (trục subscription) ----

const WATCHLIST_FILE = process.env.HTS_WATCHLIST_FILE ?? join(ROOT, "data", "watchlist.json");
export type WatchItem = { hts_code: string; origin?: string; added: string };

export function loadWatchlist(): WatchItem[] {
  try { return JSON.parse(readFileSync(WATCHLIST_FILE, "utf8")); } catch { return []; }
}
export function saveWatchlist(items: WatchItem[]): void {
  writeFileSync(WATCHLIST_FILE, JSON.stringify(items, null, 2));
}

export type RateChange = { htsno: string; field: string; old: string; new: string };

/** So sánh bản hiện tại với bản fetch trước (hts_full.prev.json). null = chưa có mốc cũ. */
export function diffRates(codes?: string[]): { prev_date: string; changes: RateChange[] } | null {
  let prev: Dump;
  try {
    prev = JSON.parse(readFileSync(join(ROOT, "data", "hts_full.prev.json"), "utf8"));
  } catch { return null; }
  const prefixes = codes?.map((c) => c.replace(/\D/g, ""));
  const inScope = (h: string) => !prefixes?.length || prefixes.some((p) => h.replace(/\D/g, "").startsWith(p));
  const prevMap = new Map(prev.rows.filter((r) => r.htsno).map((r) => [r.htsno, r]));
  const curSet = new Set(dump.rows.map((r) => r.htsno).filter(Boolean));
  const FIELDS = ["general", "special", "other", "additionalDuties"] as const;
  const changes: RateChange[] = [];
  for (const r of dump.rows) {
    if (!r.htsno || !inScope(r.htsno)) continue;
    const p = prevMap.get(r.htsno);
    if (!p) { changes.push({ htsno: r.htsno, field: "(dòng mới)", old: "", new: r.general || r.description?.slice(0, 60) || "" }); continue; }
    for (const f of FIELDS) {
      const a = (p[f] ?? "") || ""; const b = (r[f] ?? "") || "";
      if (a !== b) changes.push({ htsno: r.htsno, field: f, old: String(a), new: String(b) });
    }
  }
  // dòng bị XÓA khỏi HTS — quan trọng không kém dòng đổi thuế (review agy 18/08)
  for (const [h, p] of prevMap) {
    if (!curSet.has(h) && inScope(h))
      changes.push({ htsno: h, field: "(dòng bị xóa)", old: p.general || p.description?.slice(0, 60) || "", new: "" });
  }
  return { prev_date: prev.fetched_at, changes };
}

export const DATASET_INFO = {
  fetched_at: dump.fetched_at,
  source: dump.source,
  license: dump.license,
  total_rows: entries.length,
  rate_lines: rateLines.length,
  ch99_rules: ch99.length,
  data_file: DATA_FILE,
};
