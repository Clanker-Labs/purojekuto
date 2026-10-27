/**
 * purojekuto MCP server over stdio — plug it into Claude Code, Codex, Claude
 * Desktop or any MCP client:
 *
 *   claude mcp add purojekuto -- node /path/to/purojekuto/bin/purojekuto-mcp.mjs
 *
 * (bin/purojekuto-mcp.mjs wraps this file so it works from any working directory.)
 * Local, no token: acts as PUROJEKUTO_USER_ID, or the owner (first account).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPurojekutoMcpServer } from "@/server/agent/mcp";
import { db, dbPath } from "@/server/db/client";
import { defaultUser } from "@/server/services/users";

db(); // open + migrate before accepting calls
const server = createPurojekutoMcpServer(() => defaultUser().id);
await server.connect(new StdioServerTransport());
// stdout is the protocol channel: log to stderr only.
console.error(`purojekuto MCP server ready (db: ${dbPath()})`);
