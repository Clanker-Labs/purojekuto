import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPurojekutoMcpServer } from "@/server/agent/mcp";
import { apiUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * MCP over Streamable HTTP (stateless). Open by default for local use; set
 * PUROJEKUTO_API_TOKEN to require `Authorization: Bearer <token>`.
 *
 *   claude mcp add --transport http purojekuto http://localhost:3000/api/mcp
 */
async function handle(request: Request) {
  const user = await apiUser(request);
  if (!user) return Response.json({ error: "Unauthorized, or no account yet (create one in the web app)" }, { status: 401 });
  const server = createPurojekutoMcpServer(() => user.id);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void transport.close();
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
