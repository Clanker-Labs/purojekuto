import clsx from "clsx";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { DateTime } from "luxon";
import { ArrowLeft, CalendarClock, Clock, Flag, ListChecks, ShoppingCart, Sparkles, Activity as ActivityIcon } from "lucide-react";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/services/settings";
import { listCategories, projectSummary, recentActivity } from "@/server/services/projects";
import { listMilestones, listPurchases, listTasks } from "@/server/services/items";
import { listSessions } from "@/server/services/sessions";
import { latestJob, latestSpec, listSpecVersions } from "@/server/services/specs";
import { aiStatus } from "@/server/ai/providers";
import { khalConfigured, khalPublicUrl } from "@/server/integrations/khal";
import { CategoryChip, Progress, StatusPill } from "@/components/bits";
import { ProjectActions } from "@/components/project/actions";
import { SpecPanel } from "@/components/project/spec-panel";
import { Milestones } from "@/components/project/milestones";
import { Board } from "@/components/project/board";
import { Purchases } from "@/components/project/purchases";
import { Sessions } from "@/components/project/sessions";
import { duration, money, relativeDay, shortDate } from "@/lib/format";
import { describeActivity } from "@/lib/activity";
import { todayIn } from "@/lib/time";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "plan", label: "Plan", icon: Sparkles },
  { id: "board", label: "Board", icon: ListChecks },
  { id: "buy", label: "Shopping", icon: ShoppingCart },
  { id: "sessions", label: "Sessions", icon: CalendarClock },
  { id: "activity", label: "Activity", icon: ActivityIcon },
] as const;
type Tab = (typeof TABS)[number]["id"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  try {
    return { title: projectSummary(user.id, (await params).id).title };
  } catch {
    return { title: "Project" };
  }
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const tabParam = (await searchParams).tab;
  let p;
  try {
    p = projectSummary(user.id, id);
  } catch {
    notFound();
  }
  const s = getSettings(user.id);
  const tz = s.timezone;
  const today = todayIn(tz);
  const spec = latestSpec(user.id, id);
  const job = latestJob(user.id, id);
  const tasks = listTasks(user.id, id);
  const milestones = listMilestones(user.id, id);
  const purchases = listPurchases(user.id, id);
  const sessions = listSessions(user.id, { projectId: id });
  const ai = aiStatus(user.id);
  const tab: Tab = (TABS.some((t) => t.id === tabParam) ? tabParam : tasks.length && !spec ? "board" : "plan") as Tab;
  const color = p.category?.color ?? "#6f86a6";
  const budgetLine = p.budgetCents != null ? `${money(p.spentCents, p.currency)} of ${money(p.budgetCents, p.currency)}` : p.plannedSpendCents ? `${money(p.spentCents, p.currency)} of ~${money(p.plannedSpendCents, p.currency)}` : null;
  const counts: Partial<Record<Tab, number>> = { board: tasks.filter((t) => t.status !== "done").length, buy: purchases.filter((b) => b.status !== "bought").length, sessions: sessions.filter((x) => x.status === "planned" && x.end > Date.now()).length };

  return (
    <div>
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Projects
      </Link>

      <header className="mb-6">
        <div className="flex items-start gap-4">
          <span className="tint grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl" style={{ "--c": color } as CSSProperties} aria-hidden>
            {p.emoji ?? p.category?.emoji ?? "📁"}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-[28px]">{p.title}</h1>
            {p.pitch && <p className="mt-1 text-ink-2">{p.pitch}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusPill status={p.status} />
              <CategoryChip category={p.category} />
              {p.priority === 3 && <span className="text-xs font-semibold text-critical-text">High priority</span>}
              {p.priority === 1 && <span className="text-xs text-muted">Low priority</span>}
              {p.sourceRef?.startsWith("jinsen-ideas:") && <span className="text-xs text-muted">· from idea #{p.sourceRef.split(":")[1]}</span>}
            </div>
          </div>
          <ProjectActions
            project={{ id: p.id, title: p.title, status: p.status, pinned: p.pinned }}
            categories={listCategories(user.id).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))}
            form={{
              title: p.title,
              emoji: p.emoji ?? "",
              pitch: p.pitch,
              notes: p.notes,
              category: p.categoryId ?? "",
              status: p.status,
              priority: p.priority,
              startDate: p.startDate ?? "",
              targetDate: p.targetDate ?? "",
              budget: p.budgetCents != null ? String(p.budgetCents / 100) : "",
              currency: p.currency,
            }}
          />
        </div>

        <div className="mt-5 grid gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card sm:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="font-medium text-muted">Progress</span>
              <span className="tabular text-base font-semibold">{p.progress}%</span>
            </div>
            <Progress value={p.progress} />
            <p className="mt-1.5 text-xs text-ink-2">
              {p.tasksTotal ? `${p.tasksDone}/${p.tasksTotal} tasks` : "No tasks yet"}
              {p.milestonesTotal ? ` · ${p.milestonesDone}/${p.milestonesTotal} milestones` : ""}
            </p>
          </div>
          <Fact
            icon={<Flag size={14} />}
            label="Next milestone"
            value={p.nextMilestone?.title ?? "—"}
            hint={p.nextMilestone?.dueDate ? (p.nextMilestone.dueDate < today ? `was due ${relativeDay(p.nextMilestone.dueDate, today)}` : relativeDay(p.nextMilestone.dueDate, today)) : undefined}
            warn={!!p.nextMilestone?.dueDate && p.nextMilestone.dueDate < today}
          />
          <Fact
            icon={<Clock size={14} />}
            label="Dates"
            value={p.targetDate ? `by ${shortDate(p.targetDate)}` : p.startDate ? `since ${shortDate(p.startDate)}` : "No dates"}
            hint={p.targetDate ? relativeDay(p.targetDate, today) : undefined}
            warn={!!p.targetDate && p.targetDate < today && !["done", "dropped"].includes(p.status)}
          />
          <Fact icon={<ShoppingCart size={14} />} label="Spent" value={budgetLine ?? "—"} hint={p.minutesWorked ? `${duration(p.minutesWorked)} worked` : undefined} warn={p.budgetCents != null && p.spentCents > p.budgetCents} />
        </div>
      </header>

      <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0" aria-label="Project sections">
        {TABS.map(({ id: t, label, icon: Icon }) => (
          <Link
            key={t}
            href={`/projects/${id}${t === "plan" ? "?tab=plan" : `?tab=${t}`}`}
            scroll={false}
            aria-current={tab === t ? "page" : undefined}
            className={clsx(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium",
              tab === t ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            <Icon size={15} />
            {label}
            {counts[t] ? <span className="tabular rounded-md bg-surface-2 px-1.5 text-[11px] text-ink-2">{counts[t]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "plan" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <SpecPanel
            projectId={id}
            currency={p.currency}
            ai={{ ready: ai.ready, reason: ai.reason ?? null }}
            spec={spec ? { id: spec.id, version: spec.version, content: spec.content, model: spec.model, provider: spec.provider, applied: !!spec.appliedAt, createdAt: spec.createdAt.getTime() } : null}
            versions={listSpecVersions(user.id, id).length}
            job={job ? { status: job.status, error: job.error } : null}
            hasNotes={!!p.notes.trim()}
          />
          <div className="space-y-6">
            <Milestones
              projectId={id}
              today={today}
              milestones={milestones.map((m) => ({ id: m.id, title: m.title, dueDate: m.dueDate, done: !!m.doneAt, inKhal: !!m.khalEventId, tasks: tasks.filter((t) => t.milestoneId === m.id).length, tasksDone: tasks.filter((t) => t.milestoneId === m.id && t.status === "done").length }))}
            />
            {p.notes.trim() && (
              <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
                <h2 className="mb-2 text-sm font-semibold">Notes</h2>
                <p className="text-sm whitespace-pre-wrap text-ink-2">{p.notes}</p>
              </section>
            )}
          </div>
        </div>
      )}

      {tab === "board" && (
        <Board
          projectId={id}
          tasks={tasks.map((t) => ({ id: t.id, title: t.title, notes: t.notes, status: t.status, milestoneId: t.milestoneId, dueDate: t.dueDate }))}
          milestones={milestones.map((m) => ({ id: m.id, title: m.title }))}
          today={today}
        />
      )}

      {tab === "buy" && (
        <Purchases
          projectId={id}
          currency={p.currency}
          budgetCents={p.budgetCents}
          items={purchases.map((b) => ({ id: b.id, name: b.name, quantity: b.quantity, unitCents: b.unitCents, currency: b.currency, url: b.url, vendor: b.vendor, notes: b.notes, status: b.status }))}
        />
      )}

      {tab === "sessions" && (
        <Sessions
          projectId={id}
          tz={tz}
          defaultMinutes={s.sessionMinutes}
          khal={{ connected: khalConfigured() && s.khalSync, url: khalPublicUrl() }}
          suggestion={spec ? `${spec.content.sessions.count} sessions of ${duration(spec.content.sessions.minutes)}, ${spec.content.sessions.cadence}` : null}
          sessions={sessions.map((x) => ({ id: x.id, title: x.title, start: x.start, end: x.end, notes: x.notes, status: x.status, inKhal: !!x.khalEventId, khalError: x.khalError }))}
        />
      )}

      {tab === "activity" && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <ol className="relative space-y-4 border-l border-border pl-5">
            {recentActivity(user.id, { projectId: id, limit: 100 }).map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" aria-hidden />
                <p className="text-sm">{describeActivity(a.kind, a.detail)}</p>
                <p className="text-xs text-muted">{DateTime.fromJSDate(a.at, { zone: tz }).toFormat("ccc d LLL yyyy, HH:mm")}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Fact({ icon, label, value, hint, warn }: { icon: React.ReactNode; label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        {label}
      </div>
      <div className={clsx("mt-1 truncate text-sm font-medium", warn && "text-critical-text")}>{value}</div>
      {hint && <div className="text-xs text-ink-2">{hint}</div>}
    </div>
  );
}
