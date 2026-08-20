#!/usr/bin/env node
/** Entry stdio — Claude Code / agy-ide / Claude Desktop chạy local. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

await buildServer().connect(new StdioServerTransport());
