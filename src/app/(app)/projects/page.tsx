import clsx from "clsx";
import Link from "next/link";
import type { CSSProperties } from "react";
import { FolderKanban, Plus, Search } from "lucide-react";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/services/settings";
import { listCategories, listProjects } from "@/server/services/projects";
import type { ProjectStatus } from "@/server/db/schema";
import { STATUSES } from "@/lib/projects";
import { todayIn } from "@/lib/time";
import { Empty, LinkButton, PageHeader } from "@/components/bits";
import { ProjectCard } from "@/components/project-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

type Search = { c?: string; s?: string; q?: string };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tz = getSettings(user.id).timezone;
  const today = todayIn(tz);
  const status = (sp.s && (["open", "all", ...STATUSES.map((s) => s.id)] as string[]).includes(sp.s) ? sp.s : "open") as ProjectStatus | "open" | "all";
  const categoryId = sp.c === "none" ? null : sp.c || undefined;
  const cats = listCategories(user.id);
  const projects = listProjects(user.id, { status, categoryId, q: sp.q });
  const everything = listProjects(user.id, { status: "all" });
  const count = (s: string) => (s === "open" ? everything.filter((p) => ["idea", "planned", "active", "paused"].includes(p.status)).length : s === "all" ? everything.length : everything.filter((p) => p.status === s).length);
  const href = (patch: Search) => {
    const next = { ...sp, ...patch };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
    return `/projects${qs ? `?${qs}` : ""}`;
  };
  const current = cats.find((c) => c.id === sp.c);

  return (
    <div>
      <PageHeader
        title={current ? `${current.emoji} ${current.name}` : "Projects"}
        subtitle={current ? `${current.open} open · ${current.total} in total` : "Everything you're making happen, by shelf."}
        actions={
          <LinkButton href="/projects/new" variant="primary">
            <Plus size={16} /> New project
          </LinkButton>
        }
      />

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={href({ c: undefined })} className={clsx("shrink-0 rounded-xl border px-3 py-2 text-sm font-medium", !sp.c ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-surface text-ink-2 hover:text-ink")}>
          All shelves
        </Link>
        {cats.map((c) => (
          <Link
            key={c.id}
            href={href({ c: c.id })}
            className={clsx("tint flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm", sp.c === c.id ? "border-[var(--c)] font-semibold" : "border-transparent hover:border-border-strong")}
            style={{ "--c": c.color } as CSSProperties}
          >
            <span aria-hidden>{c.emoji}</span>
            {c.name}
            {c.open > 0 && <span className="tabular rounded-md bg-surface/70 px-1.5 text-[11px] font-semibold text-ink-2">{c.open}</span>}
          </Link>
        ))}
        <Link href={href({ c: "none" })} className={clsx("shrink-0 rounded-xl border px-3 py-2 text-sm", sp.c === "none" ? "border-accent text-accent-text" : "border-dashed border-border-strong text-muted hover:text-ink")}>
          Uncategorized
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-border bg-surface p-0.5 text-sm">
          {[{ id: "open", label: "Open" }, ...STATUSES.filter((s) => ["active", "planned", "idea", "paused", "done"].includes(s.id)), { id: "all", label: "All" }].map((s) => (
            <Link
              key={s.id}
              href={href({ s: s.id === "open" ? undefined : s.id })}
              className={clsx("rounded-lg px-2.5 py-1.5 font-medium", status === s.id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}
            >
              {s.label} <span className="tabular text-xs text-faint">{count(s.id)}</span>
            </Link>
          ))}
        </div>
        <form action="/projects" className="relative min-w-48 flex-1 sm:max-w-xs">
          {sp.c && <input type="hidden" name="c" value={sp.c} />}
          {sp.s && <input type="hidden" name="s" value={sp.s} />}
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder="Search projects" className="h-9 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-sm placeholder:text-faint focus:border-accent focus:outline-none" />
        </form>
      </div>

      {projects.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} today={today} tz={tz} />
          ))}
        </div>
      ) : (
        <Empty
          icon={<FolderKanban size={20} />}
          title={everything.length ? "Nothing here" : "No projects yet"}
          action={<LinkButton href="/projects/new" variant="primary">New project</LinkButton>}
        >
          {everything.length ? "Try another shelf or status." : "Capture one with a sentence; the spec is written for you. Or turn an idea from your inbox into a project."}
        </Empty>
      )}
    </div>
  );
}
