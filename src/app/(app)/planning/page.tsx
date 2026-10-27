import clsx from "clsx";
import Link from "next/link";
import type { CSSProperties } from "react";
import { DateTime } from "luxon";
import { CalendarClock, ChevronLeft, ChevronRight, Flag, ListTodo } from "lucide-react";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/services/settings";
import { planning } from "@/server/services/analytics";
import { Card, CardTitle, Empty, LinkButton, PageHeader } from "@/components/bits";
import { duration } from "@/lib/format";
import { isISODate, todayIn } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planning" };

const WEEKS = 12;

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const user = await requireUser();
  const tz = getSettings(user.id).timezone;
  const today = todayIn(tz);
  const sp = await searchParams;
  const monday = DateTime.fromISO(sp.from && isISODate(sp.from) ? sp.from : today, { zone: tz }).startOf("week");
  const from = monday.toISODate()!;
  const to = monday.plus({ weeks: WEEKS }).minus({ days: 1 }).toISODate()!;
  const plan = planning(user.id, from, to);
  const span = WEEKS * 7;
  const x = (date: string) => (DateTime.fromISO(date, { zone: tz }).diff(monday, "days").days / span) * 100;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const todayX = x(today);

  const dated = plan.projects.filter((p) => p.startDate || p.targetDate || p.status === "active" || plan.milestones.some((m) => m.projectId === p.id));
  const undated = plan.projects.filter((p) => !dated.includes(p));

  // Agenda: the next 14 days from the window start (or today, when it's inside).
  const agendaStart = today >= from && today <= to ? today : from;
  const days = Array.from({ length: 14 }, (_, i) => DateTime.fromISO(agendaStart, { zone: tz }).plus({ days: i }).toISODate()!);
  const byDay = (d: string) => ({
    sessions: plan.sessions.filter((s) => DateTime.fromMillis(s.start, { zone: tz }).toISODate() === d),
    milestones: plan.milestones.filter((m) => m.dueDate === d && !m.doneAt),
    tasks: plan.dueTasks.filter((t) => t.dueDate === d || (d === today && t.dueDate! < today)),
  });

  const hasAny = (d: string) => {
    const b = byDay(d);
    return b.sessions.length + b.milestones.length + b.tasks.length > 0;
  };
  const quiet = !days.some(hasAny);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planning"
        subtitle="What's dated, what's scheduled, and what's quietly waiting."
        actions={
          <div className="flex items-center gap-1">
            <LinkButton href={`/planning?from=${monday.minus({ weeks: 4 }).toISODate()}`} variant="ghost" className="px-2">
              <ChevronLeft size={16} />
            </LinkButton>
            <LinkButton href="/planning">Today</LinkButton>
            <LinkButton href={`/planning?from=${monday.plus({ weeks: 4 }).toISODate()}`} variant="ghost" className="px-2">
              <ChevronRight size={16} />
            </LinkButton>
          </div>
        }
      />

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Timeline</h2>
          <span className="text-xs text-muted">
            {monday.toFormat("d LLL")} – {DateTime.fromISO(to).toFormat("d LLL yyyy")}
          </span>
        </div>
        {dated.length ? (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="relative ml-48 h-7 border-b border-border text-[10px] text-muted">
                {Array.from({ length: WEEKS }, (_, i) => (
                  <span key={i} className="absolute top-2 border-l border-border pl-1" style={{ left: `${(i / WEEKS) * 100}%` }}>
                    {monday.plus({ weeks: i }).toFormat("d LLL")}
                  </span>
                ))}
              </div>
              <ul>
                {dated.map((p) => {
                  const s = p.startDate ?? p.createdAt.toISOString().slice(0, 10);
                  // No target date: run the bar to the last milestone, or to today for work under way.
                  const e = p.targetDate ?? plan.milestones.filter((m) => m.projectId === p.id).map((m) => m.dueDate!).sort().at(-1) ?? (p.status === "active" ? today : s);
                  const left = clamp(x(s));
                  const right = clamp(x(e) + 100 / span);
                  const color = p.category?.color ?? "#6f86a6";
                  return (
                    <li key={p.id} className="flex items-center border-b border-border last:border-0">
                      <Link href={`/projects/${p.id}`} className="w-48 shrink-0 truncate px-4 py-2.5 text-sm hover:text-accent-text">
                        {p.emoji ?? p.category?.emoji ?? "📁"} {p.title}
                      </Link>
                      <div className="relative h-10 flex-1">
                        {todayX >= 0 && todayX <= 100 && <span className="absolute inset-y-0 w-px bg-now/70" style={{ left: `${todayX}%` }} aria-hidden />}
                        {right > left && (
                          <span
                            className={clsx("tint absolute top-2.5 h-5 overflow-hidden rounded-md", !p.targetDate && "opacity-70")}
                            style={{ "--c": color, left: `${left}%`, width: `${right - left}%` } as CSSProperties}
                            title={`${p.title}: ${p.progress}%`}
                          >
                            <span className="block h-full bg-[var(--c)] opacity-60" style={{ width: `${p.progress}%` }} />
                          </span>
                        )}
                        {plan.milestones
                          .filter((m) => m.projectId === p.id)
                          .map((m) => (
                            <span
                              key={m.id}
                              className={clsx("absolute top-[13px] h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-[3px] border-2 border-surface", m.doneAt ? "bg-accent" : "bg-ink")}
                              style={{ left: `${clamp(x(m.dueDate!) + 50 / span)}%` }}
                              title={`${m.title} · ${m.dueDate}`}
                            />
                          ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-ink-2">No dated projects in this window. Give a project a target date, or apply a spec: its milestones come dated.</p>
        )}
        {undated.length > 0 && (
          <p className="border-t border-border px-5 py-3 text-xs text-muted">
            Not dated: {undated.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ", "}
                <Link href={`/projects/${p.id}`} className="hover:text-ink">
                  {p.title}
                </Link>
              </span>
            ))}
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardTitle>Next two weeks</CardTitle>
          {quiet && <p className="mb-2 text-sm text-ink-2">Nothing scheduled in the next two weeks.</p>}
          <ul className="divide-y divide-border">
            {days.filter((d) => d === today || hasAny(d)).map((d) => {
              const b = byDay(d);
              const empty = !b.sessions.length && !b.milestones.length && !b.tasks.length;
              const dt = DateTime.fromISO(d, { zone: tz });
              return (
                <li key={d} className={clsx("flex gap-4 py-2.5", empty && "opacity-60")}>
                  <div className={clsx("w-14 shrink-0 text-xs", d === today ? "font-semibold text-accent-text" : "text-muted")}>
                    <div className="uppercase">{dt.toFormat("ccc")}</div>
                    <div className="text-base text-ink">{dt.toFormat("d")}</div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                    {empty && <p className="text-sm text-muted">Nothing today.</p>}
                    {b.sessions.map((s) => (
                      <Link key={s.id} href={`/projects/${s.projectId}?tab=sessions`} className="flex items-center gap-2 text-sm hover:text-accent-text">
                        <CalendarClock size={14} className="shrink-0 text-muted" />
                        <span className="truncate">
                          <span className="tabular text-ink-2">{DateTime.fromMillis(s.start, { zone: tz }).toFormat("HH:mm")}</span> {s.title}
                          <span className="text-muted"> · {duration((s.end - s.start) / 60000)}</span>
                        </span>
                      </Link>
                    ))}
                    {b.milestones.map((m) => (
                      <Link key={m.id} href={`/projects/${m.projectId}`} className="flex items-center gap-2 text-sm hover:text-accent-text">
                        <Flag size={14} className="shrink-0 text-muted" />
                        <span className="truncate">
                          {m.title} <span className="text-muted">· {m.projectTitle}</span>
                        </span>
                      </Link>
                    ))}
                    {b.tasks.map((t) => (
                      <Link key={t.id} href={`/projects/${t.projectId}?tab=board`} className="flex items-center gap-2 text-sm hover:text-accent-text">
                        <ListTodo size={14} className={clsx("shrink-0", t.dueDate! < today ? "text-critical-text" : "text-muted")} />
                        <span className="truncate">
                          {t.title} <span className="text-muted">· {t.projectTitle}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardTitle>Active, nothing planned</CardTitle>
            {plan.unscheduled.length ? (
              <ul className="space-y-2">
                {plan.unscheduled.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}?tab=sessions`} className="flex items-center justify-between gap-2 rounded-lg p-1.5 -m-1.5 text-sm hover:bg-surface-2">
                      <span className="truncate">
                        {p.emoji ?? p.category?.emoji ?? "📁"} {p.title}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-accent-text">Plan →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Every active project has time booked.</p>
            )}
          </Card>
          {plan.projects.length === 0 && <Empty title="Nothing open" action={<LinkButton href="/projects/new" variant="primary">New project</LinkButton>} />}
        </div>
      </div>
    </div>
  );
}
