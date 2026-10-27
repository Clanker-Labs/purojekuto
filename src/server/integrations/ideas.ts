/**
 * jinsen-ideas, where ideas are captured and researched. purojekuto reads
 * them (REST, /api/v1/ideas) so an idea can become a project, then tags the
 * idea "project" so jinsen shows it was picked up. Ideas stay in jinsen:
 * nothing here deletes or rewrites them.
 *
 * Optional: unset PUROJEKUTO_IDEAS_URL and the Ideas page says how to connect.
 */

export interface Idea {
  id: number;
  title: string;
  body: string | null;
  tags: string[];
  starred: boolean;
  archived: boolean;
  status: "captured" | "analysing" | "analysed" | "failed";
  created_at: string;
  updated_at: string;
  latest: { id: number; headline: string; shape: string; weakest: string; generated_at: string } | null;
  report_count: number;
}

export const PROJECT_TAG = "project";

export function ideasConfigured(): boolean {
  return Boolean(process.env.PUROJEKUTO_IDEAS_URL?.trim());
}

export function ideasPublicUrl(): string | null {
  return process.env.PUROJEKUTO_IDEAS_PUBLIC_URL?.trim().replace(/\/+$/, "") || null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.PUROJEKUTO_IDEAS_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new Error("Ideas are not connected (PUROJEKUTO_IDEAS_URL is unset)");
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/ideas${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(process.env.PUROJEKUTO_IDEAS_OWNER ? { "X-Jinsei-Owner": process.env.PUROJEKUTO_IDEAS_OWNER } : {}), ...init.headers },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    throw new Error(`jinsen-ideas is unreachable at ${base}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new Error(`jinsen-ideas: ${typeof body.detail === "string" ? body.detail : `HTTP ${res.status}`}`);
  }
  return (await res.json()) as T;
}

export async function listIdeas(): Promise<Idea[]> {
  return call<Idea[]>("");
}

export async function getIdea(id: number): Promise<Idea> {
  return call<Idea>(`/${id}`);
}

/** Mark the idea as picked up. Best effort: a failure here never blocks the project. */
export async function tagIdeaAsProject(idea: Idea): Promise<void> {
  if (idea.tags.includes(PROJECT_TAG)) return;
  await call(`/${idea.id}`, { method: "PATCH", body: JSON.stringify({ tags: [...idea.tags, PROJECT_TAG].slice(0, 20) }) }).catch(() => {});
}

/** What the spec writer should know about an idea: its text and the research verdict, if any. */
export function ideaContext(idea: Idea): string {
  const parts = [`Idea #${idea.id}: ${idea.title}`];
  if (idea.body?.trim()) parts.push(idea.body.trim());
  if (idea.tags.length) parts.push(`Tags: ${idea.tags.join(", ")}`);
  if (idea.latest) parts.push(`Research verdict: ${idea.latest.headline}`, `Weakest point found: ${idea.latest.weakest}`);
  return parts.join("\n\n");
}
