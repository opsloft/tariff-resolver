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
