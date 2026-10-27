import { and, asc, eq, inArray, max, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db/client";
import { milestones, purchases, tasks, projects, type Milestone, type Purchase, type PurchaseStatus, type Task, type TaskStatus } from "@/server/db/schema";
import { isISODate } from "@/lib/time";
import { accessible, getProject, isOnProject, logActivity } from "./projects";

/**
 * Tasks, milestones and purchases: the lists inside a project. Every function
 * takes the acting person (`uid`) and checks they can see the project; the
 * row's own `user_id` only records who added it.
 */

const touch = (projectId: string) => db().update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId)).run();

function checkAssignee(projectId: string, assigneeId: string | null | undefined) {
  if (assigneeId && !isOnProject(projectId, assigneeId)) throw new Error("Tasks can only be given to people on the project. Share it with them first.");
}

function checkDate(label: string, d: string | null | undefined) {
  if (d != null && d !== "" && !isISODate(d)) throw new Error(`${label} must be YYYY-MM-DD`);
}

// ── Tasks ────────────────────────────────────────────────────────────────

export function listTasks(uid: string, projectId: string): Task[] {
  getProject(uid, projectId);
  return db()
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt))
    .all();
}

function getTask(uid: string, id: string): Task {
  const t = db().select().from(tasks).where(eq(tasks.id, id)).get();
  if (!t) throw new Error(`No task ${id}`);
  getProject(uid, t.projectId);
  return t;
}

/** Open tasks given to this person, across every project they're on (doing first). */
export function myTasks(uid: string) {
  return db()
    .select({ t: tasks, title: projects.title, emoji: projects.emoji })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.assigneeId, uid), ne(tasks.status, "done"), accessible(uid), inArray(projects.status, ["idea", "planned", "active", "paused"])))
    .orderBy(asc(tasks.status), asc(tasks.dueDate), asc(tasks.sortOrder))
    .all()
    .map((r) => ({ ...r.t, projectTitle: r.title, projectEmoji: r.emoji }));
}

function endOfColumn(projectId: string, status: TaskStatus): number {
  const m = db().select({ m: max(tasks.sortOrder) }).from(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.status, status))).get()?.m;
  return (m ?? 0) + 1;
}

export interface TaskInput {
  title: string;
  notes?: string;
  status?: TaskStatus;
  milestoneId?: string | null;
  /** A person on the project, or null for anyone. */
  assigneeId?: string | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
}

export function addTask(uid: string, projectId: string, input: TaskInput): Task {
  getProject(uid, projectId);
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error("A task needs a title");
  checkDate("dueDate", input.dueDate);
  checkAssignee(projectId, input.assigneeId);
  const status = input.status ?? "todo";
  const t = db()
    .insert(tasks)
    .values({
      id: randomUUID(),
      userId: uid,
      projectId,
      title,
      notes: input.notes?.trim() ?? "",
      status,
      milestoneId: input.milestoneId ?? null,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate || null,
      estimateMinutes: input.estimateMinutes ?? null,
      sortOrder: endOfColumn(projectId, status),
      doneAt: status === "done" ? new Date() : null,
    })
    .returning()
    .get();
  touch(projectId);
  return t;
}

export function updateTask(uid: string, id: string, patch: Partial<TaskInput> & { sortOrder?: number }): Task {
  const before = getTask(uid, id);
  checkDate("dueDate", patch.dueDate);
  const set: Partial<Task> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 200) || before.title;
  if (patch.notes !== undefined) set.notes = patch.notes.trim();
  if (patch.milestoneId !== undefined) set.milestoneId = patch.milestoneId;
  if (patch.assigneeId !== undefined) {
    checkAssignee(before.projectId, patch.assigneeId);
    set.assigneeId = patch.assigneeId;
  }
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate || null;
  if (patch.estimateMinutes !== undefined) set.estimateMinutes = patch.estimateMinutes;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (patch.status !== undefined && patch.status !== before.status) {
    set.status = patch.status;
    set.doneAt = patch.status === "done" ? new Date() : null;
    if (patch.sortOrder === undefined) set.sortOrder = endOfColumn(before.projectId, patch.status);
  }
  const t = db().update(tasks).set(set).where(eq(tasks.id, id)).returning().get();
  if (set.status === "done") logActivity(uid, before.projectId, "task_done", t.title);
  if (set.status === "doing" && before.status === "todo") autoStart(uid, before.projectId);
  touch(before.projectId);
  return t;
}

/** Picking up the first task of a planned project means it has started. */
function autoStart(uid: string, projectId: string) {
  const p = getProject(uid, projectId);
  if (p.status === "planned" || p.status === "idea") {
    db().update(projects).set({ status: "active", startDate: p.startDate ?? new Date().toISOString().slice(0, 10) }).where(eq(projects.id, projectId)).run();
    logActivity(uid, projectId, "status", `${p.status === "idea" ? "Idea" : "Planned"} → Active`);
  }
}

/** Drop a task into a column between two neighbours (ids or null for the ends). */
export function moveTask(uid: string, id: string, status: TaskStatus, beforeId: string | null, afterId: string | null): Task {
  const t = getTask(uid, id);
  const order = (ref: string | null) => (ref ? getTask(uid, ref).sortOrder : null);
  const a = order(afterId); // the card above
  const b = order(beforeId); // the card below
  const sortOrder = a != null && b != null ? (a + b) / 2 : a != null ? a + 1 : b != null ? b - 1 : endOfColumn(t.projectId, status);
  return updateTask(uid, id, { status, sortOrder });
}

export function deleteTask(uid: string, id: string) {
  const t = getTask(uid, id);
  db().delete(tasks).where(eq(tasks.id, id)).run();
  touch(t.projectId);
}

// ── Milestones ───────────────────────────────────────────────────────────

export function listMilestones(uid: string, projectId: string): Milestone[] {
  getProject(uid, projectId);
  return db()
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .orderBy(asc(milestones.sortOrder), asc(milestones.dueDate))
    .all();
}

export function getMilestone(uid: string, id: string): Milestone {
  const m = db().select().from(milestones).where(eq(milestones.id, id)).get();
  if (!m) throw new Error(`No milestone ${id}`);
  getProject(uid, m.projectId);
  return m;
}

export function addMilestone(uid: string, projectId: string, input: { title: string; dueDate?: string | null }): Milestone {
  getProject(uid, projectId);
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new Error("A milestone needs a title");
  checkDate("dueDate", input.dueDate);
  const n = db().select({ n: sql<number>`count(*)` }).from(milestones).where(eq(milestones.projectId, projectId)).get()?.n ?? 0;
  const m = db()
    .insert(milestones)
    .values({ id: randomUUID(), userId: uid, projectId, title, dueDate: input.dueDate || null, sortOrder: Number(n) })
    .returning()
    .get();
  touch(projectId);
  return m;
}

export function updateMilestone(uid: string, id: string, patch: { title?: string; dueDate?: string | null; done?: boolean; khalEventId?: string | null }): Milestone {
  const before = getMilestone(uid, id);
  checkDate("dueDate", patch.dueDate);
  const set: Partial<Milestone> = {};
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 120) || before.title;
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate || null;
  if (patch.khalEventId !== undefined) set.khalEventId = patch.khalEventId;
  if (patch.done !== undefined) set.doneAt = patch.done ? (before.doneAt ?? new Date()) : null;
  const m = db().update(milestones).set(set).where(eq(milestones.id, id)).returning().get();
  if (patch.done && !before.doneAt) logActivity(uid, before.projectId, "milestone_done", m.title);
  touch(before.projectId);
  return m;
}

export function deleteMilestone(uid: string, id: string) {
  const m = getMilestone(uid, id);
  db().delete(milestones).where(eq(milestones.id, id)).run();
  touch(m.projectId);
}

// ── Purchases ────────────────────────────────────────────────────────────

/** One project's list, or (no project) everything in the projects this person can see. */
export function listPurchases(uid: string, projectId?: string): Purchase[] {
  if (projectId) getProject(uid, projectId);
  return db()
    .select()
    .from(purchases)
    .where(projectId ? eq(purchases.projectId, projectId) : inArray(purchases.projectId, db().select({ id: projects.id }).from(projects).where(accessible(uid))))
    .orderBy(asc(purchases.sortOrder), asc(purchases.createdAt))
    .all();
}

function getPurchase(uid: string, id: string): Purchase {
  const p = db().select().from(purchases).where(eq(purchases.id, id)).get();
  if (!p) throw new Error(`No purchase ${id}`);
  getProject(uid, p.projectId);
  return p;
}

export interface PurchaseInput {
  name: string;
  quantity?: number;
  /** Per unit, in currency units (e.g. 12.5). */
  unitPrice?: number | null;
  currency?: string;
  url?: string | null;
  vendor?: string | null;
  notes?: string;
  status?: PurchaseStatus;
}

export function addPurchase(uid: string, projectId: string, input: PurchaseInput): Purchase {
  const project = getProject(uid, projectId);
  const name = input.name.trim().slice(0, 160);
  if (!name) throw new Error("A purchase needs a name");
  const n = db().select({ n: sql<number>`count(*)` }).from(purchases).where(eq(purchases.projectId, projectId)).get()?.n ?? 0;
  const status = input.status ?? "needed";
  const p = db()
    .insert(purchases)
    .values({
      id: randomUUID(),
      userId: uid,
      projectId,
      name,
      quantity: Math.max(1, Math.round(input.quantity ?? 1)),
      unitCents: input.unitPrice != null ? Math.round(input.unitPrice * 100) : null,
      currency: (input.currency || project.currency).toUpperCase(),
      url: input.url?.trim() || null,
      vendor: input.vendor?.trim() || null,
      notes: input.notes?.trim() ?? "",
      status,
      boughtAt: status === "bought" ? new Date() : null,
      sortOrder: Number(n),
    })
    .returning()
    .get();
  touch(projectId);
  return p;
}

export function updatePurchase(uid: string, id: string, patch: Partial<PurchaseInput>): Purchase {
  const before = getPurchase(uid, id);
  const set: Partial<Purchase> = {};
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 160) || before.name;
  if (patch.quantity !== undefined) set.quantity = Math.max(1, Math.round(patch.quantity));
  if (patch.unitPrice !== undefined) set.unitCents = patch.unitPrice != null ? Math.round(patch.unitPrice * 100) : null;
  if (patch.currency !== undefined) set.currency = patch.currency.toUpperCase();
  if (patch.url !== undefined) set.url = patch.url?.trim() || null;
  if (patch.vendor !== undefined) set.vendor = patch.vendor?.trim() || null;
  if (patch.notes !== undefined) set.notes = patch.notes.trim();
  if (patch.status !== undefined && patch.status !== before.status) {
    set.status = patch.status;
    set.boughtAt = patch.status === "bought" ? new Date() : null;
  }
  const p = db().update(purchases).set(set).where(eq(purchases.id, id)).returning().get();
  if (set.status === "bought") logActivity(uid, before.projectId, "purchase_bought", p.name, (p.unitCents ?? 0) * p.quantity);
  touch(before.projectId);
  return p;
}

export function deletePurchase(uid: string, id: string) {
  const p = getPurchase(uid, id);
  db().delete(purchases).where(eq(purchases.id, id)).run();
  touch(p.projectId);
}
