/**
 * tariff-resolver — MCP server for US import duty research on USITC public-domain data.
 *
 * Design principles:
 * - The server does RETRIEVAL, the LLM client does the reasoning: chapter 99 comes back
 *   as raw rules + exceptions; the server never decides which rule applies.
 * - Every output is a candidate/estimate with official source links — not customs advice.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DATASET_INFO, dataset, diffRates, findByCode, loadWatchlist, saveWatchlist, searchCandidates, type HtsEntry,
} from "./data.js";
import { isLineError, resolveDuty, type Layer } from "./core/index.js";
import { FEES } from "./core/dataset.js";

const DISCLAIMER =
  "CANDIDATES/ESTIMATE ONLY — requires licensed customs broker review. Not customs or legal advice.";

const fmtLine = (e: HtsEntry) =>
  [
    `**${e.htsno}** — ${e.path}`,
    `  general (MFN): ${e.eff_general || "—"}${e.rate_inherited ? " (inherited from parent line)" : ""} | special (FTA): ${e.eff_special || "—"} | column 2: ${e.eff_other || "—"}`,
    e.units?.length ? `  units: ${e.units.join(", ")}` : "",
    `  source: https://hts.usitc.gov/search?query=${encodeURIComponent(e.htsno)} | classification rulings: https://rulings.cbp.gov/search?term=${encodeURIComponent(e.htsno.slice(0, 7))}`,
  ].filter(Boolean).join("\n");

/**
 * The single most dangerous failure mode of this data: the published schedule is
 * wrong in both directions at any given moment, and nothing in the text says so.
 * Provisions whose collection has stopped keep printing with no end date, and
 * newly proclaimed actions land in the schedule days late. Summing every adder_pct
 * therefore produces a number nobody is charged.
 */
const STACKING_WARNING =
  "DO NOT SUM every adder_pct below. The published schedule is routinely wrong in both directions: " +
  "(1) provisions whose collection has already stopped keep printing with no end date — IEEPA and " +
  "Section 122 headings are the recurring example, and only some dead headings carry a compiler_note; " +
  "(2) newly proclaimed actions appear in the schedule days after they take effect, so a line can look " +
  "complete and still be short. Treat these as CANDIDATES, read rule_verbatim and compiler_note, and " +
  "verify current collection status against CBP CSMS messages before relying on any stack.";

export function buildServer(): McpServer {
  const server = new McpServer({ name: "tariff-resolver", version: "1.1.0" });

  server.registerTool(
    "search_hs_candidates",
    {
      title: "Search HTS code candidates",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "Returns top 8-10 digit HTS code candidates (with MFN/FTA rates and CBP CROSS ruling links) for a product description. " +
        "Results are CANDIDATES for pre-broker screening, not a classification ruling. " +
        "IMPORTANT: the HTS uses legal terminology, not trade names — BEFORE CALLING, rewrite the product description " +
        "into HTS-style material + use nouns (e.g. 'pink kids backpack' → 'travel bags of man-made fibers'; " +
        "'water bottle' → 'vacuum flask' or 'bottle of plastics'). If you get 0 results, retry with 2-3 different phrasings.",
      inputSchema: {
        product_description: z.string().describe("Product description in English: material, use, composition (e.g. 'stainless steel insulated water bottle 500ml')"),
        limit: z.number().int().min(1).max(10).default(5).describe("Number of candidates"),
      },
    },
    async ({ product_description, limit }) => {
      const hits = searchCandidates(product_description, limit);
      const body = hits.length
        ? hits.map(fmtLine).join("\n\n")
        : "No candidates found — try simpler English material/use nouns (search is keyword-based over HTS text).";
      return {
        content: [{ type: "text", text: `${DISCLAIMER}\n\n${body}` }],
      };
    }
  );

  server.registerTool(
    "calculate_tariff_scenario",
    {
      title: "Calculate tariff scenario",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "Returns the HTS code's MFN/FTA base rate, ALL active chapter 99 rules (IEEPA/301/232 additional duties) matching " +
        "the origin as verbatim text, and MPF/HMF fees. The LLM should walk the chapter-99 exception chains itself to stack " +
        "the right duty layers, explain each step to the user, and always note this is an estimate.",
      inputSchema: {
        hts_code: z.string().describe("8-10 digit HTS code, with or without dots"),
        origin_country: z.string().describe("Country of origin (English name, e.g. 'China', 'Vietnam', 'Mexico')"),
        customs_value_usd: z.number().positive().describe("Customs value of the shipment (USD)"),
        ocean_freight: z.boolean().default(false).describe("Ocean shipment? (applies HMF)"),
        weight_kg: z.number().positive().optional().describe("Total weight (kg) — REQUIRED when the code carries a specific duty per kg (e.g. '12.4¢/kg')"),
        quantity: z.number().positive().optional().describe("Quantity in the code's units (No./Dz Pcs...) — needed for per-piece specific duties"),
      },
    },
    async ({ hts_code, origin_country, customs_value_usd, ocean_freight, weight_kg, quantity }) => {
      const r = resolveDuty(dataset, { hts: hts_code, origin: origin_country, value_usd: customs_value_usd, ocean: ocean_freight });
      if (isLineError(r)) {
        return { content: [{ type: "text", text: `${r.error.code}: ${r.error.message}` }] };
      }
      const base = findByCode(hts_code)[0];
      const bucket = (m: Layer["match"]) => r.layers.filter((l) => l.match === m);
      const structured = {
        ...r,
        disclaimer:
          DISCLAIMER +
          " ⚠️ ESTIMATE EXCLUDES Anti-Dumping/Countervailing Duties (AD/CVD) — issued by US DOC, NOT in the HTS file. " +
          "AD/CVD can exceed 200% on goods like steel, aluminum, mattresses, solar, plywood from CN/VN. " +
          "Check https://www.trade.gov/us-antidumping-and-countervailing-duty-case-information before relying on this estimate.",
        hts_revision: DATASET_INFO.fetched_at,
        // ---- 1.0.x compatibility fields (kept so existing clients do not break) ----
        base_line: {
          htsno: r.hts.code, description_path: r.hts.description,
          general_mfn: { text: r.base.mfn_text, pct: r.base.mfn_pct, inherited_from_parent: r.base.inherited_from_parent },
          special_fta: r.base.special_fta, column2: r.base.column2,
          other_candidate_lines: r.hts.other_candidate_lines,
        },
        ch99_additional_duties: {
          note: "The rules below are CANDIDATES (headings the schedule itself marks as dead are filtered out; headings that cite other chapters are dropped and counted). LLM: read rule_verbatim — the 'Except for...' chains decide which rule applies; adder_pct is pre-parsed, do NOT invent numbers.",
          stacking_warning: STACKING_WARNING,
          schedule_snapshot_date: r.schedule.snapshot_date,
          overrides_version: r.schedule.overrides_version,
          terminated_rules_excluded: r.excluded.terminated,
          chapter_mismatch_excluded: r.excluded.chapter_mismatch,
          linked_by_footnote: bucket("footnote"),
          matched_by_origin_name: bucket("origin_name"),
          universal_all_countries: bucket("universal"),
          possibly_expired: r.possibly_expired,
        },
        fixed_fees_usd: {
          mpf: r.fees_usd?.mpf ?? 0, mpf_note: FEES.mpf.note,
          hmf: r.fees_usd?.hmf ?? 0, hmf_applied: ocean_freight,
        },
        customs_value_usd,
        weight_kg: weight_kg ?? null,
        quantity: quantity ?? null,
        duty_units: base?.units ?? [],
        llm_guidance:
          "FIRST read ch99_additional_duties.stacking_warning — never total every adder_pct, and tell the user which layers you applied and which you left out and why. " +
          "Layers in possibly_expired are headings whose collection has stopped or expired according to the cited source; do not apply them unless the source is outdated. " +
          "confidence: enumerated = the schedule itself links this heading to the line; heuristic = matched by country wording; unknown = rate text could not be parsed. " +
          "landed duty ≈ customs_value × (base.mfn_pct + adder_pct of applicable layers)/100 + mpf + hmf. " +
          "If base.mfn_pct is null the rate is specific/compound (e.g. '12.4¢/kg + 2%') — weight_kg/quantity is needed to compute it; if the user hasn't provided them, ASK instead of guessing. " +
          "If the origin belongs to a program listed in special_fta, use the special rate instead of general. " +
          "Explain each layer, cite headings. Always note: estimate EXCLUDES AD/CVD and needs broker confirmation. " +
          `Cross-check source: https://hts.usitc.gov/search?query=${encodeURIComponent(r.hts.code)}`,
      };
      return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }] };
    }
  );

  server.registerTool(
    "watch_tariff_changes",
    {
      title: "Watch HTS codes for tariff changes",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      description:
        "Saves HTS codes (with optional origin) to a local watchlist. After each dataset refresh, call check_tariff_updates " +
        "to see whether the rates on these codes changed. This is how you track 2025-2026 tariff volatility without manual re-checking.",
      inputSchema: {
        hts_codes: z.array(z.string()).min(1).max(200).describe("8-10 digit HTS codes to watch"),
        origin_country: z.string().optional().describe("Shared origin for the shipment (optional)"),
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
        content: [{ type: "text", text: `Now watching ${added.length} new code(s) (unknown/already-watched codes skipped). Watchlist total: ${list.length} code(s). Call check_tariff_updates after each dataset refresh.` }],
      };
    }
  );

  server.registerTool(
    "check_tariff_updates",
    {
      title: "Check tariff changes between revisions",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description:
        "Compares the current HTS snapshot with the previously fetched one. Call without codes to check the whole watchlist. " +
        "Returns each change: code, column (general/special/other/additionalDuties), old → new value.",
      inputSchema: {
        hts_codes: z.array(z.string()).optional().describe("Limit to these codes (default: the watchlist)"),
      },
    },
    async ({ hts_codes }) => {
      const codes = hts_codes?.length ? hts_codes : loadWatchlist().map((w) => w.hts_code);
      const res = diffRates(codes.length ? codes : undefined);
      if (!res) {
        return { content: [{ type: "text", text: `No previous dataset to compare against (single fetch so far — ${DATASET_INFO.fetched_at}). Re-run scripts/fetch_hts.py at the next update.` }] };
      }
      const head = `Comparing ${res.prev_date} → ${DATASET_INFO.fetched_at}` + (codes.length ? ` (scope: ${codes.length} code(s))` : " (entire HTS)");
      const body = res.changes.length
        ? res.changes.slice(0, 100).map((c) => `- **${c.htsno}** [${c.field}]: "${c.old}" → "${c.new}"`).join("\n") +
          (res.changes.length > 100 ? `\n…and ${res.changes.length - 100} more change(s)` : "")
        : "No changes for this scope.";
      return { content: [{ type: "text", text: `${head}\n\n${body}` }] };
    }
  );

  server.registerTool(
    "dataset_info",
    {
      title: "Dataset info",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "Fetch date, source, license, row counts — use to check data freshness.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(DATASET_INFO, null, 2) }],
    })
  );

  return server;
}
