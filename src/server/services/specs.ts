import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db/client";
import { aiJobs, categories, milestones, purchases, specs, tasks, type AiJob, type SpecRow } from "@/server/db/schema";
import { SpecSchema, type Spec } from "@/lib/spec";
import { addDays } from "@/lib/format";
import { todayIn } from "@/lib/time";
import { generateObject } from "@/server/ai/providers";
import { SPEC_SYSTEM, specPrompt } from "@/server/ai/prompt";
import { getIdea, ideaContext } from "@/server/integrations/ideas";
import { getProject, logActivity, updateProject } from "./projects";
import { addMilestone, addPurchase, addTask, listMilestones, listPurchases, listTasks } from "./items";
import { getSettings } from "./settings";

export type SpecVersion = Omit<SpecRow, "content"> & { content: Spec };

export function latestSpec(uid: string, projectId: string): SpecVersion | null {
  getProject(uid, projectId);
  const row = db()
    .select()
    .from(specs)
    .where(eq(specs.projectId, projectId))
    .orderBy(desc(specs.version))
    .limit(1)
    .get();
  return (row as SpecVersion | undefined) ?? null;
}

export function listSpecVersions(uid: string, projectId: string) {
  getProject(uid, projectId);
  return db()
    .select({ id: specs.id, version: specs.version, provider: specs.provider, model: specs.model, appliedAt: specs.appliedAt, createdAt: specs.createdAt })
    .from(specs)
    .where(eq(specs.projectId, projectId))
    .orderBy(desc(specs.version))
    .all();
}

export function getSpec(uid: string, id: string): SpecVersion {
  const row = db().select().from(specs).where(eq(specs.id, id)).get();
  if (!row) throw new Error(`No spec ${id}`);
  getProject(uid, row.projectId);
  return row as SpecVersion;
}

/** Save a spec as the next version (used by the job runner, and by agents that wrote one themselves). */
export function saveSpec(uid: string, projectId: string, spec: Spec, provider: string, model: string | null): SpecVersion {
  getProject(uid, projectId);
  const parsed = SpecSchema.parse(spec);
  const v = db().select({ v: max(specs.version) }).from(specs).where(eq(specs.projectId, projectId)).get()?.v ?? 0;
  const row = db()
    .insert(specs)
    .values({ id: randomUUID(), userId: uid, projectId, version: v + 1, content: parsed, provider, model })
    .returning()
    .get();
  logActivity(uid, projectId, "spec", `Spec v${row.version}`);
  return row as SpecVersion;
}

/**
 * Copy a spec's plan into the project: milestones (dated from the start date
 * by their week offset), their tasks, and the shopping list. Items whose title
 * already exists are skipped, so applying twice, or applying v2 over v1, does
 * not duplicate.
 */
export function applySpec(uid: string, specId: string): { milestones: number; tasks: number; purchases: number } {
  const spec = getSpec(uid, specId);
  const project = getProject(uid, spec.projectId);
  const tz = getSettings(uid).timezone;
  const start = project.startDate ?? todayIn(tz);
  const norm = (s: string) => s.trim().toLowerCase();
  const haveM = new Map(listMilestones(uid, project.id).map((m) => [norm(m.title), m.id]));
  const haveT = new Set(listTasks(uid, project.id).map((t) => norm(t.title)));
  const haveP = new Set(listPurchases(uid, project.id).map((p) => norm(p.name)));
  let m = 0;
  let t = 0;
  let p = 0;
  db().transaction(() => {
    for (const ms of spec.content.milestones) {
      let mid = haveM.get(norm(ms.title));
      if (!mid) {
        mid = addMilestone(uid, project.id, { title: ms.title, dueDate: addDays(start, ms.weekOffset * 7) }).id;
        haveM.set(norm(ms.title), mid);
        m++;
      }
      for (const title of ms.tasks) {
        if (haveT.has(norm(title))) continue;
        addTask(uid, project.id, { title, milestoneId: mid });
        haveT.add(norm(title));
        t++;
      }
    }
    for (const item of spec.content.purchases) {
      if (haveP.has(norm(item.name))) continue;
      addPurchase(uid, project.id, { name: item.name, quantity: item.quantity, unitPrice: item.estimatedCost, notes: item.note ?? "" });
      haveP.add(norm(item.name));
      p++;
    }
    db().update(specs).set({ appliedAt: new Date() }).where(eq(specs.id, specId)).run();
  });
  const patch: Parameters<typeof updateProject>[2] = {};
  if (project.budgetCents == null && spec.content.estimate.budget != null) patch.budget = spec.content.estimate.budget;
  if (!project.targetDate && spec.content.milestones.length) {
    patch.targetDate = addDays(start, Math.max(...spec.content.milestones.map((x) => x.weekOffset)) * 7);
  }
  if (!project.startDate) patch.startDate = start;
  if (Object.keys(patch).length) updateProject(uid, project.id, patch);
  return { milestones: m, tasks: t, purchases: p };
}

// ── Background jobs ──────────────────────────────────────────────────────

export function getJob(uid: string, id: string): AiJob {
  const j = db().select().from(aiJobs).where(eq(aiJobs.id, id)).get();
  if (!j || (j.projectId ? !canSee(uid, j.projectId) : j.userId !== uid)) throw new Error(`No job ${id}`);
  return j;
}

/** The newest job for a project (to show "writing…" or the last failure). */
export function latestJob(uid: string, projectId: string): AiJob | null {
  getProject(uid, projectId);
  return db().select().from(aiJobs).where(eq(aiJobs.projectId, projectId)).orderBy(desc(aiJobs.createdAt)).limit(1).get() ?? null;
}

function canSee(uid: string, projectId: string) {
  try {
    getProject(uid, projectId);
    return true;
  } catch {
    return false;
  }
}

/** Queue a spec for a project. One at a time per project: a pending one is returned instead of queuing another. */
export function requestSpec(uid: string, projectId: string, instructions?: string | null): AiJob {
  getProject(uid, projectId);
  const pending = db()
    .select()
    .from(aiJobs)
    .where(and(eq(aiJobs.projectId, projectId), inArray(aiJobs.status, ["queued", "running"])))
    .get();
  if (pending) return pending;
  const job = db()
    .insert(aiJobs)
    .values({ id: randomUUID(), userId: uid, projectId, kind: "spec", instructions: instructions?.trim().slice(0, 1000) || null })
    .returning()
    .get();
  kick();
  return job;
}

const state = globalThis as unknown as { __puroJobs?: { running: boolean } };
state.__puroJobs ??= { running: false };

/** Work the queue in this process, one job at a time (a CLI run takes a few minutes and a lot of memory). */
export function kick() {
  if (state.__puroJobs!.running || /^(0|false)$/i.test(process.env.PUROJEKUTO_JOBS ?? "")) return;
  state.__puroJobs!.running = true;
  setImmediate(async () => {
    try {
      for (;;) {
        const next = db().select().from(aiJobs).where(eq(aiJobs.status, "queued")).orderBy(asc(aiJobs.createdAt)).limit(1).get();
        if (!next) break;
        await runJob(next);
      }
    } finally {
      state.__puroJobs!.running = false;
    }
  });
}

export async function runJob(job: AiJob): Promise<void> {
  db().update(aiJobs).set({ status: "running", startedAt: new Date() }).where(eq(aiJobs.id, job.id)).run();
  try {
    const uid = job.userId;
    const project = getProject(uid, job.projectId!);
    const cat = project.categoryId ? db().select().from(categories).where(eq(categories.id, project.categoryId)).get() : null;
    let idea: string | null = null;
    const m = project.sourceRef?.match(/^jinsen-ideas:(\d+)$/);
    if (m) idea = await getIdea(Number(m[1])).then(ideaContext, () => null);
    const existing = {
      tasks: db().select().from(tasks).where(eq(tasks.projectId, project.id)).all(),
      milestones: db().select().from(milestones).where(eq(milestones.projectId, project.id)).all(),
      purchases: db().select().from(purchases).where(eq(purchases.projectId, project.id)).all(),
    };
    const res = await generateObject(uid, {
      system: SPEC_SYSTEM,
      prompt: specPrompt({ project, categoryName: cat?.name ?? null, today: todayIn(getSettings(uid).timezone), idea, instructions: job.instructions, existing }),
      schema: SpecSchema,
    });
    const spec = saveSpec(uid, project.id, res.object, res.provider, res.model);
    db()
      .update(aiJobs)
      .set({ status: "done", finishedAt: new Date(), provider: res.provider, model: res.model, resultId: spec.id })
      .where(eq(aiJobs.id, job.id))
      .run();
  } catch (e) {
    db()
      .update(aiJobs)
      .set({ status: "failed", finishedAt: new Date(), error: (e instanceof Error ? e.message : String(e)).slice(0, 1000) })
      .where(eq(aiJobs.id, job.id))
      .run();
  }
}

/** On boot: a job that was running when the process died will never finish; fail it, then resume the queue. */
export function recoverJobs() {
  db()
    .update(aiJobs)
    .set({ status: "failed", finishedAt: new Date(), error: "Interrupted by a restart. Run it again." })
    .where(eq(aiJobs.status, "running"))
    .run();
  kick();
}
