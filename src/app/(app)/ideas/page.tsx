import Link from "next/link";
import { ExternalLink, Lightbulb } from "lucide-react";
import { requireUser } from "@/server/session";
import { listCategories, listProjects } from "@/server/services/projects";
import { ideasConfigured, ideasPublicUrl, listIdeas, PROJECT_TAG, type Idea } from "@/server/integrations/ideas";
import { Card, Empty, LinkButton, PageHeader } from "@/components/bits";
import { IdeaPromote } from "@/components/idea-promote";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ideas" };

export default async function IdeasPage() {
  const user = await requireUser();
  const publicUrl = ideasPublicUrl();
  if (!ideasConfigured()) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Ideas" />
        <Empty icon={<Lightbulb size={20} />} title="Ideas aren't connected">
          Set <code className="rounded bg-surface-2 px-1 text-xs">PUROJEKUTO_IDEAS_URL</code> to your jinsen-ideas backend (chezmoi does this for you) to turn ideas into projects here.
        </Empty>
      </div>
    );
  }
  let ideas: Idea[] = [];
  let error: string | null = null;
  try {
    ideas = (await listIdeas()).filter((i) => !i.archived);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const bySource = new Map(listProjects(user.id, { status: "all" }).filter((p) => p.sourceRef?.startsWith("jinsen-ideas:")).map((p) => [p.sourceRef!, p]));
  const categories = listCategories(user.id).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }));
  const fresh = ideas.filter((i) => !bySource.has(`jinsen-ideas:${i.id}`) && !i.tags.includes(PROJECT_TAG));
  const taken = ideas.filter((i) => !fresh.includes(i));

  return (
    <div>
      <PageHeader
        title="Ideas"
        subtitle="From your jinsen inbox. When one is worth doing, make it a project: its notes and research verdict come along, and the spec is written from them."
        actions={
          publicUrl && (
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium hover:bg-surface-2">
              Open jinsen <ExternalLink size={13} />
            </a>
          )
        }
      />
      {error && <p className="mb-4 rounded-xl bg-surface px-4 py-3 text-sm text-critical-text">{error}</p>}
      {!error && !fresh.length && (
        <Empty icon={<Lightbulb size={20} />} title="Inbox zero">
          Every idea is either a project already or archived. Capture new ones in jinsen, or ask LeClanker.
        </Empty>
      )}
      <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {fresh.map((i) => (
          <li key={i.id}>
            <Card as="article" className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{i.title}</h2>
                <span className="shrink-0 text-xs text-muted">#{i.id}</span>
              </div>
              {i.body && <p className="mt-1 line-clamp-3 text-sm text-ink-2">{i.body}</p>}
              {i.latest && (
                <p className="mt-3 rounded-xl bg-page px-3 py-2 text-sm">
                  <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">Research verdict</span>
                  <span className="block">{i.latest.headline}</span>
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5 text-xs text-muted">
                  {i.status === "analysing" && <span className="text-accent-text">researching…</span>}
                  {i.tags.map((t) => (
                    <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
                <IdeaPromote ideaId={i.id} categories={categories} />
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {taken.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Already projects</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {taken.map((i) => {
              const p = bySource.get(`jinsen-ideas:${i.id}`);
              return (
                <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="truncate text-ink-2">{i.title}</span>
                  {p ? (
                    <Link href={`/projects/${p.id}`} className="shrink-0 text-xs font-medium text-accent-text hover:underline">
                      Open project
                    </Link>
                  ) : (
                    <span className="shrink-0 text-xs text-muted">tagged “project”</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {!fresh.length && !taken.length && !error && <LinkButton href="/projects/new" className="mt-4">New project</LinkButton>}
    </div>
  );
}
