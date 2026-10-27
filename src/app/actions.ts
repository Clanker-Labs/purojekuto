"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as P from "@/server/services/projects";
import * as I from "@/server/services/items";
import * as S from "@/server/services/sessions";
import * as Sp from "@/server/services/specs";
import { updateSettings, getSettings, type Settings } from "@/server/services/settings";
import { renameUser } from "@/server/services/users";
import { deletePasskey, renamePasskey } from "@/server/services/passkeys";
import { projectFromIdea } from "@/server/agent/tools";
import { generateObject } from "@/server/ai/providers";
import { requireUid } from "@/server/session";
import type { ProjectStatus, PurchaseStatus, SessionStatus, TaskStatus } from "@/server/db/schema";
import { parseDateTime } from "@/lib/time";
import { z } from "zod";

/**
 * Every mutation the pages make. Each one re-checks the session (requireUid)
 * and returns `{ error }` instead of throwing, so forms can show the message
 * where it happened.
 */
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function attempt<T extends object>(fn: (uid: string) => Promise<T> | T, paths: string[] = []): Promise<Result<T>> {
  try {
    const uid = await requireUid();
    const out = await fn(uid);
    for (const p of paths) revalidatePath(p);
    return { ok: true, ...out };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // let redirect() through
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const projectPaths = (id: string) => ["/", "/projects", `/projects/${id}`, "/planning", "/analytics"];

// ── Projects ─────────────────────────────────────────────────────────────

export async function createProjectAction(input: P.ProjectInput & { writeSpec?: boolean; instructions?: string }) {
  const uid = await requireUid();
  let id: string;
  try {
    const { writeSpec, instructions, ...fields } = input;
    const p = P.createProject(uid, fields);
    if (writeSpec) Sp.requestSpec(uid, p.id, instructions);
    id = p.id;
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/");
  revalidatePath("/projects");
  redirect(`/projects/${id}`);
}

export async function updateProjectAction(id: string, patch: Partial<P.ProjectInput>) {
  return attempt((uid) => (P.updateProject(uid, id, patch), {}), projectPaths(id));
}

export async function setStatusAction(id: string, status: ProjectStatus) {
  return attempt((uid) => (P.updateProject(uid, id, { status }), {}), projectPaths(id));
}

export async function deleteProjectAction(id: string) {
  const uid = await requireUid();
  for (const s of S.listSessions(uid, { projectId: id })) await S.deleteSession(uid, s.id);
  P.deleteProject(uid, id);
  revalidatePath("/");
  revalidatePath("/projects");
  redirect("/projects");
}

export async function fromIdeaAction(ideaId: number, category?: string) {
  const uid = await requireUid();
  let id: string;
  try {
    id = (await projectFromIdea(uid, ideaId, { category })).project.id;
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ideas");
  redirect(`/projects/${id}`);
}

// ── Specs ────────────────────────────────────────────────────────────────

export async function requestSpecAction(projectId: string, instructions?: string) {
  return attempt((uid) => ({ jobId: Sp.requestSpec(uid, projectId, instructions).id }), projectPaths(projectId));
}

export async function applySpecAction(projectId: string, specId: string) {
  return attempt((uid) => ({ added: Sp.applySpec(uid, specId) }), projectPaths(projectId));
}

/** Polled by the spec card while a job runs. */
export async function jobStatusAction(projectId: string) {
  const uid = await requireUid();
  const j = Sp.latestJob(uid, projectId);
  return j ? { status: j.status, error: j.error } : null;
}

// ── Tasks ────────────────────────────────────────────────────────────────

export async function addTaskAction(projectId: string, input: I.TaskInput) {
  return attempt((uid) => ({ task: I.addTask(uid, projectId, input) }), projectPaths(projectId));
}

export async function updateTaskAction(projectId: string, id: string, patch: Partial<I.TaskInput>) {
  return attempt((uid) => (I.updateTask(uid, id, patch), {}), projectPaths(projectId));
}

export async function moveTaskAction(projectId: string, id: string, status: TaskStatus, beforeId: string | null, afterId: string | null) {
  return attempt((uid) => (I.moveTask(uid, id, status, beforeId, afterId), {}), projectPaths(projectId));
}

export async function deleteTaskAction(projectId: string, id: string) {
  return attempt((uid) => (I.deleteTask(uid, id), {}), projectPaths(projectId));
}

// ── Milestones ───────────────────────────────────────────────────────────

export async function addMilestoneAction(projectId: string, input: { title: string; dueDate?: string | null }) {
  return attempt(async (uid) => {
    const m = I.addMilestone(uid, projectId, input);
    if (m.dueDate) await S.mirrorMilestone(uid, m.id);
    return {};
  }, projectPaths(projectId));
}

export async function updateMilestoneAction(projectId: string, id: string, patch: { title?: string; dueDate?: string | null; done?: boolean }) {
  return attempt(async (uid) => {
    I.updateMilestone(uid, id, patch);
    if (patch.dueDate !== undefined || patch.done !== undefined) await S.mirrorMilestone(uid, id);
    return {};
  }, projectPaths(projectId));
}

export async function deleteMilestoneAction(projectId: string, id: string) {
  return attempt(async (uid) => {
    const m = I.getMilestone(uid, id);
    if (m.khalEventId) {
      I.updateMilestone(uid, id, { dueDate: null });
      await S.mirrorMilestone(uid, id);
    }
    I.deleteMilestone(uid, id);
    return {};
  }, projectPaths(projectId));
}

// ── Purchases ────────────────────────────────────────────────────────────

export async function addPurchaseAction(projectId: string, input: I.PurchaseInput) {
  return attempt((uid) => (I.addPurchase(uid, projectId, input), {}), [...projectPaths(projectId), "/shopping"]);
}

export async function updatePurchaseAction(projectId: string, id: string, patch: Partial<I.PurchaseInput> & { status?: PurchaseStatus }) {
  return attempt((uid) => (I.updatePurchase(uid, id, patch), {}), [...projectPaths(projectId), "/shopping"]);
}

export async function deletePurchaseAction(projectId: string, id: string) {
  return attempt((uid) => (I.deletePurchase(uid, id), {}), [...projectPaths(projectId), "/shopping"]);
}

// ── Sessions ─────────────────────────────────────────────────────────────

/** `start` is 'YYYY-MM-DDTHH:mm' in the user's timezone. */
export async function scheduleSessionAction(projectId: string, input: { start: string; minutes: number; title?: string; notes?: string }) {
  return attempt(async (uid) => {
    const start = parseDateTime(input.start, getSettings(uid).timezone);
    const s = await S.scheduleSession(uid, projectId, { start, end: start + input.minutes * 60_000, title: input.title, notes: input.notes });
    return { khalError: s.khalError };
  }, projectPaths(projectId));
}

export async function updateSessionAction(projectId: string, id: string, patch: { status?: SessionStatus; notes?: string; start?: string; minutes?: number }) {
  return attempt(async (uid) => {
    const tz = getSettings(uid).timezone;
    const start = patch.start ? parseDateTime(patch.start, tz) : undefined;
    const s = await S.updateSession(uid, id, {
      status: patch.status,
      notes: patch.notes,
      start,
      end: start != null && patch.minutes ? start + patch.minutes * 60_000 : undefined,
    });
    return { khalError: s.khalError };
  }, projectPaths(projectId));
}

export async function deleteSessionAction(projectId: string, id: string) {
  return attempt(async (uid) => (await S.deleteSession(uid, id), {}), projectPaths(projectId));
}

export async function resyncKhalAction() {
  return attempt(async (uid) => S.resyncSessions(uid), ["/settings", "/planning"]);
}

// ── Categories ───────────────────────────────────────────────────────────

export async function createCategoryAction(input: { name: string; emoji?: string; color?: string }) {
  return attempt((uid) => (P.createCategory(uid, input), {}), ["/projects", "/settings"]);
}

export async function updateCategoryAction(id: string, patch: { name?: string; emoji?: string; color?: string }) {
  return attempt((uid) => (P.updateCategory(uid, id, patch), {}), ["/projects", "/settings"]);
}

export async function deleteCategoryAction(id: string) {
  return attempt((uid) => (P.deleteCategory(uid, id), {}), ["/projects", "/settings"]);
}

// ── Settings ─────────────────────────────────────────────────────────────

export async function saveSettingsAction(patch: Partial<Settings> & { name?: string }) {
  return attempt((uid) => {
    const { name, ...rest } = patch;
    if (name?.trim()) renameUser(uid, name);
    return { settings: updateSettings(uid, rest) };
  }, ["/settings", "/"]);
}

export async function passkeyAction(op: { rename?: { id: string; name: string }; remove?: string }) {
  return attempt((uid) => {
    if (op.rename) renamePasskey(uid, op.rename.id, op.rename.name);
    if (op.remove) deletePasskey(uid, op.remove);
    return {};
  }, ["/settings"]);
}

/** A real round trip through the configured provider: the only proof the CLI is signed in. */
export async function testAiAction() {
  return attempt(async (uid) => {
    const t0 = Date.now();
    const r = await generateObject(uid, {
      system: "You are a health check.",
      prompt: 'Reply with {"reply":"OK"}.',
      schema: z.object({ reply: z.string() }),
    });
    return { provider: r.provider, model: r.model, ms: Date.now() - t0, reply: r.object.reply };
  });
}
