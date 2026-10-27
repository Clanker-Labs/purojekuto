import { callTool, findTool } from "@/server/agent/tools";
import { apiUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** POST /api/tools/<name> with the tool's JSON input — plain-HTTP access to the agent tools. */
export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await apiUser(request);
  if (!user) return Response.json({ error: "Unauthorized, or no account yet" }, { status: 401 });
  const { name } = await params;
  if (!findTool(name)) return Response.json({ error: `Unknown tool ${name}` }, { status: 404 });
  const res = await callTool({ userId: user.id }, name, await request.json().catch(() => ({})));
  return res.ok ? Response.json(res.data ?? null) : Response.json({ error: res.content }, { status: 400 });
}
