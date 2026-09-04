/**
 * Pure dataset core: builds the HTS hierarchy from a USITC dump and answers lookups.
 * No Node APIs — this file also runs inside a Cloudflare Worker bundle.
 */
import type { Dataset, Dump, HtsEntry, Overrides } from "./types.js";

// Matches the schedule's own "this heading is dead" markers (broadened in 1.0.3).
const TERMINATED_RX =
  /provision (?:is |was )?(?:terminated|suspended)|no longer in effect|provision has expired|expired at the close/i;

/** The bracketed "[Compiler's note: ...]" the USITC prints on some Chapter 99 headings. */
export function compilerNote(e: { path: string }): string | null {
  const m = e.path.match(/\[Compiler's note:\s*([^\]]+)\]/i);
  return m ? m[1].trim() : null;
}

export const EMPTY_OVERRIDES: Overrides = { version: "none", entries: [] };

export function buildDataset(dump: Dump, overrides: Overrides = EMPTY_OVERRIDES): Dataset {
  const entries: HtsEntry[] = [];
  type Frame = { indent: number; description: string; general: string; special: string; other: string };
  const stack: Frame[] = [];
  for (const r of dump.rows) {
    const ind = Number(r.indent || 0);
    while (stack.length && stack[stack.length - 1].indent >= ind) stack.pop();
    const path = [...stack.map((s) => s.description), r.description]
      .map((s) => (s ?? "").trim().replace(/:$/, ""))
      .filter(Boolean)
      .join(" > ");
    // Inherit rates only for statistical suffixes (>= 9 digits); an 8-digit line without
    // rates is a structural heading and must not inherit across heading levels.
    let eg = r.general || "", es = r.special || "", eo = r.other || "", inherited = false;
    if (!eg && (r.htsno || "").replace(/\D/g, "").length >= 9) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].general) { eg = stack[i].general; es = es || stack[i].special; eo = eo || stack[i].other; inherited = true; break; }
      }
    }
    entries.push({ ...r, path, eff_general: eg, eff_special: es, eff_other: eo, rate_inherited: inherited, terminated: TERMINATED_RX.test(path) });
    stack.push({ indent: ind, description: r.description ?? "", general: r.general || "", special: r.special || "", other: r.other || "" });
  }
  const rateLines = entries.filter((e) => e.htsno && e.htsno.replace(/\D/g, "").length >= 8 && !e.htsno.startsWith("99"));
  const ch99 = entries.filter((e) => e.htsno?.startsWith("99"));
  return { fetched_at: dump.fetched_at, source: dump.source, license: dump.license, entries, rateLines, ch99, overrides };
}

/** Keyword scoring over the full path; prefers 10-digit leaf lines on ties. */
export function searchCandidates(ds: Dataset, query: string, limit = 5): HtsEntry[] {
  const q = query.toLowerCase();
  const words = q.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  return ds.rateLines
    .map((e) => {
      const hay = e.path.toLowerCase();
      let score = 0;
      if (hay.includes(q)) score += 8;
      for (const w of words) if (hay.includes(w)) score += 1;
      if (e.htsno.replace(/\D/g, "").length >= 10) score += 0.5;
      return { e, score };
    })
    .filter((x) => x.score >= Math.min(2, words.length))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}

/** Exact digits match first, then prefix match (max 10). */
export function findByCode(ds: Dataset, code: string): HtsEntry[] {
  const digits = code.replace(/\D/g, "");
  if (!digits) return [];
  const exact = ds.rateLines.filter((e) => e.htsno.replace(/\D/g, "") === digits);
  if (exact.length) return exact;
  return ds.rateLines.filter((e) => e.htsno.replace(/\D/g, "").startsWith(digits)).slice(0, 10);
}

const ORIGIN_ALIASES: Record<string, string[]> = {
  china: ["china", "hong kong", "macau"],
  "united kingdom": ["united kingdom", "uk"],
  "south korea": ["korea"],
  vietnam: ["vietnam", "viet nam"],
};

/** Chapter 99 headings whose text names the origin (raw candidates; the caller decides). */
export function ch99ForOrigin(ds: Dataset, origin: string, limit = 25): HtsEntry[] {
  const o = origin.trim().toLowerCase();
  return ch99ForNeedles(ds, ORIGIN_ALIASES[o] ?? [o], limit);
}

export function ch99ForNeedles(ds: Dataset, needles: string[], limit = 25): HtsEntry[] {
  return ds.ch99.filter((e) => { const hay = e.path.toLowerCase(); return needles.some((n) => hay.includes(n)); }).slice(0, limit);
}

/** Headings that apply to every origin ("any country" wording), live only. */
export function ch99Universal(ds: Dataset, limit = 10): HtsEntry[] {
  const rx = /all countries|any country|from all|of any country/i;
  return ds.ch99.filter((e) => !e.terminated && rx.test(e.path)).slice(0, limit);
}

/** Headings referenced by the rate line's own footnotes ("See 9903.88.15.") — the precise link. */
export function ch99FromFootnotes(ds: Dataset, e: HtsEntry): HtsEntry[] {
  const refs = new Set<string>();
  for (const f of e.footnotes ?? []) for (const m of (f.value ?? "").matchAll(/99\d{2}\.\d{2}(?:\.\d{2})?/g)) refs.add(m[0]);
  if (!refs.size) return [];
  return ds.ch99.filter((c) => [...refs].some((r) => c.htsno.startsWith(r)));
}

/** "+ 25%" inside a Chapter 99 rule -> 25; null when the rule has another shape. */
export const parseAdderPct = (rule: string): number | null => {
  const m = rule.match(/\+\s*([\d.]+)\s*%/);
  return m ? Number(m[1]) : null;
};
/** "7.2%" -> 7.2; "Free" -> 0; null for specific/compound duties ("12.4¢/kg"). */
export const parseRatePct = (rate: string): number | null => {
  if (/^free$/i.test(rate.trim())) return 0;
  const m = rate.trim().match(/^([\d.]+)\s*%$/);
  return m ? Number(m[1]) : null;
};

/** Fixed US import fees — CBP's published FY2026 figures (Oct 2025 – Sep 2026). */
export const FEES = {
  fee_year: "FY2026",
  mpf: { rate: 0.003464, min_usd: 33.58, max_usd: 651.5, note: "Merchandise Processing Fee FY2026 — verify current min/max at cbp.gov before final decisions" },
  hmf: { rate: 0.00125, note: "Harbor Maintenance Fee — ocean shipments only, no min/max" },
};
