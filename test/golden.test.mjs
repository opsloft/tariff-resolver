import { test } from "node:test";
import assert from "node:assert/strict";

const core = await import("../dist/core/index.js");
const { dataset } = await import("../dist/data.js");

const PAIRS = [
  { id: "tee", hts: "6109.10.00", origin: "CN", value_usd: 10000, ocean: true },
  { id: "bag", hts: "4202.92.31", origin: "VN", value_usd: 10000, ocean: true },
  { id: "toy", hts: "9503.00.00", origin: "CN", value_usd: 10000, ocean: true },
];

const shapeOf = (v) =>
  Array.isArray(v) ? [v.length ? shapeOf(v[0]) : "empty"] :
  v === null ? "null" :
  typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shapeOf(v[k])])) :
  typeof v;

// The contract a downstream consumer reads: keys and types are frozen; values move with the schedule.
const EXPECTED_SHAPE = {
  base: { column2: "string", inherited_from_parent: "boolean", mfn_pct: "number", mfn_text: "string", special_fta: "string" },
  disclaimer: "string",
  excluded: { chapter_mismatch: "number", terminated: "number" },
  fees_usd: { fee_year: "string", hmf: "number", hmf_applied: "boolean", mpf: "number" },
  hts: { code: "string", description: "string", other_candidate_lines: ["empty"] },
  id: "string",
  layers: [{ adder_pct: "number", compiler_note: "null", confidence: "string", heading: "string", match: "string", rate_text: "string", rule_verbatim: "string" }],
  possibly_expired: [{ adder_pct: "number", as_of: "string", compiler_note: "null", confidence: "string", heading: "string", match: "string", rate_text: "string", reason: "string", rule_verbatim: "string", source: "string", status: "string" }],
  schedule: { overrides_version: "string", snapshot_date: "string" },
  warnings: ["string"],
};

test("golden: the three reference pairs resolve with the frozen shape", () => {
  for (const p of PAIRS) {
    const r = core.resolveDuty(dataset, p);
    assert.ok(!core.isLineError(r), `${p.id}: ${JSON.stringify(r)}`);
    const s = shapeOf(r);
    // fields whose *value* legitimately varies by line are normalised before comparing
    s.base.special_fta = "string"; s.base.column2 = "string";
    if (s.layers[0]) { s.layers[0].adder_pct = "number"; s.layers[0].compiler_note = "null"; }
    if (s.possibly_expired[0]) { s.possibly_expired[0].adder_pct = "number"; s.possibly_expired[0].compiler_note = "null"; }
    s.hts.other_candidate_lines = ["empty"];
    assert.deepEqual(s, EXPECTED_SHAPE, `${p.id} shape drifted`);
  }
});

test("golden: known values on the current snapshot", () => {
  const tee = core.resolveDuty(dataset, PAIRS[0]);
  assert.equal(tee.base.mfn_pct, 16.5);
  assert.ok(tee.layers.some((l) => l.heading === "9903.88.15"), "Section 301 list 4A heading must be a candidate for cotton tees from China");
  assert.ok(tee.layers.some((l) => l.heading.startsWith("9903.91.")), "Section 301 four-year-review headings must not be truncated off a China line");
  assert.ok(!tee.layers.some((l) => l.heading.startsWith("9903.40")), "tire headings must be chapter-filtered off a tee line");
  assert.equal(tee.schedule.snapshot_date, dataset.fetched_at);
  assert.ok(tee.possibly_expired.length > 0, "IEEPA/Section 122 overrides must populate possibly_expired on the current snapshot");
  assert.ok(tee.possibly_expired.every((l) => ["collection_stopped", "expired", "suspended"].includes(l.status)));
  const bag = core.resolveDuty(dataset, PAIRS[1]);
  assert.equal(bag.base.mfn_pct, 17.6);
  assert.ok(bag.layers.some((l) => l.heading === "9903.02.69") || bag.possibly_expired.some((l) => l.heading === "9903.02.69"));
  const toy = core.resolveDuty(dataset, PAIRS[2]);
  assert.equal(toy.base.mfn_pct, 0);
});

test("golden: Russia matches the schedule's \"Russian Federation\" wording", () => {
  const r = core.resolveDuty(dataset, { hts: "7326.90.86", origin: "RU" });
  assert.ok(!core.isLineError(r), JSON.stringify(r));
  const headings = [...r.layers, ...r.possibly_expired].map((l) => l.heading);
  assert.ok(headings.includes("9903.82.14"), `Section 232 steel heading missing: ${JSON.stringify(headings)}`);
});

test("golden: C\u00f4te d'Ivoire is found whichever apostrophe the schedule prints", () => {
  assert.ok(core.ch99ForOrigin(dataset, "CI", Infinity).length >= 2);
});

// A floor against silent needle-table regressions: these are the Chapter 99 headings each origin
// name matches on the bundled snapshot, before the chapter filter. Update deliberately when the
// schedule or the needle tables change.
const ORIGIN_CANDIDATES = {
  CN: 94, VN: 3, RU: 9, GB: 50, KR: 42, JP: 26, MX: 32, CA: 40, IN: 9, TR: 2, BR: 19, US: 118,
};

test("golden: origin-name candidate counts on the current snapshot", () => {
  const got = Object.fromEntries(
    Object.keys(ORIGIN_CANDIDATES).map((c) => [c, core.ch99ForOrigin(dataset, c, Infinity).length])
  );
  assert.deepEqual(got, ORIGIN_CANDIDATES);
});

test("golden: a misspelled origin is an error, never a thinner stack", () => {
  const bad = core.resolveDuty(dataset, { hts: "6109.10.00", origin: "Chnia" });
  assert.ok(core.isLineError(bad), `expected a LineError, got ${JSON.stringify(bad).slice(0, 200)}`);
  assert.equal(bad.error.code, "ORIGIN_UNKNOWN");
});
