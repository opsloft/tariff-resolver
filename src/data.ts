/**
 * Data layer: loads the full HTS snapshot (USITC, public domain) from data/hts_full.json.
 *
 * The HTS is a hierarchy encoded by `indent`: a leaf line's description is only
 * complete when joined with its ancestor chain (e.g. "Umbrellas > Garden or similar
 * umbrellas"). We build a `path` for every line with an indent stack at load time.
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
  /** Effective rate: the line's own, or inherited from the nearest parent rate line (10-digit statistical suffixes are usually blank) */
  eff_general: string; eff_special: string; eff_other: string; rate_inherited: boolean;
  /** Chapter 99 rule that is no longer in force (compiler's note: provision terminated) */
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
    // Inherit rates from the nearest rated ancestor — ONLY for statistical suffixes
    // (>= 9 digits): an 8-digit line without rates is a structural heading, and
    // inheriting across heading levels would assign the wrong rate.
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

/** "Rateable" lines: HTS code of >= 8 digits with a non-empty general rate column. */
export const rateLines: HtsEntry[] = entries.filter(
  (e) => e.htsno && e.htsno.replace(/\D/g, "").length >= 8 && !e.htsno.startsWith("99")
);

/** Chapter 99: additional duties (IEEPA, Section 301, 232, ...) as raw rules. */
export const ch99: HtsEntry[] = entries.filter((e) => e.htsno?.startsWith("99"));

/** Find HS code candidates for a product description — keyword scoring over the full path. */
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
      // prefer 10-digit leaf lines (statistical suffixes) over 8-digit headings
      if (e.htsno.replace(/\D/g, "").length >= 10) score += 0.5;
      return { e, score };
    })
    .filter((x) => x.score >= Math.min(2, words.length))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.e);
}

/** Look up rate lines by code (10-digit, 8-digit, or prefix). */
export function findByCode(code: string): HtsEntry[] {
  const digits = code.replace(/\D/g, "");
  if (!digits) return [];
  const exact = rateLines.filter((e) => e.htsno.replace(/\D/g, "") === digits);
  if (exact.length) return exact;
  // prefix match on the digits-only string — immune to any input formatting
  return rateLines.filter((e) => e.htsno.replace(/\D/g, "").startsWith(digits)).slice(0, 10);
}

/**
 * Chapter 99 rules potentially relevant to an origin: country-name match in the path.
 * Deliberately does NOT decide which rule wins — returns raw rules so the LLM client
 * can read the exception chains.
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

/** Chapter 99 rules that apply to EVERY origin ("all countries"/"any country") — always returned so none are missed. */
export function ch99Universal(limit = 10): HtsEntry[] {
  const rx = /all countries|any country|from all|of any country/i;
  return ch99.filter((e) => !e.terminated && rx.test(e.path)).slice(0, limit);
}

/** "+ 25%" inside a chapter-99 rule -> 25; null when unparsable (other rule shapes). */
export const parseAdderPct = (rule: string): number | null => {
  const m = rule.match(/\+\s*([\d.]+)\s*%/);
  return m ? Number(m[1]) : null;
};
/** "7.2%" -> 7.2; null for specific duties ("12.4¢/kg"); "Free" -> 0. */
export const parseRatePct = (rate: string): number | null => {
  if (/^free$/i.test(rate.trim())) return 0;
  const m = rate.trim().match(/^([\d.]+)\s*%$/);
  return m ? Number(m[1]) : null;
};

/** Fixed US import fees — CBP's published formulas, adjusted annually. */
export const FEES = {
  mpf: { rate: 0.003464, min_usd: 33.58, max_usd: 651.5, note: "Merchandise Processing Fee FY2025 — verify current min/max at cbp.gov before final decisions" },
  hmf: { rate: 0.00125, note: "Harbor Maintenance Fee — ocean shipments only, no min/max" },
};

/** Chapter 99 rules referenced by the rate line's own footnotes ("See 9903.88.03.") — more precise than country-name matching. */
export function ch99FromFootnotes(e: HtsEntry): HtsEntry[] {
  const refs = new Set<string>();
  for (const f of e.footnotes ?? []) {
    for (const m of (f.value ?? "").matchAll(/99\d{2}\.\d{2}(?:\.\d{2})?/g)) refs.add(m[0]);
  }
  if (!refs.size) return [];
  return ch99.filter((c) => [...refs].some((r) => c.htsno.startsWith(r)));
}

// ---- Watchlist + diff between two fetches (the change-tracking axis) ----

const WATCHLIST_FILE = process.env.HTS_WATCHLIST_FILE ?? join(ROOT, "data", "watchlist.json");
export type WatchItem = { hts_code: string; origin?: string; added: string };

export function loadWatchlist(): WatchItem[] {
  try { return JSON.parse(readFileSync(WATCHLIST_FILE, "utf8")); } catch { return []; }
}
export function saveWatchlist(items: WatchItem[]): void {
  writeFileSync(WATCHLIST_FILE, JSON.stringify(items, null, 2));
}

export type RateChange = { htsno: string; field: string; old: string; new: string };

/** Compare the current snapshot with the previous fetch (hts_full.prev.json). null = no earlier baseline. */
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
    if (!p) { changes.push({ htsno: r.htsno, field: "(new line)", old: "", new: r.general || r.description?.slice(0, 60) || "" }); continue; }
    for (const f of FIELDS) {
      const a = (p[f] ?? "") || ""; const b = (r[f] ?? "") || "";
      if (a !== b) changes.push({ htsno: r.htsno, field: f, old: String(a), new: String(b) });
    }
  }
  // lines REMOVED from the HTS — every bit as important as changed rates
  for (const [h, p] of prevMap) {
    if (!curSet.has(h) && inScope(h))
      changes.push({ htsno: h, field: "(line removed)", old: p.general || p.description?.slice(0, 60) || "", new: "" });
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
