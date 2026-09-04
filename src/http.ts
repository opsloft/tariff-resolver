#!/usr/bin/env node
/**
 * Streamable-HTTP entry point — the transport remote servers use on the MCP registry.
 * Stateless (the server only looks data up, it keeps no session) — every request builds a
 * fresh transport.
 *
 * API keys (BYOK):
 * - RADAR_KEYS="key1,key2", or a JSON file at RADAR_KEYS_FILE={"<key>":{"plan":"pro","limit":1000}}
 * - With neither configured the server runs OPEN (local dev only) and prints a warning.
 * - Every call appends one JSONL line to usage.log (the metering substrate; swap for a hosted
 *   key service at deploy time).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 8787);
const USAGE_LOG = process.env.RADAR_USAGE_LOG ?? "usage.log";

type KeyInfo = { plan?: string; limit?: number };
function loadKeys(): Map<string, KeyInfo> | null {
  const file = process.env.RADAR_KEYS_FILE;
  if (file && existsSync(file)) {
    const d = JSON.parse(readFileSync(file, "utf8")) as Record<string, KeyInfo>;
    return new Map(Object.entries(d));
  }
  const list = (process.env.RADAR_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? new Map(list.map((k) => [k, {}])) : null;
}
const keys = loadKeys();
if (!keys) console.error("⚠️  No RADAR_KEYS/RADAR_KEYS_FILE — running in OPEN mode (local dev only).");

const usedThisMonth = new Map<string, number>();

function apiKeyOf(req: import("node:http").IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7).trim();
  const x = req.headers["x-api-key"];
  return typeof x === "string" ? x.trim() : null;
}

const httpServer = createServer(async (req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (!req.url?.startsWith("/mcp")) {
    res.writeHead(404).end("Not found. MCP endpoint: POST /mcp");
    return;
  }
  let key: string | null = null;
  if (keys) {
    key = apiKeyOf(req);
    if (!key || !keys.has(key)) {
      res.writeHead(401, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "Invalid API key. Header: Authorization: Bearer <key>" }));
      return;
    }
    const info = keys.get(key)!;
    const used = usedThisMonth.get(key) ?? 0;
    if (info.limit && used >= info.limit) {
      res.writeHead(429, { "content-type": "application/json" })
        .end(JSON.stringify({ error: `Monthly quota of ${info.limit} requests for plan ${info.plan ?? "free"} exhausted.` }));
      return;
    }
    usedThisMonth.set(key, used + 1);
  }
  // async, fire-and-forget: a synchronous log write would block the event loop.
  // Only the LAST 4 characters of the key plus its length are recorded, never the key itself.
  const keyTag = key ? `…${key.slice(-4)}(${key.length})` : "open";
  void appendFile(USAGE_LOG, JSON.stringify({ t: new Date().toISOString(), key: keyTag, m: req.method }) + "\n")
    .catch(() => { /* metering must never kill the request */ });

  // Stateless: a new transport + server per request, closed when the response ends.
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

httpServer.listen(PORT, () => {
  console.error(`tariff-resolver streamable-http: http://localhost:${PORT}/mcp ${keys ? `(${keys.size} API key(s))` : "(OPEN mode)"}`);
});
