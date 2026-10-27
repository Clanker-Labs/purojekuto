import Link from "next/link";
import { DateTime } from "luxon";
import { CalendarClock, Flag, FolderKanban, ListTodo, Sparkles } from "lucide-react";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/services/settings";
import { listCategories, listProjects, recentActivity } from "@/server/services/projects";
import { analytics, planning } from "@/server/services/analytics";
import { aiStatus } from "@/server/ai/providers";
import { Card, CardTitle, Empty, LinkButton, Stat } from "@/components/bits";
import { ProjectCard } from "@/components/project-card";
import { QuickCapture } from "@/components/quick-capture";
import { duration, relativeDay } from "@/lib/format";
import { todayIn } from "@/lib/time";
import { describeActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

function greeting(hour: number) {
  return hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function HomePage() {
  const user = await requireUser();
  const { timezone: tz } = getSettings(user.id);
  const now = DateTime.now().setZone(tz);
  const today = todayIn(tz);
  const all = listProjects(user.id, { status: "open" });
  const active = all.filter((p) => p.status === "active");
  const upNext = all.filter((p) => p.status === "planned").slice(0, 3);
  const plan = planning(user.id, today, now.plus({ days: 7 }).toISODate()!);
  const stats = analytics(user.id, 5);
  const ai = aiStatus(user.id);
  const doing = active.reduce((n, p) => n + p.tasksDoing, 0);
  const thisMonthMinutes = stats.weekly.slice(-4).reduce((n, w) => n + w.minutes, 0);
  const feed = recentActivity(user.id, { limit: 6 });

  const agenda = [
    ...plan.sessions.filter((s) => s.status === "planned").map((s) => ({ key: s.id, at: s.start, day: DateTime.fromMillis(s.start, { zone: tz }).toISODate()!, kind: "session" as const, title: s.title, project: s.projectTitle, projectId: s.projectId, minutes: (s.end - s.start) / 60000 })),
    ...plan.milestones.filter((m) => !m.doneAt).map((m) => ({ key: m.id, at: DateTime.fromISO(m.dueDate!, { zone: tz }).toMillis(), day: m.dueDate!, kind: "milestone" as const, title: m.title, project: m.projectTitle, projectId: m.projectId, minutes: 0 })),
    ...plan.dueTasks.map((t) => ({ key: t.id, at: DateTime.fromISO(t.dueDate!, { zone: tz }).toMillis(), day: t.dueDate!, kind: "task" as const, title: t.title, project: t.projectTitle, projectId: t.projectId, minutes: 0 })),
  ].sort((a, b) => a.at - b.at);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted">{now.toFormat("cccc d LLLL")}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
          {greeting(now.hour)}, {user.name.split(" ")[0]}
        </h1>
      </div>

      <QuickCapture categories={listCategories(user.id).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))} aiReady={ai.ready} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active" value={active.length} hint={doing ? `${doing} task${doing === 1 ? "" : "s"} in progress` : "nothing in progress"} />
        <Stat label="Planned & ideas" value={all.length - active.length} />
        <Stat label="Worked, last 4 weeks" value={thisMonthMinutes ? duration(thisMonthMinutes) : "—"} />
        <Stat label="Done this year" value={stats.totals.doneThisYear} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section>
            <CardTitle action={<Link href="/projects" className="text-xs font-medium text-accent-text hover:underline">All projects</Link>}>Active</CardTitle>
            {active.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {active.map((p) => (
                  <ProjectCard key={p.id} p={p} today={today} tz={tz} />
                ))}
              </div>
            ) : (
              <Empty icon={<FolderKanban size={20} />} title="Nothing on the go" action={upNext[0] ? <LinkButton href={`/projects/${upNext[0].id}`}>Start “{upNext[0].title}”</LinkButton> : <LinkButton href="/projects/new" variant="primary">New project</LinkButton>}>
                Moving a task to Doing starts a project. Pick something small.
              </Empty>
            )}
          </section>
          {upNext.length > 0 && (
            <section>
              <CardTitle>Up next</CardTitle>
              <div className="grid gap-3 sm:grid-cols-3">
                {upNext.map((p) => (
                  <ProjectCard key={p.id} p={p} today={today} tz={tz} />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle action={<Link href="/planning" className="text-xs font-medium text-accent-text hover:underline">Planning</Link>}>Next 7 days</CardTitle>
            {agenda.length ? (
              <ul className="space-y-2.5">
                {agenda.slice(0, 8).map((a) => (
                  <li key={a.key}>
                    <Link href={`/projects/${a.projectId}`} className="flex gap-3 rounded-lg p-1 -m-1 hover:bg-surface-2">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                        {a.kind === "session" ? <CalendarClock size={14} /> : a.kind === "milestone" ? <Flag size={14} /> : <ListTodo size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {a.project} ·{" "}
                          {a.kind === "session"
                            ? `${DateTime.fromMillis(a.at, { zone: tz }).toFormat("ccc HH:mm")}, ${duration(a.minutes)}`
                            : relativeDay(a.day, today)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Nothing scheduled. Plan a working session from a project, or ask LeClanker to find you a slot.</p>
            )}
            {plan.unscheduled.length > 0 && (
              <p className="mt-4 border-t border-border pt-3 text-xs text-ink-2">
                No session planned for {plan.unscheduled.slice(0, 3).map((p) => p.title).join(", ")}
                {plan.unscheduled.length > 3 ? ` and ${plan.unscheduled.length - 3} more` : ""}.
              </p>
            )}
          </Card>

          {!ai.ready && (
            <Card className="border-dashed">
              <div className="flex gap-3">
                <Sparkles size={18} className="mt-0.5 shrink-0 text-accent-text" />
                <div className="text-sm">
                  <p className="font-medium">AI specs are not set up</p>
                  <p className="mt-0.5 text-ink-2">{ai.reason}</p>
                  <Link href="/settings#ai" className="mt-2 inline-block text-xs font-medium text-accent-text hover:underline">
                    Open settings
                  </Link>
                </div>
              </div>
            </Card>
          )}

          {feed.length > 0 && (
            <Card>
              <CardTitle>Lately</CardTitle>
              <ul className="space-y-2 text-sm">
                {feed.map((a) => (
                  <li key={a.id} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    <span className="min-w-0 text-ink-2">
                      <span className="text-ink">{a.projectTitle}</span>: {describeActivity(a.kind, a.detail).replace(/^./, (c) => c.toLowerCase())}
                      <span className="text-muted"> · {DateTime.fromJSDate(a.at, { zone: tz }).toRelative()}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
