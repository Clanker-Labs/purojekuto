import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db/client";
import {
  activity,
  aiJobs,
  categories,
  milestones,
  projectMembers,
  projects,
  purchases,
  specs,
  tasks,
  users,
  workSessions,
  type ActivityKind,
  type Category,
  type Project,
  type ProjectStatus,
} from "@/server/db/schema";
import { CATEGORY_COLORS, STATUS_IDS, statusLabel } from "@/lib/projects";
import { isISODate } from "@/lib/time";
import { getSettings } from "./settings";

// ── Access ───────────────────────────────────────────────────────────────

/**
 * A project belongs to whoever created it (`projects.user_id`) and is shared
 * with the people in `project_members`. Everything inside a project (tasks,
 * milestones, purchases, specs, sessions) is visible to all of them, so the
 * services check access through the project, never through the row's own
 * `user_id` (which only records who added it).
 */
export function accessible(uid: string): SQL {
  return or(
    eq(projects.userId, uid),
    inArray(projects.id, db().select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, uid))),
  )!;
}

export function accessibleIds(uid: string): string[] {
  return db().select({ id: projects.id }).from(projects).where(accessible(uid)).all().map((r) => r.id);
}

// ── Activity ─────────────────────────────────────────────────────────────

export function logActivity(uid: string, projectId: string | null, kind: ActivityKind, detail = "", amount: number | null = null) {
  db().insert(activity).values({ userId: uid, projectId, kind, detail: detail.slice(0, 300), amount }).run();
}

/** What happened in the projects this person can see (by anyone), newest first. `by` is who did it. */
export function recentActivity(uid: string, opts: { projectId?: string; limit?: number } = {}) {
  if (opts.projectId) getProject(uid, opts.projectId);
  return db()
    .select({ a: activity, projectTitle: projects.title, projectEmoji: projects.emoji, by: users.name })
    .from(activity)
    .leftJoin(projects, eq(projects.id, activity.projectId))
    .leftJoin(users, eq(users.id, activity.userId))
    .where(
      opts.projectId
        ? eq(activity.projectId, opts.projectId)
        : or(and(isNull(activity.projectId), eq(activity.userId, uid)), inArray(activity.projectId, db().select({ id: projects.id }).from(projects).where(accessible(uid)))),
    )
    .orderBy(desc(activity.at), desc(activity.id))
    .limit(opts.limit ?? 30)
    .all()
    .map((r) => ({ ...r.a, projectTitle: r.projectTitle, projectEmoji: r.projectEmoji, by: r.a.userId === uid ? null : r.by }));
}

// ── Categories ───────────────────────────────────────────────────────────

export function listCategories(uid: string): (Category & { open: number; total: number })[] {
  const counts = db()
    .select({
      categoryId: projects.categoryId,
      total: sql<number>`count(*)`,
      open: sql<number>`sum(case when ${projects.status} in ('idea','planned','active','paused') then 1 else 0 end)`,
    })
    .from(projects)
    .where(eq(projects.userId, uid))
    .groupBy(projects.categoryId)
    .all();
  const by = new Map(counts.map((c) => [c.categoryId, c]));
  return db()
    .select()
    .from(categories)
    .where(eq(categories.userId, uid))
    .orderBy(asc(categories.sortOrder), asc(categories.name))
    .all()
    .map((c) => ({ ...c, open: Number(by.get(c.id)?.open ?? 0), total: Number(by.get(c.id)?.total ?? 0) }));
}

export function findCategory(uid: string, idOrName: string): Category | undefined {
  const all = db().select().from(categories).where(eq(categories.userId, uid)).all();
  const k = idOrName.trim().toLowerCase();
  return all.find((c) => c.id === idOrName) ?? all.find((c) => c.name.toLowerCase() === k) ?? all.find((c) => c.name.toLowerCase().startsWith(k));
}

/** A category id from an id or a name; unknown names are created (agents name shelves freely). */
export function resolveCategory(uid: string, idOrName: string | null | undefined): string | null {
  if (!idOrName?.trim()) return null;
  const found = findCategory(uid, idOrName);
  return found ? found.id : createCategory(uid, { name: idOrName }).id;
}

export function createCategory(uid: string, input: { name: string; emoji?: string; color?: string }): Category {
  const name = input.name.trim().slice(0, 40);
  if (!name) throw new Error("A category needs a name");
  const n = db().select({ n: sql<number>`count(*)` }).from(categories).where(eq(categories.userId, uid)).get()?.n ?? 0;
  return db()
    .insert(categories)
    .values({
      id: randomUUID(),
      userId: uid,
      name,
      emoji: input.emoji?.trim() || "📁",
      color: input.color ?? CATEGORY_COLORS[Number(n) % CATEGORY_COLORS.length],
      sortOrder: Number(n),
    })
    .returning()
    .get();
}

export function updateCategory(uid: string, id: string, patch: { name?: string; emoji?: string; color?: string; sortOrder?: number }) {
  const set: Partial<Category> = {};
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 40);
  if (patch.emoji !== undefined) set.emoji = patch.emoji.trim() || "📁";
  if (patch.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(patch.color)) throw new Error("color must be #rrggbb");
    set.color = patch.color;
  }
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  return db().update(categories).set(set).where(and(eq(categories.id, id), eq(categories.userId, uid))).returning().get();
}

/** Projects in it keep existing, uncategorized. */
export function deleteCategory(uid: string, id: string) {
  db().delete(categories).where(and(eq(categories.id, id), eq(categories.userId, uid))).run();
}

// ── Projects ─────────────────────────────────────────────────────────────

export interface ProjectInput {
  title: string;
  pitch?: string;
  notes?: string;
  status?: ProjectStatus;
  category?: string | null;
  priority?: number;
  emoji?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  budget?: number | null;
  currency?: string;
  sourceRef?: string | null;
  pinned?: boolean;
}

function checkDate(label: string, d: string | null | undefined) {
  if (d != null && d !== "" && !isISODate(d)) throw new Error(`${label} must be YYYY-MM-DD`);
}

export function createProject(uid: string, input: ProjectInput): Project {
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new Error("A project needs a title");
  checkDate("startDate", input.startDate);
  checkDate("targetDate", input.targetDate);
  if (input.status && !STATUS_IDS.includes(input.status)) throw new Error(`status must be one of ${STATUS_IDS.join(", ")}`);
  const p = db()
    .insert(projects)
    .values({
      id: randomUUID(),
      userId: uid,
      title,
      pitch: input.pitch?.trim().slice(0, 300) ?? "",
      notes: input.notes?.trim().slice(0, 20_000) ?? "",
      status: input.status ?? "planned",
      categoryId: resolveCategory(uid, input.category),
      priority: Math.min(3, Math.max(1, input.priority ?? 2)),
      emoji: input.emoji?.trim() || null,
      startDate: input.startDate || null,
      targetDate: input.targetDate || null,
      budgetCents: input.budget != null ? Math.round(input.budget * 100) : null,
      currency: (input.currency || getSettings(uid).currency).toUpperCase(),
      sourceRef: input.sourceRef ?? null,
      pinned: input.pinned ?? false,
    })
    .returning()
    .get();
  logActivity(uid, p.id, "created", input.sourceRef ? `from ${input.sourceRef}` : "");
  return p;
}

/** A project this person owns or is a member of. */
export function getProject(uid: string, id: string): Project {
  const p = db().select().from(projects).where(and(eq(projects.id, id), accessible(uid))).get();
  if (!p) throw new Error(`No project ${id}`);
  return p;
}

/** Sharing and deleting are the owner's. */
export function getOwnProject(uid: string, id: string): Project {
  const p = getProject(uid, id);
  if (p.userId !== uid) throw new Error(`Only the owner of “${p.title}” can do that`);
  return p;
}

/** By id, exact title, or the one title that starts with / contains the text. */
export function findProject(uid: string, ref: string): Project {
  const byId = db().select().from(projects).where(and(eq(projects.id, ref), accessible(uid))).get();
  if (byId) return byId;
  const all = db().select().from(projects).where(accessible(uid)).all();
  const k = ref.trim().toLowerCase();
  const exact = all.filter((p) => p.title.toLowerCase() === k);
  if (exact.length === 1) return exact[0];
  const loose = all.filter((p) => p.title.toLowerCase().includes(k));
  if (loose.length === 1) return loose[0];
  if (loose.length > 1) throw new Error(`"${ref}" matches several projects: ${loose.map((p) => `${p.title} (${p.id})`).join(", ")}`);
  throw new Error(`No project "${ref}"`);
}

export function updateProject(uid: string, id: string, patch: Partial<ProjectInput>): Project {
  const before = getProject(uid, id);
  checkDate("startDate", patch.startDate);
  checkDate("targetDate", patch.targetDate);
  if (patch.status && !STATUS_IDS.includes(patch.status)) throw new Error(`status must be one of ${STATUS_IDS.join(", ")}`);
  const set: Partial<Project> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 120) || before.title;
  if (patch.pitch !== undefined) set.pitch = patch.pitch.trim().slice(0, 300);
  if (patch.notes !== undefined) set.notes = patch.notes.trim().slice(0, 20_000);
  // Categories are the owner's shelves, whoever files it.
  if (patch.category !== undefined) set.categoryId = resolveCategory(before.userId, patch.category);
  if (patch.priority !== undefined) set.priority = Math.min(3, Math.max(1, patch.priority));
  if (patch.emoji !== undefined) set.emoji = patch.emoji?.trim() || null;
  if (patch.startDate !== undefined) set.startDate = patch.startDate || null;
  if (patch.targetDate !== undefined) set.targetDate = patch.targetDate || null;
  if (patch.budget !== undefined) set.budgetCents = patch.budget != null ? Math.round(patch.budget * 100) : null;
  if (patch.currency !== undefined) set.currency = patch.currency.toUpperCase();
  if (patch.pinned !== undefined) set.pinned = patch.pinned;
  if (patch.status !== undefined && patch.status !== before.status) {
    set.status = patch.status;
    set.completedAt = patch.status === "done" ? new Date() : null;
    if (patch.status === "active" && !before.startDate && patch.startDate === undefined) set.startDate = new Date().toISOString().slice(0, 10);
  }
  const p = db().update(projects).set(set).where(eq(projects.id, id)).returning().get();
  if (set.status) logActivity(uid, id, "status", `${statusLabel(before.status)} → ${statusLabel(set.status)}`);
  return p;
}

export function deleteProject(uid: string, id: string) {
  getOwnProject(uid, id);
  db().delete(projects).where(eq(projects.id, id)).run();
}

// ── People on a project ──────────────────────────────────────────────────

export interface Person {
  id: string;
  name: string;
}

export interface ProjectPerson extends Person {
  role: "owner" | "member";
}

/** Everyone with an account here: who a project can be shared with. */
export function listPeople(): Person[] {
  return db().select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.createdAt)).all();
}

/** By id, exact name, or the one name that starts with the text; "me" is the caller. */
export function findPerson(uid: string, ref: string): Person {
  const all = listPeople();
  const k = ref.trim().toLowerCase();
  if (k === "me" || k === "myself") return all.find((p) => p.id === uid)!;
  const hit = all.find((p) => p.id === ref) ?? all.find((p) => p.name.toLowerCase() === k);
  if (hit) return hit;
  const loose = all.filter((p) => p.name.toLowerCase().startsWith(k));
  if (loose.length === 1) return loose[0];
  throw new Error(loose.length ? `"${ref}" matches ${loose.map((p) => p.name).join(", ")}` : `Nobody called "${ref}" has an account here. Invite them from Settings → People.`);
}

/** Owner first, then members in the order they were added. */
export function listMembers(uid: string, projectId: string): ProjectPerson[] {
  return membersOf([getProject(uid, projectId)]).get(projectId) ?? [];
}

function membersOf(list: Pick<Project, "id" | "userId">[]): Map<string, ProjectPerson[]> {
  const out = new Map<string, ProjectPerson[]>();
  if (!list.length) return out;
  const names = new Map(listPeople().map((p) => [p.id, p.name]));
  for (const p of list) out.set(p.id, [{ id: p.userId, name: names.get(p.userId) ?? "?", role: "owner" }]);
  const rows = db()
    .select()
    .from(projectMembers)
    .where(inArray(projectMembers.projectId, list.map((p) => p.id)))
    .orderBy(asc(projectMembers.addedAt))
    .all();
  for (const r of rows) out.get(r.projectId)?.push({ id: r.userId, name: names.get(r.userId) ?? "?", role: "member" });
  return out;
}

export function isOnProject(projectId: string, userId: string): boolean {
  const p = db().select({ owner: projects.userId }).from(projects).where(eq(projects.id, projectId)).get();
  if (!p) return false;
  if (p.owner === userId) return true;
  return !!db().select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).get();
}

export function addMember(uid: string, projectId: string, personId: string): ProjectPerson[] {
  const p = getOwnProject(uid, projectId);
  if (!listPeople().some((x) => x.id === personId)) throw new Error("That person has no account here");
  if (personId !== p.userId) {
    const added = db().insert(projectMembers).values({ projectId, userId: personId }).onConflictDoNothing().run().changes;
    if (added) logActivity(uid, projectId, "member", `${listPeople().find((x) => x.id === personId)?.name} joined`);
  }
  return listMembers(uid, projectId);
}

/** The owner removes anyone; a member can remove themselves (leave). Their tasks become unassigned. */
export function removeMember(uid: string, projectId: string, personId: string) {
  const p = getProject(uid, projectId);
  if (p.userId !== uid && personId !== uid) throw new Error(`Only the owner of “${p.title}” can remove people`);
  if (personId === p.userId) throw new Error("The owner can't leave their own project. Delete it instead.");
  const gone = db().delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, personId))).run().changes;
  if (!gone) return;
  db().update(tasks).set({ assigneeId: null }).where(and(eq(tasks.projectId, projectId), eq(tasks.assigneeId, personId))).run();
  logActivity(uid, projectId, "member", `${listPeople().find((x) => x.id === personId)?.name} left`);
}

// ── Summaries ────────────────────────────────────────────────────────────

export interface ProjectSummary extends Project {
  category: Pick<Category, "id" | "name" | "emoji" | "color"> | null;
  /** Owner first. More than one = shared. */
  people: ProjectPerson[];
  tasksTotal: number;
  tasksDone: number;
  tasksDoing: number;
  milestonesTotal: number;
  milestonesDone: number;
  nextMilestone: { title: string; dueDate: string | null } | null;
  spentCents: number;
  plannedSpendCents: number;
  toBuy: number;
  minutesWorked: number;
  nextSession: { start: number; end: number } | null;
  hasSpec: boolean;
  generating: boolean;
  /** 0–100, from tasks (milestones when there are no tasks). */
  progress: number;
}

export interface ProjectFilter {
  status?: ProjectStatus | "open" | "all";
  categoryId?: string | null;
  q?: string;
  /** Only projects shared with this person by someone else. */
  sharedWithMe?: boolean;
}

export function listProjects(uid: string, filter: ProjectFilter = {}): ProjectSummary[] {
  const status = filter.status ?? "open";
  const rows = db()
    .select({ p: projects, c: categories })
    .from(projects)
    .leftJoin(categories, eq(categories.id, projects.categoryId))
    .where(
      and(
        accessible(uid),
        filter.sharedWithMe ? sql`${projects.userId} != ${uid}` : undefined,
        status === "all" ? undefined : status === "open" ? inArray(projects.status, ["idea", "planned", "active", "paused"]) : eq(projects.status, status),
        filter.categoryId === undefined ? undefined : filter.categoryId === null ? isNull(projects.categoryId) : eq(projects.categoryId, filter.categoryId),
      ),
    )
    .all();
  const q = filter.q?.trim().toLowerCase();
  const list = q ? rows.filter((r) => `${r.p.title} ${r.p.pitch} ${r.p.notes}`.toLowerCase().includes(q)) : rows;
  return summarize(uid, list);
}

function summarize(uid: string, rows: { p: Project; c: Category | null }[]): ProjectSummary[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.p.id);
  const now = Date.now();
  const people = membersOf(rows.map((r) => r.p));
  const taskStats = new Map(
    db()
      .select({
        id: tasks.projectId,
        total: sql<number>`count(*)`,
        done: sql<number>`sum(case when ${tasks.status}='done' then 1 else 0 end)`,
        doing: sql<number>`sum(case when ${tasks.status}='doing' then 1 else 0 end)`,
      })
      .from(tasks)
      .where(inArray(tasks.projectId, ids))
      .groupBy(tasks.projectId)
      .all()
      .map((r) => [r.id, r]),
  );
  const ms = db().select().from(milestones).where(inArray(milestones.projectId, ids)).orderBy(asc(milestones.sortOrder)).all();
  const buy = new Map(
    db()
      .select({
        id: purchases.projectId,
        spent: sql<number>`coalesce(sum(case when ${purchases.status}='bought' then coalesce(${purchases.unitCents},0)*${purchases.quantity} else 0 end),0)`,
        planned: sql<number>`coalesce(sum(coalesce(${purchases.unitCents},0)*${purchases.quantity}),0)`,
        toBuy: sql<number>`sum(case when ${purchases.status}!='bought' then 1 else 0 end)`,
      })
      .from(purchases)
      .where(inArray(purchases.projectId, ids))
      .groupBy(purchases.projectId)
      .all()
      .map((r) => [r.id, r]),
  );
  const sess = db().select().from(workSessions).where(inArray(workSessions.projectId, ids)).all();
  const specIds = new Set(db().select({ id: specs.projectId }).from(specs).where(inArray(specs.projectId, ids)).all().map((r) => r.id));
  const busy = new Set(
    db()
      .select({ id: aiJobs.projectId })
      .from(aiJobs)
      .where(and(inArray(aiJobs.projectId, ids), inArray(aiJobs.status, ["queued", "running"])))
      .all()
      .map((r) => r.id),
  );

  const out = rows.map(({ p, c }): ProjectSummary => {
    const t = taskStats.get(p.id);
    const pm = ms.filter((m) => m.projectId === p.id);
    const next = pm.find((m) => !m.doneAt);
    const b = buy.get(p.id);
    const ps = sess.filter((s) => s.projectId === p.id);
    const upcoming = ps.filter((s) => s.status === "planned" && s.end > now).sort((a, b) => a.start - b.start)[0];
    const tasksTotal = Number(t?.total ?? 0);
    const tasksDone = Number(t?.done ?? 0);
    const milestonesDone = pm.filter((m) => m.doneAt).length;
    const progress =
      p.status === "done" ? 100 : tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : pm.length ? Math.round((milestonesDone / pm.length) * 100) : 0;
    return {
      ...p,
      category: c ? { id: c.id, name: c.name, emoji: c.emoji, color: c.color } : null,
      people: people.get(p.id) ?? [],
      tasksTotal,
      tasksDone,
      tasksDoing: Number(t?.doing ?? 0),
      milestonesTotal: pm.length,
      milestonesDone,
      nextMilestone: next ? { title: next.title, dueDate: next.dueDate } : null,
      spentCents: Number(b?.spent ?? 0),
      plannedSpendCents: Number(b?.planned ?? 0),
      toBuy: Number(b?.toBuy ?? 0),
      minutesWorked: ps.filter((s) => s.status === "done").reduce((n, s) => n + Math.round((s.end - s.start) / 60_000), 0),
      nextSession: upcoming ? { start: upcoming.start, end: upcoming.end } : null,
      hasSpec: specIds.has(p.id),
      generating: busy.has(p.id),
      progress,
    };
  });
  const statusRank: Record<ProjectStatus, number> = { active: 0, planned: 1, idea: 2, paused: 3, done: 4, dropped: 5 };
  return out.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      statusRank[a.status] - statusRank[b.status] ||
      b.priority - a.priority ||
      b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}

export function projectSummary(uid: string, id: string): ProjectSummary {
  const row = db()
    .select({ p: projects, c: categories })
    .from(projects)
    .leftJoin(categories, eq(categories.id, projects.categoryId))
    .where(and(eq(projects.id, id), accessible(uid)))
    .get();
  if (!row) throw new Error(`No project ${id}`);
  return summarize(uid, [row])[0];
}
