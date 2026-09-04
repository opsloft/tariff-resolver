/** Shared types for the pure duty-resolution core (no Node APIs here). */

export type HtsRow = {
  htsno: string; indent: string; description: string; superior: string | null;
  units: string[]; general: string; special: string; other: string;
  footnotes: { columns?: string[]; value?: string }[] | null;
  quotaQuantity: string | null; additionalDuties: string | null;
};

export type HtsEntry = HtsRow & {
  /** Full description joined with ancestors: "Umbrellas > Garden or similar umbrellas" */
  path: string;
  /** Effective rate: own, or inherited from the nearest rated parent (10-digit suffixes) */
  eff_general: string; eff_special: string; eff_other: string; rate_inherited: boolean;
  /** Chapter 99 heading the schedule itself marks as dead (terminated/suspended/expired) */
  terminated: boolean;
};

export type Dump = { fetched_at: string; source: string; license: string; rows: HtsRow[] };

export type OverrideStatus = "collection_stopped" | "expired" | "suspended";
export type OverrideEntry = {
  /** Heading prefix, e.g. "9903.01.2" matches 9903.01.20–9903.01.29 */
  match: string; status: OverrideStatus; reason: string; source: string; as_of: string;
};
export type Overrides = { version: string; entries: OverrideEntry[] };

export type Dataset = {
  fetched_at: string; source: string; license: string;
  entries: HtsEntry[]; rateLines: HtsEntry[]; ch99: HtsEntry[];
  overrides: Overrides;
};

export type LineInput = { id?: string; hts: string; origin: string; value_usd?: number; ocean?: boolean };

export type MatchKind = "footnote" | "origin_name" | "universal";
export type Confidence = "enumerated" | "heuristic" | "unknown";

export type Layer = {
  heading: string; adder_pct: number | null; rate_text: string; rule_verbatim: string;
  compiler_note: string | null; match: MatchKind; confidence: Confidence;
};
export type ExpiredLayer = Layer & { status: OverrideStatus; reason: string; source: string; as_of: string };

export type LineError = {
  id?: string;
  error: { code: "HTS_NOT_FOUND" | "ORIGIN_UNKNOWN" | "INVALID_LINE"; message: string };
};

export type LineResult = {
  id?: string;
  hts: { code: string; description: string; other_candidate_lines: string[] };
  base: { mfn_pct: number | null; mfn_text: string | null; special_fta: string | null; column2: string | null; inherited_from_parent: boolean };
  fees_usd: { mpf: number; hmf: number; hmf_applied: boolean; fee_year: string } | null;
  layers: Layer[];
  possibly_expired: ExpiredLayer[];
  excluded: { terminated: number; chapter_mismatch: number };
  schedule: { snapshot_date: string; overrides_version: string };
  warnings: string[];
  disclaimer: string;
};
