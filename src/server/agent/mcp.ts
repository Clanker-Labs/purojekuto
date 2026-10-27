import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSettings } from "@/server/services/settings";
import { callTool, enabledTools } from "./tools";

function timezone(resolveUserId: () => string): string | null {
  try {
    return getSettings(resolveUserId()).timezone;
  } catch {
    return null;
  }
}

/**
 * An MCP server exposing every purojekuto tool, acting for one user (resolved per
 * call, so a server started before the first sign-up still works).
 */
export function createPurojekutoMcpServer(resolveUserId: () => string): McpServer {
  const tz = timezone(resolveUserId);
  const server = new McpServer(
    { name: "purojekuto", version: "0.1.0" },
    {
      instructions:
        "Tools for the user's self-hosted purojekuto: their PERSONAL projects (home, DIY, side projects, trips, learning) with lean AI-written specs, " +
        "milestones, to-do boards (todo/doing/done), shopping lists, and working sessions mirrored into their khal calendar. " +
        "Call get_context first" +
        (tz ? ` (timezone ${tz}; times as 'YYYY-MM-DDTHH:mm' are read in it)` : "") +
        ". To start a project from a conversation, call create_project with everything the person said in `notes`; the spec is written in the background. " +
        "Ideas from their jinsen inbox can become projects with project_from_idea. Refer to projects by id or title. " +
        "Confirm before deleting a project.",
    },
  );

  for (const t of enabledTools()) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.input,
        annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: !!t.destructive, openWorldHint: false },
      },
      async (args: unknown) => {
        let userId: string;
        try {
          userId = resolveUserId();
        } catch (e) {
          return { content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }], isError: true };
        }
        const res = await callTool({ userId }, t.name, args);
        return { content: [{ type: "text" as const, text: res.content }], isError: !res.ok };
      },
    );
  }
  return server;
}
