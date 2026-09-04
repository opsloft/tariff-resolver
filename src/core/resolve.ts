/**
 * resolveDuty — one HTS code + origin → base rate, fixed fees, and every Chapter 99
 * candidate layer with its provenance. Never decides which layers stack; never sums.
 * This is the single function the MCP tool and the REST endpoint both call.
 */
import type { Confidence, Dataset, ExpiredLayer, HtsEntry, Layer, LineError, LineInput, LineResult, MatchKind } from "./types.js";
import { FEES, ch99ForNeedles, ch99FromFootnotes, ch99UniversalAll, compilerNote, findByCode, findOverride, parseAdderPct, parseRatePct } from "./dataset.js";
import { normalizeOrigin } from "./origin.js";
import { chapterMismatch, citedPrefixes } from "./chapter.js";

export const DISCLAIMER =
  "Screening estimates, not customs advice. Layers are candidates read from the published schedule; " +
  "verify collection status against CBP CSMS before relying on any stack. Excludes AD/CVD.";
export const WARNINGS: readonly string[] = Object.freeze(["do_not_sum_layers", "excludes_ad_cvd"]);

export function isLineError(x: LineResult | LineError): x is LineError {
  return (x as LineError).error !== undefined;
}

const err = (id: string | undefined, code: LineError["error"]["code"], message: string): LineError =>
  ({ ...(id !== undefined ? { id } : {}), error: { code, message } });

function toLayer(e: HtsEntry, match: MatchKind, codeDigits: string): Layer {
  const rate_text = e.eff_general || e.general || "(see description)";
  const adder = parseAdderPct(rate_text);
  const plain = parseRatePct(rate_text);
  let confidence: Confidence;
  if (adder === null && plain === null) confidence = "unknown";
  else if (match === "footnote" || citedPrefixes(e.path).some((p) => codeDigits.startsWith(p))) confidence = "enumerated";
  else confidence = "heuristic";
  return { heading: e.htsno, adder_pct: adder, rate_text, rule_verbatim: e.path, compiler_note: compilerNote(e), match, confidence };
}

export function resolveDuty(ds: Dataset, line: LineInput | null | undefined): LineResult | LineError {
  const id = line && typeof line === "object" && typeof line.id === "string" ? line.id : undefined;
  if (!line || typeof line !== "object" || typeof line.hts !== "string" || typeof line.origin !== "string") {
    return err(id, "INVALID_LINE", "Each line needs string fields hts and origin");
  }
  const origin = normalizeOrigin(line.origin);
  if (!origin) return err(id, "ORIGIN_UNKNOWN", `Unrecognized origin "${line.origin}" — use ISO-3166 alpha-2 or an English country name`);
  const lines = findByCode(ds, line.hts);
  if (!lines.length) return err(id, "HTS_NOT_FOUND", `HTS ${line.hts} is not in the schedule snapshot ${ds.fetched_at}`);

  const base = lines[0];
  const codeDigits = base.htsno.replace(/\D/g, "");

  // Candidate headings in precision order; first match kind wins per heading.
  const seen = new Set<string>();
  const cands: { e: HtsEntry; match: MatchKind }[] = [];
  const push = (e: HtsEntry, match: MatchKind) => { if (!seen.has(e.htsno)) { seen.add(e.htsno); cands.push({ e, match }); } };
  for (const l of lines) for (const e of ch99FromFootnotes(ds, l)) push(e, "footnote");
  for (const e of ch99ForNeedles(ds, origin.needles)) push(e, "origin_name");
  for (const e of ch99UniversalAll(ds)) push(e, "universal"); // unfiltered so dead headings are counted

  const layers: Layer[] = [];
  const possibly_expired: ExpiredLayer[] = [];
  let terminated = 0, chapter_mismatch = 0;
  for (const { e, match } of cands) {
    if (e.terminated) { terminated++; continue; }
    if (match !== "footnote" && chapterMismatch(e.path, codeDigits)) { chapter_mismatch++; continue; }
    const layer = toLayer(e, match, codeDigits);
    const ov = findOverride(ds.overrides, e.htsno);
    if (ov) possibly_expired.push({ ...layer, status: ov.status, reason: ov.reason, source: ov.source, as_of: ov.as_of });
    else layers.push(layer);
  }

  let fees_usd: LineResult["fees_usd"] = null;
  if (typeof line.value_usd === "number" && line.value_usd > 0) {
    const mpf = Math.min(Math.max(line.value_usd * FEES.mpf.rate, FEES.mpf.min_usd), FEES.mpf.max_usd);
    const hmf = line.ocean ? line.value_usd * FEES.hmf.rate : 0;
    fees_usd = { mpf: Number(mpf.toFixed(2)), hmf: Number(hmf.toFixed(2)), hmf_applied: !!line.ocean, fee_year: FEES.fee_year };
  }

  return {
    ...(id !== undefined ? { id } : {}),
    hts: { code: base.htsno, description: base.path, other_candidate_lines: lines.slice(1, 4).map((l) => l.htsno) },
    base: {
      mfn_pct: parseRatePct(base.eff_general || ""), mfn_text: base.eff_general || null,
      special_fta: base.eff_special || null, column2: base.eff_other || null, inherited_from_parent: base.rate_inherited,
    },
    fees_usd,
    layers,
    possibly_expired,
    excluded: { terminated, chapter_mismatch },
    schedule: { snapshot_date: ds.fetched_at, overrides_version: ds.overrides.version },
    warnings: [...WARNINGS],
    disclaimer: DISCLAIMER,
  };
}
