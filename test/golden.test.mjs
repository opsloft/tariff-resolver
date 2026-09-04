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

// The contract Stockyard reads: keys and types are frozen; values move with the schedule.
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

test("golden: the three Stockyard pairs resolve with the frozen shape", () => {
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
