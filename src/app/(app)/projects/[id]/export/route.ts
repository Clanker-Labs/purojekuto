import { currentUser } from "@/server/session";
import { getSettings } from "@/server/services/settings";
import { getProject, listCategories } from "@/server/services/projects";
import { listMilestones, listPurchases, listTasks } from "@/server/services/items";
import { listSessions } from "@/server/services/sessions";
import { latestSpec } from "@/server/services/specs";
import { projectHtml } from "@/server/export-html";
import { specToMarkdown } from "@/lib/spec";

export const dynamic = "force-dynamic";

/** GET /projects/<id>/export — the project as one interactive HTML page (?download=1 to save it, ?format=md for the spec as Markdown). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  let project;
  try {
    project = getProject(user.id, id);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const url = new URL(request.url);
  const spec = latestSpec(user.id, id);
  const slug = project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "project";

  if (url.searchParams.get("format") === "md") {
    if (!spec) return new Response("This project has no spec yet.", { status: 404 });
    return new Response(specToMarkdown(project.title, spec.content, project.currency), {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `inline; filename="${slug}.md"` },
    });
  }

  const cat = project.categoryId ? listCategories(user.id).find((c) => c.id === project.categoryId) : undefined;
  const html = projectHtml({
    project,
    category: cat ? { name: cat.name, emoji: cat.emoji, color: cat.color } : null,
    spec: spec?.content ?? null,
    tasks: listTasks(user.id, id),
    milestones: listMilestones(user.id, id),
    purchases: listPurchases(user.id, id),
    sessions: listSessions(user.id, { projectId: id }),
    timezone: getSettings(user.id).timezone,
    exportedAt: new Date(),
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // The page is self-contained: no network, its one inline script only.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:",
      ...(url.searchParams.get("download") ? { "Content-Disposition": `attachment; filename="${slug}.html"` } : {}),
    },
  });
}
