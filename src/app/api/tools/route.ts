import { z } from "zod";
import { enabledTools } from "@/server/agent/tools";
import { apiUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** GET /api/tools — every tool with its JSON Schema (same set as the MCP server). */
export async function GET(request: Request) {
  if (!(await apiUser(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(
    enabledTools().map((t) => ({ name: t.name, title: t.title, description: t.description, readOnly: t.readOnly, inputSchema: z.toJSONSchema(t.input) })),
  );
}
