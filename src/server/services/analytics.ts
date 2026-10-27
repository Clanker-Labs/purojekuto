import { and, eq, gte } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/server/db/client";
import { activity, milestones, projects, tasks, workSessions } from "@/server/db/schema";
import { STATUSES } from "@/lib/projects";
import { DAY, todayIn } from "@/lib/time";
import { listCategories, listProjects } from "./projects";
import { getSettings } from "./settings";

/** Numbers for the Analytics page and the `get_analytics` tool. Everything is per user. */

export interface WeekPoint {
  week: string; // Monday 'YYYY-MM-DD'
  tasksDone: number;
  minutes: number;
  spentCents: number;
}

export function analytics(uid: string, weeks = 12) {
  const { timezone: tz, currency } = getSettings(uid);
  const all = listProjects(uid, { status: "all" });
  const byStatus = STATUSES.map((s) => ({ status: s.id, label: s.label, count: all.filter((p) => p.status === s.id).length }));
  const byCategory = listCategories(uid)
    .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, color: c.color, open: c.open, total: c.total }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const uncategorized = all.filter((p) => !p.categoryId).length;

  // Weekly series from the activity log (Mondays in the user's timezone).
  const thisMonday = DateTime.now().setZone(tz).startOf("week");
  const from = thisMonday.minus({ weeks: weeks - 1 });
  const series: WeekPoint[] = Array.from({ length: weeks }, (_, i) => ({ week: from.plus({ weeks: i }).toISODate()!, tasksDone: 0, minutes: 0, spentCents: 0 }));
  const rows = db().select().from(activity).where(and(eq(activity.userId, uid), gte(activity.at, new Date(from.toMillis())))).all();
  for (const r of rows) {
    const idx = Math.floor((r.at.getTime() - from.toMillis()) / (7 * DAY));
    const pt = series[idx];
    if (!pt) continue;
    if (r.kind === "task_done") pt.tasksDone++;
    else if (r.kind === "session_done") pt.minutes += r.amount ?? 0;
    else if (r.kind === "purchase_bought") pt.spentCents += r.amount ?? 0;
  }

  // Daily heatmap: any activity, last 26 weeks.
  const heatFrom = thisMonday.minus({ weeks: 25 });
  const heat = new Map<string, number>();
  for (const r of db().select({ at: activity.at }).from(activity).where(and(eq(activity.userId, uid), gte(activity.at, new Date(heatFrom.toMillis())))).all()) {
    const d = DateTime.fromJSDate(r.at, { zone: tz }).toISODate()!;
    heat.set(d, (heat.get(d) ?? 0) + 1);
  }
  const heatmap = Array.from({ length: 26 * 7 }, (_, i) => {
    const d = heatFrom.plus({ days: i }).toISODate()!;
    return { date: d, count: heat.get(d) ?? 0 };
  });

  const done = all.filter((p) => p.status === "done" && p.completedAt);
  const year = DateTime.now().setZone(tz).year;
  const doneThisYear = done.filter((p) => DateTime.fromJSDate(p.completedAt!, { zone: tz }).year === year).length;
  const cycleDays = done.map((p) => (p.completedAt!.getTime() - p.createdAt.getTime()) / DAY);
  const medianCycle = cycleDays.length ? cycleDays.sort((a, b) => a - b)[Math.floor(cycleDays.length / 2)] : null;

  const hoursByProject = all
    .filter((p) => p.minutesWorked > 0)
    .map((p) => ({ id: p.id, title: p.title, emoji: p.emoji, minutes: p.minutesWorked, color: p.category?.color ?? null }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 8);
  const budgets = all
    .filter((p) => p.status !== "dropped" && (p.budgetCents != null || p.plannedSpendCents > 0))
    .map((p) => ({ id: p.id, title: p.title, emoji: p.emoji, currency: p.currency, budgetCents: p.budgetCents, plannedCents: p.plannedSpendCents, spentCents: p.spentCents }))
    .sort((a, b) => b.spentCents - a.spentCents)
    .slice(0, 8);

  const open = all.filter((p) => ["planned", "active", "paused", "idea"].includes(p.status));
  const today = todayIn(tz);
  const overdue = open.filter((p) => p.targetDate && p.targetDate < today).map((p) => ({ id: p.id, title: p.title, targetDate: p.targetDate! }));
  const stale = open
    .filter((p) => p.status === "active" && Date.now() - p.updatedAt.getTime() > 21 * DAY)
    .map((p) => ({ id: p.id, title: p.title, idleDays: Math.round((Date.now() - p.updatedAt.getTime()) / DAY) }));

  return {
    currency,
    totals: {
      projects: all.length,
      open: open.length,
      active: all.filter((p) => p.status === "active").length,
      doneThisYear,
      medianDaysToDone: medianCycle != null ? Math.round(medianCycle) : null,
      tasksDone: all.reduce((n, p) => n + p.tasksDone, 0),
      tasksOpen: all.reduce((n, p) => n + (p.tasksTotal - p.tasksDone), 0),
      minutesWorked: all.reduce((n, p) => n + p.minutesWorked, 0),
      spentCents: all.reduce((n, p) => n + (p.currency === currency ? p.spentCents : 0), 0),
      toBuy: all.reduce((n, p) => n + (["done", "dropped"].includes(p.status) ? 0 : p.toBuy), 0),
    },
    byStatus,
    byCategory,
    uncategorized,
    weekly: series,
    heatmap,
    hoursByProject,
    budgets,
    overdue,
    stale,
  };
}

export type Analytics = ReturnType<typeof analytics>;

/** What's on the plate between two dates: sessions, milestones and dated tasks, plus project bars. */
export function planning(uid: string, fromDate: string, toDate: string) {
  const tz = getSettings(uid).timezone;
  const fromMs = DateTime.fromISO(fromDate, { zone: tz }).toMillis();
  const toMs = DateTime.fromISO(toDate, { zone: tz }).plus({ days: 1 }).toMillis();
  const open = listProjects(uid, { status: "open" });
  const ids = new Set(open.map((p) => p.id));
  const sessions = db()
    .select({ s: workSessions, title: projects.title, emoji: projects.emoji })
    .from(workSessions)
    .innerJoin(projects, eq(projects.id, workSessions.projectId))
    .where(and(eq(workSessions.userId, uid), gte(workSessions.end, fromMs)))
    .all()
    .filter((r) => r.s.start < toMs)
    .map((r) => ({ ...r.s, projectTitle: r.title, projectEmoji: r.emoji }))
    .sort((a, b) => a.start - b.start);
  const ms = db()
    .select({ m: milestones, title: projects.title, emoji: projects.emoji })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(eq(milestones.userId, uid))
    .all()
    .filter((r) => r.m.dueDate && r.m.dueDate >= fromDate && r.m.dueDate <= toDate && ids.has(r.m.projectId))
    .map((r) => ({ ...r.m, projectTitle: r.title, projectEmoji: r.emoji }));
  const dueTasks = db()
    .select({ t: tasks, title: projects.title })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(tasks.userId, uid))
    .all()
    .filter((r) => r.t.dueDate && r.t.status !== "done" && r.t.dueDate <= toDate && ids.has(r.t.projectId))
    .map((r) => ({ ...r.t, projectTitle: r.title }));
  const unscheduled = open.filter((p) => p.status === "active" && !p.nextSession);
  return { timezone: tz, projects: open, sessions, milestones: ms, dueTasks, unscheduled };
}
