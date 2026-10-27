import type { User } from "@/server/db/schema";
import { apiUser } from "@/server/session";

/** Wrap a route handler: resolve the user (401 if none) and turn thrown errors into 400 JSON. */
export function route<C = unknown>(fn: (user: User, request: Request, ctx: C) => Promise<Response | unknown> | Response | unknown) {
  return async (request: Request, ctx: C): Promise<Response> => {
    const user = await apiUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const out = await fn(user, request, ctx);
      return out instanceof Response ? out : Response.json(out ?? { ok: true });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  };
}

export async function body<T = Record<string, unknown>>(request: Request): Promise<T> {
  return (await request.json().catch(() => ({}))) as T;
}
