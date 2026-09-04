import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, unlinkSync, existsSync, readFileSync } from "node:fs";

// data.js reads these env vars at module load — set them BEFORE the dynamic import.
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "hts_small.json");
const WATCHLIST = join(tmpdir(), `tariff-resolver-watchlist-${process.pid}.json`);
process.env.HTS_DATA_FILE = FIXTURE;
process.env.HTS_WATCHLIST_FILE = WATCHLIST;

const data = await import("../dist/data.js");
const ROOT = dirname(dirname(fileURLToPath(new URL("../dist/data.js", import.meta.url))));
const PREV_FILE = join(ROOT, "data", "hts_full.prev.json");

test("path is built from the indent hierarchy", () => {
  const golf = data.entries.find((e) => e.htsno === "6601.10.00.10");
  assert.equal(golf.path, "Umbrellas and sun umbrellas > Garden or similar umbrellas > Golf umbrellas");
});

test("10-digit statistical suffix inherits the parent rate", () => {
  const golf = data.entries.find((e) => e.htsno === "6601.10.00.10");
  assert.equal(golf.eff_general, "6.5%");
  assert.equal(golf.eff_special, "Free (A+,AU,BH)");
  assert.equal(golf.rate_inherited, true);
});

test("8-digit heading without a rate does NOT inherit", () => {
  const other = data.entries.find((e) => e.htsno === "6601.99.00");
  assert.equal(other.eff_general, "");
  assert.equal(other.rate_inherited, false);
});

test("rateLines excludes Chapter 99 and short headings", () => {
  assert.ok(data.rateLines.every((e) => !e.htsno.startsWith("99")));
  assert.ok(data.rateLines.every((e) => e.htsno.replace(/\D/g, "").length >= 8));
  assert.ok(data.rateLines.some((e) => e.htsno === "6109.10.00"));
});

test("searchCandidates finds cotton t-shirts and rejects empty queries", () => {
  const hits = data.searchCandidates("cotton t-shirt");
  assert.ok(hits.some((e) => e.htsno === "6109.10.00"));
  assert.deepEqual(data.searchCandidates(""), []);
  assert.deepEqual(data.searchCandidates("a b"), []);
});

test("searchCandidates prefers 10-digit leaf lines on equal keyword score", () => {
  const hits = data.searchCandidates("garden umbrellas golf");
  const idxLeaf = hits.findIndex((e) => e.htsno === "6601.10.00.10");
  const idxParent = hits.findIndex((e) => e.htsno === "6601.10.00");
  assert.ok(idxLeaf !== -1 && idxParent !== -1 && idxLeaf < idxParent);
});

test("findByCode: exact match, dotted input, prefix fallback, garbage", () => {
  assert.equal(data.findByCode("6109.10.00")[0].htsno, "6109.10.00");
  assert.equal(data.findByCode("61091000")[0].htsno, "6109.10.00");
  const prefix = data.findByCode("6601");
  assert.ok(prefix.length >= 2 && prefix.every((e) => e.htsno.startsWith("6601")));
  assert.deepEqual(data.findByCode("xyz"), []);
});

test("ch99ForOrigin matches aliases (China includes Hong Kong; Vietnam spelled either way)", () => {
  const cn = data.ch99ForOrigin("China").map((e) => e.htsno);
  assert.ok(cn.includes("9903.88.03"));
  assert.ok(cn.includes("9903.88.99")); // Hong Kong alias
  const vn = data.ch99ForOrigin("Vietnam").map((e) => e.htsno);
  assert.ok(vn.includes("9903.02.69"));
});

test("ch99Universal returns any-country rules and filters terminated provisions", () => {
  const uni = data.ch99Universal().map((e) => e.htsno);
  assert.ok(uni.includes("9903.01.25"));
  assert.ok(!uni.includes("9903.72.01")); // terminated
  assert.ok(!uni.includes("9903.72.02")); // suspended — carries a 34% adder, must not surface
});

test("terminated flag is derived from the compiler's note text", () => {
  assert.equal(data.entries.find((e) => e.htsno === "9903.72.01").terminated, true);
  assert.equal(data.entries.find((e) => e.htsno === "9903.01.25").terminated, false);
});

// A suspended heading reads as live everywhere except the compiler's note, and the
// live example that prompted this (9903.01.63) carries +34%.
test("suspended provisions count as dead, and the note is exposed to the model", () => {
  const susp = data.entries.find((e) => e.htsno === "9903.72.02");
  assert.equal(susp.terminated, true);
  assert.match(data.compilerNote(susp), /provision suspended/i);
  assert.equal(data.compilerNote(data.entries.find((e) => e.htsno === "9903.01.25")), null);
});

test("parseAdderPct reads '+ N%' rules and rejects others", () => {
  assert.equal(data.parseAdderPct("The duty provided in the applicable subheading + 25%"), 25);
  assert.equal(data.parseAdderPct("subheading +7.5%"), 7.5);
  assert.equal(data.parseAdderPct("a duty of 10 percent"), null);
});

test("parseRatePct handles percentages, Free, and specific duties", () => {
  assert.equal(data.parseRatePct("16.5%"), 16.5);
  assert.equal(data.parseRatePct(" 7.2% "), 7.2);
  assert.equal(data.parseRatePct("Free"), 0);
  assert.equal(data.parseRatePct("12.4¢/kg"), null);
});

test("FEES constants are sane", () => {
  assert.ok(data.FEES.mpf.min_usd < data.FEES.mpf.max_usd);
  assert.ok(data.FEES.mpf.rate > 0 && data.FEES.hmf.rate > 0);
});

test("ch99FromFootnotes follows footnote references; empty without footnotes", () => {
  const tshirt = data.entries.find((e) => e.htsno === "6109.10.00");
  assert.deepEqual(data.ch99FromFootnotes(tshirt).map((e) => e.htsno), ["9903.88.15"]);
  const plain = data.entries.find((e) => e.htsno === "6109.90.10");
  assert.deepEqual(data.ch99FromFootnotes(plain), []);
});

test("watchlist: empty when file is missing, then save/load roundtrip", () => {
  if (existsSync(WATCHLIST)) unlinkSync(WATCHLIST);
  assert.deepEqual(data.loadWatchlist(), []);
  const items = [{ hts_code: "6109.10.00", origin: "CN", added: "2026-08-21" }];
  data.saveWatchlist(items);
  assert.deepEqual(data.loadWatchlist(), items);
  unlinkSync(WATCHLIST);
});

test("diffRates returns null without a previous snapshot", () => {
  if (existsSync(PREV_FILE)) unlinkSync(PREV_FILE);
  assert.equal(data.diffRates(), null);
});

test("diffRates reports changed, added, and deleted lines, with code scoping", () => {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const prev = structuredClone(fixture);
  prev.fetched_at = "2026-07-01";
  // changed rate on the t-shirt line
  prev.rows.find((r) => r.htsno === "6109.10.00").general = "10%";
  // 9903.02.69 absent previously -> shows up as a new line
  prev.rows = prev.rows.filter((r) => r.htsno !== "9903.02.69");
  // a line that has since been deleted from the schedule
  prev.rows.push({ htsno: "6601.20.00", indent: "1", description: "Walking-stick umbrellas", superior: null, units: [], general: "4%", special: "", other: "40%", footnotes: null, quotaQuantity: null, additionalDuties: null });
  writeFileSync(PREV_FILE, JSON.stringify(prev));
  try {
    const all = data.diffRates();
    assert.equal(all.prev_date, "2026-07-01");
    assert.ok(all.changes.some((c) => c.htsno === "6109.10.00" && c.field === "general" && c.old === "10%" && c.new === "16.5%"));
    assert.ok(all.changes.some((c) => c.htsno === "9903.02.69" && c.field === "(new line)"));
    assert.ok(all.changes.some((c) => c.htsno === "6601.20.00" && c.field === "(line removed)"));
    const scoped = data.diffRates(["6109"]);
    assert.ok(scoped.changes.length >= 1);
    assert.ok(scoped.changes.every((c) => c.htsno.replace(/\D/g, "").startsWith("6109")));
  } finally {
    unlinkSync(PREV_FILE);
  }
});

test("DATASET_INFO reflects the loaded fixture", () => {
  assert.equal(data.DATASET_INFO.total_rows, 16);
  assert.equal(data.DATASET_INFO.fetched_at, "2026-08-18");
  assert.ok(data.DATASET_INFO.ch99_rules >= 5);
  assert.equal(data.DATASET_INFO.data_file, FIXTURE);
  assert.match(data.DATASET_INFO.overrides_version, /^\d{4}-\d{2}-\d{2}$/);
});
