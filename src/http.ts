#!/usr/bin/env node
/**
 * Entry streamable-http (tuần 2) — chuẩn của 11.102/11.860 server remote trên registry.
 * Stateless (server chỉ tra dữ liệu, không giữ phiên) — mỗi request dựng transport mới.
 *
 * API key (BYOK):
 * - RADAR_KEYS="key1,key2"  hoặc file JSON RADAR_KEYS_FILE={"<key>":{"plan":"pro","limit":1000}}
 * - Không cấu hình gì -> chế độ MỞ (dev local), in cảnh báo.
 * - Mỗi lượt gọi ghi 1 dòng JSONL vào usage.log (nền tảng metering; thay bằng Unkey ở bước deploy).
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
if (!keys) console.error("⚠️  Không có RADAR_KEYS/RADAR_KEYS_FILE — chạy chế độ MỞ (chỉ dùng cho dev local).");

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
        .end(JSON.stringify({ error: "API key không hợp lệ. Header: Authorization: Bearer <key>" }));
      return;
    }
    const info = keys.get(key)!;
    const used = usedThisMonth.get(key) ?? 0;
    if (info.limit && used >= info.limit) {
      res.writeHead(429, { "content-type": "application/json" })
        .end(JSON.stringify({ error: `Hết hạn mức ${info.limit} lượt/tháng của gói ${info.plan ?? "free"}.` }));
      return;
    }
    usedThisMonth.set(key, used + 1);
  }
  // async, fire-and-forget: log đồng bộ chặn event loop (review agy); chỉ log 4 ký tự CUỐI + độ dài
  const keyTag = key ? `…${key.slice(-4)}(${key.length})` : "open";
  void appendFile(USAGE_LOG, JSON.stringify({ t: new Date().toISOString(), key: keyTag, m: req.method }) + "\n")
    .catch(() => { /* metering không được phép làm chết request */ });

  // Stateless: transport + server mới cho mỗi request, đóng khi res kết thúc.
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

httpServer.listen(PORT, () => {
  console.error(`tariff-resolver streamable-http: http://localhost:${PORT}/mcp ${keys ? `(${keys.size} API key)` : "(chế độ MỞ)"}`);
});
