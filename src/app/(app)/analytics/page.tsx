import Link from "next/link";
import { AlertTriangle, Hourglass } from "lucide-react";
import { requireUser } from "@/server/session";
import { analytics } from "@/server/services/analytics";
import { getSettings } from "@/server/services/settings";
import { Card, CardTitle, PageHeader, Stat } from "@/components/bits";
import { HBars, Heatmap, StackBar, WeekBars } from "@/components/charts";
import { duration, money, shortDate } from "@/lib/format";
import { todayIn } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

const STATUS_COLORS: Record<string, string> = {
  active: "var(--accent)",
  planned: "var(--series-2)",
  idea: "var(--series-7)",
  paused: "var(--warning)",
  done: "var(--series-1)",
  dropped: "var(--border-strong)",
};

export default async function AnalyticsPage() {
  const user = await requireUser();
  const tz = getSettings(user.id).timezone;
  const a = analytics(user.id);
  const t = a.totals;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle="How the making is going: throughput, time, money, and what's slipping." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Open projects" value={t.open} hint={`${t.active} active`} />
        <Stat label="Done this year" value={t.doneThisYear} hint={t.medianDaysToDone != null ? `median ${t.medianDaysToDone} days from idea to done` : undefined} />
        <Stat label="Tasks done" value={t.tasksDone} hint={`${t.tasksOpen} still open`} />
        <Stat label="Time worked" value={t.minutesWorked ? duration(t.minutesWorked) : "—"} hint="from completed sessions" />
        <Stat label="Spent" value={money(t.spentCents, a.currency)} hint={`${t.toBuy} item${t.toBuy === 1 ? "" : "s"} still to buy`} />
        <Stat label="All projects" value={t.projects} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <WeekBars label="Tasks done per week" data={a.weekly.map((w) => ({ week: w.week, value: w.tasksDone }))} />
        </Card>
        <Card>
          <WeekBars label="Hours worked per week" color="var(--series-2)" data={a.weekly.map((w) => ({ week: w.week, value: w.minutes }))} format={(v) => (v ? duration(v) : "0")} />
        </Card>
      </div>

      <Card>
        <CardTitle>Activity, last six months</CardTitle>
        <Heatmap days={a.heatmap} today={todayIn(tz)} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardTitle>By status</CardTitle>
          <StackBar parts={a.byStatus.map((s) => ({ key: s.status, label: s.label, value: s.count, color: STATUS_COLORS[s.status] }))} />
        </Card>
        <Card>
          <CardTitle>By category</CardTitle>
          <HBars
            rows={a.byCategory.map((c) => ({ key: c.id, label: `${c.emoji} ${c.name}`, value: c.open, secondary: c.total, color: c.color }))}
            format={(v) => `${v} open`}
            empty="Categorize projects to see where your energy goes."
          />
          {a.byCategory.length > 0 && <p className="mt-3 text-xs text-muted">Grey: all projects in the category, including done.</p>}
        </Card>
        <Card>
          <CardTitle>Time by project</CardTitle>
          <HBars
            rows={a.hoursByProject.map((p) => ({ key: p.id, label: <Link href={`/projects/${p.id}`} className="hover:text-accent-text">{p.emoji ?? ""} {p.title}</Link>, value: p.minutes, color: p.color ?? undefined }))}
            format={(v) => duration(v)}
            empty="Mark working sessions done to see where the hours go."
          />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardTitle>Money</CardTitle>
          {a.budgets.length ? (
            <ul className="space-y-3">
              {a.budgets.map((b) => {
                const cap = Math.max(b.budgetCents ?? 0, b.plannedCents, b.spentCents, 1);
                const over = b.budgetCents != null && b.spentCents > b.budgetCents;
                return (
                  <li key={b.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <Link href={`/projects/${b.id}?tab=buy`} className="min-w-0 truncate hover:text-accent-text">
                        {b.emoji ?? ""} {b.title}
                      </Link>
                      <span className={`tabular shrink-0 text-xs ${over ? "font-semibold text-critical-text" : "text-ink-2"}`}>
                        {money(b.spentCents, b.currency)}
                        {b.budgetCents != null ? ` / ${money(b.budgetCents, b.currency)}` : b.plannedCents ? ` of ~${money(b.plannedCents, b.currency)}` : ""}
                      </span>
                    </div>
                    <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className="absolute inset-y-0 left-0 bg-[color-mix(in_srgb,var(--series-3)_35%,transparent)]" style={{ width: `${(b.plannedCents / cap) * 100}%` }} />
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(b.spentCents / cap) * 100}%`, background: over ? "var(--critical)" : "var(--series-3)" }} />
                      {b.budgetCents != null && <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(b.budgetCents / cap) * 100}%` }} title="Budget" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">Set budgets or price your shopping lists to track spend.</p>
          )}
        </Card>
        <Card>
          <CardTitle>Needs attention</CardTitle>
          {!a.overdue.length && !a.stale.length && <p className="text-sm text-ink-2">Nothing overdue, nothing stalled. 👌</p>}
          <ul className="space-y-2">
            {a.overdue.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <AlertTriangle size={14} className="shrink-0 text-critical-text" />
                <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 truncate hover:text-accent-text">
                  {p.title}
                </Link>
                <span className="shrink-0 text-xs text-critical-text">due {shortDate(p.targetDate)}</span>
              </li>
            ))}
            {a.stale.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <Hourglass size={14} className="shrink-0 text-warning" />
                <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 truncate hover:text-accent-text">
                  {p.title}
                </Link>
                <span className="shrink-0 text-xs text-muted">untouched {p.idleDays} days</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
