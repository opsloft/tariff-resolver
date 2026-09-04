#!/usr/bin/env node
/** stdio entry point — for MCP clients that run the server locally as a child process. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

await buildServer().connect(new StdioServerTransport());
