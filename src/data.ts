/**
 * Node loader for the bundled dataset. All duty logic lives in ./core (pure);
 * this file only reads files, builds the dataset once, and re-exports bound helpers
 * so existing imports (`import * as data from "./data.js"`) keep working.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as core from "./core/index.js";
import type { Dump, HtsEntry, Overrides } from "./core/types.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_FILE = process.env.HTS_DATA_FILE ?? join(ROOT, "data", "hts_full.json");
const OVERRIDES_FILE = process.env.HTS_OVERRIDES_FILE ?? join(ROOT, "data", "status_overrides.json");

const dump: Dump = JSON.parse(readFileSync(DATA_FILE, "utf8"));
let overrides: Overrides = core.EMPTY_OVERRIDES;
try { overrides = JSON.parse(readFileSync(OVERRIDES_FILE, "utf8")); } catch { /* optional file */ }

export const dataset = core.buildDataset(dump, overrides);
export const entries = dataset.entries;
export const rateLines = dataset.rateLines;
export const ch99 = dataset.ch99;

export const searchCandidates = (q: string, limit?: number) => core.searchCandidates(dataset, q, limit);
export const findByCode = (code: string) => core.findByCode(dataset, code);
export const ch99ForOrigin = (origin: string, limit?: number) => core.ch99ForOrigin(dataset, origin, limit);
export const ch99Universal = (limit?: number) => core.ch99Universal(dataset, limit);
export const ch99FromFootnotes = (e: HtsEntry) => core.ch99FromFootnotes(dataset, e);
export { compilerNote, parseAdderPct, parseRatePct, FEES } from "./core/dataset.js";
export type { HtsRow, HtsEntry } from "./core/types.js";

// ---- Watchlist + diff between two fetches (need fs; stay here) ----
const WATCHLIST_FILE = process.env.HTS_WATCHLIST_FILE ?? join(ROOT, "data", "watchlist.json");
export type WatchItem = { hts_code: string; origin?: string; added: string };
export function loadWatchlist(): WatchItem[] {
  try { return JSON.parse(readFileSync(WATCHLIST_FILE, "utf8")); } catch { return []; }
}
export function saveWatchlist(items: WatchItem[]): void {
  writeFileSync(WATCHLIST_FILE, JSON.stringify(items, null, 2));
}
export type RateChange = { htsno: string; field: string; old: string; new: string };
export function diffRates(codes?: string[]): { prev_date: string; changes: RateChange[] } | null {
  let prev: Dump;
  try { prev = JSON.parse(readFileSync(join(ROOT, "data", "hts_full.prev.json"), "utf8")); } catch { return null; }
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
  for (const [h, p] of prevMap) {
    if (!curSet.has(h) && inScope(h)) changes.push({ htsno: h, field: "(line removed)", old: p.general || p.description?.slice(0, 60) || "", new: "" });
  }
  return { prev_date: prev.fetched_at, changes };
}

// Kept in the shape the current build ships: no `overrides_version` field yet (the
// brief's printed version adds one, but overrides are still always EMPTY_OVERRIDES
// at this point in the refactor — see task-1-report.md for why this was left out).
export const DATASET_INFO = {
  fetched_at: dataset.fetched_at,
  source: dataset.source,
  license: dataset.license,
  total_rows: entries.length,
  rate_lines: rateLines.length,
  ch99_rules: ch99.length,
  data_file: DATA_FILE,
};
