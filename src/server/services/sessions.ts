import { and, asc, eq, gte, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db/client";
import { projects, workSessions, type SessionStatus, type WorkSession } from "@/server/db/schema";
import { createKhalEvent, deleteKhalEvent, khalConfigured, updateKhalEvent } from "@/server/integrations/khal";
import { MINUTE } from "@/lib/time";
import { getProject, logActivity } from "./projects";
import { getMilestone, updateMilestone } from "./items";
import { getSettings } from "./settings";

/**
 * Working sessions: blocks of time on a project. The row here is what
 * analytics count; khal gets a mirror event so the time shows up next to the
 * rest of the week. A khal failure never loses the session — it is saved
 * with `khalError` and retried on the next edit (or with resync).
 */

function publicLink(projectId: string): string | null {
  const base = process.env.PUROJEKUTO_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/projects/${projectId}` : null;
}

function syncOn(uid: string) {
  return khalConfigured() && getSettings(uid).khalSync;
}

export function listSessions(uid: string, opts: { projectId?: string; from?: number; to?: number } = {}) {
  return db()
    .select({ s: workSessions, title: projects.title, emoji: projects.emoji })
    .from(workSessions)
    .innerJoin(projects, eq(projects.id, workSessions.projectId))
    .where(
      and(
        eq(workSessions.userId, uid),
        opts.projectId ? eq(workSessions.projectId, opts.projectId) : undefined,
        opts.from != null ? gte(workSessions.end, opts.from) : undefined,
        opts.to != null ? lt(workSessions.start, opts.to) : undefined,
      ),
    )
    .orderBy(asc(workSessions.start))
    .all()
    .map((r) => ({ ...r.s, projectTitle: r.title, projectEmoji: r.emoji }));
}

function getSession(uid: string, id: string): WorkSession {
  const s = db().select().from(workSessions).where(and(eq(workSessions.id, id), eq(workSessions.userId, uid))).get();
  if (!s) throw new Error(`No session ${id}`);
  return s;
}

async function mirror(uid: string, s: WorkSession): Promise<WorkSession> {
  if (!syncOn(uid)) return s;
  const p = getProject(uid, s.projectId);
  const ev = {
    title: `${p.emoji ? `${p.emoji} ` : ""}${s.title}`,
    start: s.start,
    end: s.end,
    description: [`Project: ${p.title}`, s.notes].filter(Boolean).join("\n\n"),
    url: publicLink(p.id),
  };
  try {
    const khalEventId = s.khalEventId ? (await updateKhalEvent(uid, s.khalEventId, ev), s.khalEventId) : await createKhalEvent(uid, ev);
    return db().update(workSessions).set({ khalEventId, khalError: null }).where(eq(workSessions.id, s.id)).returning().get();
  } catch (e) {
    const khalError = e instanceof Error ? e.message : String(e);
    return db().update(workSessions).set({ khalError }).where(eq(workSessions.id, s.id)).returning().get();
  }
}

export interface SessionInput {
  title?: string;
  start: number;
  /** Defaults to start + the user's session length. */
  end?: number;
  notes?: string;
  status?: SessionStatus;
}

export async function scheduleSession(uid: string, projectId: string, input: SessionInput): Promise<WorkSession> {
  const p = getProject(uid, projectId);
  const end = input.end ?? input.start + getSettings(uid).sessionMinutes * MINUTE;
  if (!(end > input.start)) throw new Error("A session must end after it starts");
  if (end - input.start > 16 * 60 * MINUTE) throw new Error("A session can't be longer than 16 hours");
  const s = db()
    .insert(workSessions)
    .values({
      id: randomUUID(),
      userId: uid,
      projectId,
      title: input.title?.trim().slice(0, 140) || `Work on ${p.title}`,
      start: input.start,
      end,
      notes: input.notes?.trim() ?? "",
      status: input.status ?? "planned",
    })
    .returning()
    .get();
  if (s.status === "done") logActivity(uid, projectId, "session_done", s.title, Math.round((s.end - s.start) / MINUTE));
  return mirror(uid, s);
}

export async function updateSession(uid: string, id: string, patch: Partial<SessionInput>): Promise<WorkSession> {
  const before = getSession(uid, id);
  const set: Partial<WorkSession> = {};
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 140) || before.title;
  if (patch.start !== undefined) {
    set.start = patch.start;
    // Moving keeps the length unless a new end is given.
    if (patch.end === undefined) set.end = patch.start + (before.end - before.start);
  }
  if (patch.end !== undefined) set.end = patch.end;
  if (patch.notes !== undefined) set.notes = patch.notes.trim();
  if (patch.status !== undefined) set.status = patch.status;
  const start = set.start ?? before.start;
  const end = set.end ?? before.end;
  if (!(end > start)) throw new Error("A session must end after it starts");
  const s = db().update(workSessions).set(set).where(eq(workSessions.id, id)).returning().get();
  if (patch.status === "done" && before.status !== "done") logActivity(uid, s.projectId, "session_done", s.title, Math.round((s.end - s.start) / MINUTE));
  const timeChanged = set.start !== undefined || set.end !== undefined || set.title !== undefined || set.notes !== undefined;
  return timeChanged || s.khalError ? mirror(uid, s) : s;
}

export async function deleteSession(uid: string, id: string) {
  const s = getSession(uid, id);
  db().delete(workSessions).where(eq(workSessions.id, id)).run();
  if (s.khalEventId && khalConfigured()) await deleteKhalEvent(s.khalEventId).catch(() => {});
}

/** Retry khal for every session that failed or was never mirrored (upcoming ones only). */
export async function resyncSessions(uid: string): Promise<{ synced: number; failed: number }> {
  if (!syncOn(uid)) return { synced: 0, failed: 0 };
  const rows = db()
    .select()
    .from(workSessions)
    .where(and(eq(workSessions.userId, uid), gte(workSessions.end, Date.now())))
    .all()
    .filter((s) => !s.khalEventId || s.khalError);
  let failed = 0;
  for (const s of rows) if ((await mirror(uid, s)).khalError) failed++;
  return { synced: rows.length - failed, failed };
}

/** Put a milestone's due date in khal as an all-day event (or move / remove it). */
export async function mirrorMilestone(uid: string, milestoneId: string): Promise<{ ok: boolean; error?: string }> {
  const m = getMilestone(uid, milestoneId);
  if (!syncOn(uid)) return { ok: false, error: "khal is not connected" };
  try {
    if (!m.dueDate || m.doneAt) {
      if (m.khalEventId) await deleteKhalEvent(m.khalEventId);
      if (m.khalEventId) updateMilestone(uid, m.id, { khalEventId: null });
      return { ok: true };
    }
    const p = getProject(uid, m.projectId);
    const ev = { title: `🏁 ${p.title}: ${m.title}`, date: m.dueDate, description: `Milestone of ${p.title}`, url: publicLink(p.id) };
    if (m.khalEventId) await updateKhalEvent(uid, m.khalEventId, ev);
    else updateMilestone(uid, m.id, { khalEventId: await createKhalEvent(uid, ev) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
