import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";

// Boots the real server (full bundled dataset) and exercises every tool over
// MCP stdio. The watchlist is pointed at a temp file so tests never touch repo
// state. stdin is closed at the end so the server exits cleanly — that also
// lets NODE_V8_COVERAGE flush, so `c8` sees server.js coverage from this test.
test("MCP server over stdio: tools/list + one real call per tool", async () => {
  const WATCHLIST = join(tmpdir(), `tariff-resolver-smoke-wl-${process.pid}.json`);
  if (existsSync(WATCHLIST)) unlinkSync(WATCHLIST);

  const p = spawn(process.execPath, ["dist/index.js"], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, HTS_WATCHLIST_FILE: WATCHLIST },
  });

  const pending = new Map();
  let out = "";
  p.stdout.on("data", (d) => {
    out += d.toString();
    const lines = out.split("\n");
    out = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch {}
    }
  });

  const send = (obj) => p.stdin.write(JSON.stringify(obj) + "\n");
  const request = (id, method, params) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for response id=${id} (${method})`)), 20000);
      pending.set(id, (msg) => { clearTimeout(t); resolve(msg); });
      send({ jsonrpc: "2.0", id, method, params });
    });
  const callTool = async (id, name, args) => {
    const msg = await request(id, "tools/call", { name, arguments: args });
    assert.ok(!msg.error, `${name} returned error: ${JSON.stringify(msg.error)}`);
    const text = msg.result?.content?.[0]?.text ?? "";
    assert.ok(text.length > 0, `${name} returned empty content`);
    return text;
  };

  try {
    await request(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    const list = await request(2, "tools/list", {});
    assert.deepEqual(
      list.result.tools.map((t) => t.name).sort(),
      ["calculate_tariff_scenario", "check_tariff_updates", "dataset_info", "search_hs_candidates", "watch_tariff_changes"]
    );

    const search = await callTool(3, "search_hs_candidates", { product_description: "vacuum flask", limit: 3 });
    assert.match(search, /9617\.00\.10/);

    const scenario = await callTool(4, "calculate_tariff_scenario", {
      hts_code: "9617.00.10", origin_country: "China", customs_value_usd: 10000, ocean_freight: true,
    });
    const parsed = JSON.parse(scenario);
    assert.equal(parsed.base_line.general_mfn.pct, 7.2);
    assert.ok(parsed.fixed_fees_usd.mpf > 0 && parsed.fixed_fees_usd.hmf > 0);
    assert.ok(
      parsed.ch99_additional_duties.linked_by_footnote.length +
        parsed.ch99_additional_duties.matched_by_origin_name.length +
        parsed.ch99_additional_duties.universal_all_countries.length > 0
    );

    const watch = await callTool(5, "watch_tariff_changes", { hts_codes: ["6109.10.00", "0000.00.00"] });
    assert.match(watch, /Watchlist total: 1 code/);

    const updates = await callTool(6, "check_tariff_updates", {});
    assert.match(updates, /No previous dataset|Comparing/);

    const info = await callTool(7, "dataset_info", {});
    assert.match(info, /total_rows/);
  } finally {
    p.stdin.end();
    await new Promise((resolve) => {
      const force = setTimeout(() => { p.kill(); resolve(); }, 3000);
      p.on("exit", () => { clearTimeout(force); resolve(); });
    });
    if (existsSync(WATCHLIST)) unlinkSync(WATCHLIST);
  }
});
