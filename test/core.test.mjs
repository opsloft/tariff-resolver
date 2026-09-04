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
  assert.equal(core.normalizeOrigin("ZZ"), null);
  assert.equal(core.normalizeOrigin(""), null);
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
});

test("chapterMismatch: cited-but-different drops, cited-and-matching keeps, uncited keeps", () => {
  const tires = data.entries.find((e) => e.htsno === "9903.40.05").path;
  assert.equal(core.chapterMismatch(tires, "61091000"), true);
  assert.equal(core.chapterMismatch(tires, "40111010"), false);
  assert.equal(core.chapterMismatch("articles of chapter 61", "61091000"), false);
  assert.equal(core.chapterMismatch(data.entries.find((e) => e.htsno === "9903.01.25").path, "61091000"), false);
});
