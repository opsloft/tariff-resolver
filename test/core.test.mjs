import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
process.env.HTS_DATA_FILE = join(HERE, "fixtures", "hts_small.json");
process.env.HTS_OVERRIDES_FILE = join(HERE, "fixtures", "overrides_small.json");

const core = await import("../dist/core/index.js");
const data = await import("../dist/data.js");

test("normalizeOrigin: ISO-2, names, aliases, unknown", () => {
  assert.deepEqual(core.normalizeOrigin("CN"), { name: "China", needles: ["china", "hong kong", "macau"] });
  assert.deepEqual(core.normalizeOrigin("vn"), { name: "Vietnam", needles: ["vietnam", "viet nam"] });
  assert.deepEqual(core.normalizeOrigin("Mexico"), { name: "Mexico", needles: ["mexico"] });
  assert.deepEqual(core.normalizeOrigin("  South Korea "), { name: "South Korea", needles: ["korea"] });
  assert.deepEqual(core.normalizeOrigin("mexico"), { name: "Mexico", needles: ["mexico"] });
  assert.deepEqual(core.normalizeOrigin("SOUTH KOREA"), { name: "South Korea", needles: ["korea"] });
  assert.deepEqual(core.normalizeOrigin("PT"), { name: "Portugal", needles: ["portugal"] });
  assert.deepEqual(core.normalizeOrigin("UK"), { name: "United Kingdom", needles: ["united kingdom", "uk"] });
  assert.deepEqual(core.normalizeOrigin("US"), { name: "United States", needles: ["united states"] });
  assert.ok(core.normalizeOrigin("T\u00fcrkiye").needles.includes("turkey"));
  assert.equal(core.normalizeOrigin("ZZ"), null);
  assert.equal(core.normalizeOrigin(""), null);
});

test("normalizeOrigin: alternative spellings resolve, misspellings are rejected", () => {
  assert.equal(core.normalizeOrigin("Chnia"), null, "a misspelling must not pass through as its own origin");
  assert.equal(core.normalizeOrigin("Freedonia"), null);
  assert.equal(core.normalizeOrigin("x"), null);
  assert.deepEqual(core.normalizeOrigin("PRC"), { name: "China", needles: ["china", "hong kong", "macau"] });
  assert.deepEqual(core.normalizeOrigin("Viet Nam"), { name: "Vietnam", needles: ["vietnam", "viet nam"] });
  assert.equal(core.normalizeOrigin("USA").name, "United States");
  assert.equal(core.normalizeOrigin("England").name, "United Kingdom");
  assert.equal(core.normalizeOrigin("Great Britain").name, "United Kingdom");
  assert.equal(core.normalizeOrigin("Myanmar").name, "Burma");
  assert.equal(core.normalizeOrigin("Czechia").name, "Czech Republic");
  assert.equal(core.normalizeOrigin("Holland").name, "Netherlands");
  assert.equal(core.normalizeOrigin("UAE").name, "United Arab Emirates");
  assert.equal(core.normalizeOrigin("Russian Federation").name, "Russia");
  assert.equal(core.normalizeOrigin("Korea").name, "South Korea");
  assert.equal(core.normalizeOrigin("C\u00f4te d'Ivoire").name, "Ivory Coast");
  assert.equal(core.normalizeOrigin("Taiwan").name, "Taiwan");
});

test("normalizeOrigin: never throws on non-string input", () => {
  for (const bad of [undefined, null, 42, {}, [], true, Symbol.iterator]) {
    assert.equal(core.normalizeOrigin(bad), null, `normalizeOrigin(${String(bad)}) must be null`);
  }
});

test("normalizeOrigin: needles cover the wording the schedule actually uses", () => {
  // the schedule writes "the Russian Federation", never the bare country name
  assert.deepEqual(core.normalizeOrigin("RU"), { name: "Russia", needles: ["russia", "russian federation"] });
  assert.deepEqual(core.normalizeOrigin("Russian Federation").needles, ["russia", "russian federation"]);
  // ... and "C\u00f4te d'Ivoire", never "Ivory Coast"
  assert.deepEqual(core.normalizeOrigin("CI"), { name: "Ivory Coast", needles: ["ivory coast", "c\u00f4te d'ivoire"] });
  // a curly apostrophe in the input must still resolve
  assert.equal(core.normalizeOrigin("C\u00f4te d\u2019Ivoire").name, "Ivory Coast");
});

test("citedPrefixes: subheadings, ranges, chapters; ignores 99xx and note references", () => {
  const tires = data.entries.find((e) => e.htsno === "9903.40.05").path;
  assert.deepEqual(core.citedPrefixes(tires).sort(), ["40111010", "40112010"]);
  const ieepa = data.entries.find((e) => e.htsno === "9903.01.25").path;
  assert.deepEqual(core.citedPrefixes(ieepa), []);
  assert.deepEqual(core.citedPrefixes("articles of chapter 87, as provided for in U.S. note 2(s)").sort(), ["87"]);
  assert.deepEqual(core.citedPrefixes("products of headings 7208 through 7211").sort(), ["7208", "7209", "7210", "7211"]);
  assert.deepEqual(core.citedPrefixes("subheadings enumerated in U.S. note 20(b) to this subchapter"), []);
  assert.deepEqual(core.citedPrefixes("subheadings 8471.30.01 through 8471.30.04").sort(), ["84713001", "84713002", "84713003", "84713004"]);
  assert.deepEqual(core.citedPrefixes("articles of chapters 84 through 86").sort(), ["84", "85", "86"]);
  assert.deepEqual(core.citedPrefixes("headings 7211 through 7208").sort(), ["7208", "7211"]);
  // a range too wide to enumerate falls back to the endpoints' shared prefix, never a truncated head
  const wide = core.citedPrefixes("subheadings 8471.30.01 through 8471.60.02");
  assert.ok(wide.includes("8471") && wide.includes("84713001") && wide.includes("84716002"), JSON.stringify(wide));
  assert.ok(wide.length <= 3, `wide range should not enumerate: ${JSON.stringify(wide)}`);
});

test("citedPrefixes: a range whose endpoints share no digit covers everything between them", () => {
  const text = "headings 0101.00.00 through 9503.00.00";
  const cited = core.citedPrefixes(text);
  assert.ok(!cited.includes(""), "the everything-sentinel must never leak to callers");
  assert.ok(cited.includes("01010000") && cited.includes("95030000"), JSON.stringify(cited));
  // the heading cites the whole schedule, so nothing inside the range may be excluded
  assert.equal(core.chapterMismatch(text, "61091000"), false);
  assert.equal(core.chapterMismatch(text, "01010000"), false);
  assert.equal(core.chapterMismatch("chapters 1 through 97", "61091000"), false);
});

test("chapterMismatch: cited-but-different drops, cited-and-matching keeps, uncited keeps", () => {
  const tires = data.entries.find((e) => e.htsno === "9903.40.05").path;
  assert.equal(core.chapterMismatch(tires, "61091000"), true);
  assert.equal(core.chapterMismatch(tires, "40111010"), false);
  assert.equal(core.chapterMismatch("articles of chapter 61", "61091000"), false);
  assert.equal(core.chapterMismatch(data.entries.find((e) => e.htsno === "9903.01.25").path, "61091000"), false);
});

test("findOverride: longest matching prefix wins; null when nothing matches", () => {
  const ov = data.dataset.overrides;
  assert.equal(ov.version, "fixture-2026-09-04");
  assert.equal(core.findOverride(ov, "9903.01.25").status, "expired");
  assert.equal(core.findOverride(ov, "9903.01.20").status, "collection_stopped");
  assert.equal(core.findOverride(ov, "9903.88.15"), null);
  assert.equal(core.findOverride({ version: "x", entries: [] }, "9903.01.25"), null);
});

const ds = data.dataset;

test("resolveDuty: happy path on the fixture (cotton tee from China)", () => {
  const r = core.resolveDuty(ds, { id: "L1", hts: "6109.10.00", origin: "CN", value_usd: 10000, ocean: true });
  assert.ok(!core.isLineError(r));
  assert.equal(r.id, "L1");
  assert.equal(r.hts.code, "6109.10.00");
  // special_fta / column2 are the schedule's own columns, passed through verbatim; eligibility is the consumer's call
  assert.deepEqual(r.base, { mfn_pct: 16.5, mfn_text: "16.5%", special_fta: "Free (AU,BH,CL)", column2: "90%", inherited_from_parent: false });
  assert.deepEqual(r.fees_usd, { mpf: 34.64, hmf: 12.5, hmf_applied: true, fee_year: "FY2026" });
  const byHeading = Object.fromEntries(r.layers.map((l) => [l.heading, l]));
  // footnote-linked → enumerated
  assert.equal(byHeading["9903.88.15"].match, "footnote");
  assert.equal(byHeading["9903.88.15"].confidence, "enumerated");
  assert.equal(byHeading["9903.88.15"].adder_pct, 7.5);
  // origin-name → heuristic
  assert.equal(byHeading["9903.88.03"].match, "origin_name");
  assert.equal(byHeading["9903.88.03"].confidence, "heuristic");
  // unparsable rate → unknown
  assert.equal(byHeading["9903.05.31"].confidence, "unknown");
  assert.equal(byHeading["9903.05.31"].adder_pct, null);
  // chapter filter: tire heading (cites 4011.*) must not appear anywhere
  assert.ok(!("9903.40.05" in byHeading));
  assert.ok(!r.possibly_expired.some((l) => l.heading === "9903.40.05"));
  assert.equal(r.excluded.chapter_mismatch, 1);
  // overrides: 9903.01.25 moves to possibly_expired with the fixture's most specific entry
  assert.ok(!("9903.01.25" in byHeading));
  const exp = r.possibly_expired.find((l) => l.heading === "9903.01.25");
  assert.equal(exp.status, "expired");
  assert.equal(exp.match, "universal");
  assert.match(exp.reason, /more specific/);
  assert.equal(exp.as_of, "2026-03-01");
  // terminated headings are counted, never listed
  assert.ok(r.excluded.terminated >= 1);
  assert.deepEqual(r.schedule, { snapshot_date: "2026-08-18", overrides_version: "fixture-2026-09-04" });
  assert.deepEqual(r.warnings, ["do_not_sum_layers", "excludes_ad_cvd"]);
  assert.match(r.disclaimer, /not customs advice/i);
});

test("resolveDuty: fees are null without value_usd; hmf 0 when not ocean", () => {
  const a = core.resolveDuty(ds, { hts: "6109.10.00", origin: "China" });
  assert.equal(a.fees_usd, null);
  const b = core.resolveDuty(ds, { hts: "6109.10.00", origin: "China", value_usd: 100 });
  assert.deepEqual(b.fees_usd, { mpf: 33.58, hmf: 0, hmf_applied: false, fee_year: "FY2026" });
});

test("resolveDuty: error lines carry the id and never throw", () => {
  assert.deepEqual(core.resolveDuty(ds, { id: "x", hts: "0000.00.00", origin: "CN" }),
    { id: "x", error: { code: "HTS_NOT_FOUND", message: "HTS 0000.00.00 is not in the schedule snapshot 2026-08-18" } });
  assert.equal(core.resolveDuty(ds, { hts: "6109.10.00", origin: "ZZ" }).error.code, "ORIGIN_UNKNOWN");
  const misspelled = core.resolveDuty(ds, { hts: "6109.10.00", origin: "Chnia" });
  assert.equal(misspelled.error.code, "ORIGIN_UNKNOWN");
  assert.equal(misspelled.error.message,
    'Unrecognized origin "Chnia" \u2014 use an ISO-3166 alpha-2 code (e.g. "CN") or an English country name');
  assert.equal(core.resolveDuty(ds, { hts: 42, origin: "CN" }).error.code, "INVALID_LINE");
  assert.equal(core.resolveDuty(ds, null).error.code, "INVALID_LINE");
  assert.ok(core.isLineError(core.resolveDuty(ds, null)));
});

test("resolveDuty: Vietnam sees its own heading and no China layers", () => {
  const r = core.resolveDuty(ds, { hts: "6109.10.00", origin: "VN" });
  const headings = r.layers.map((l) => l.heading);
  assert.ok(headings.includes("9903.02.69"));
  assert.ok(!headings.includes("9903.88.03"));
  // footnote link is not origin-specific: the schedule's own "See 9903.88.15." still surfaces
  assert.ok(headings.includes("9903.88.15"));
});

test("ch99UniversalAll: unlimited by default (includes dead headings), limit still works", () => {
  const all = core.ch99UniversalAll(ds).map((e) => e.htsno).sort();
  assert.deepEqual(all, ["9903.01.25", "9903.72.01", "9903.72.02"]);
  assert.equal(core.ch99UniversalAll(ds, 2).length, 2);
});

test("real status_overrides.json: valid schema and every entry has a URL source", async () => {
  const { readFileSync } = await import("node:fs");
  const real = JSON.parse(readFileSync(join(HERE, "..", "data", "status_overrides.json"), "utf8"));
  assert.match(real.version, /^\d{4}-\d{2}-\d{2}$/);
  for (const e of real.entries) {
    assert.match(e.match, /^99\d{2}\.\d{2}(\.\d{1,2})?$|^99\d{2}\.\d{2}\.\d$|^99\d{2}\.\d{2}\.\d{2}$/);
    assert.ok(["collection_stopped", "expired", "suspended"].includes(e.status));
    assert.ok(e.reason.length > 20);
    assert.match(e.source, /^https:\/\/(www\.)?(cbp\.gov|content\.govdelivery\.com|federalregister\.gov|hts\.usitc\.gov|usitc\.gov)\//);
    assert.match(e.as_of, /^\d{4}-\d{2}-\d{2}$/);
  }
});
