import { z } from "zod";
import { DateTime } from "luxon";
import * as P from "@/server/services/projects";
import * as I from "@/server/services/items";
import * as S from "@/server/services/sessions";
import * as Sp from "@/server/services/specs";
import { analytics, planning } from "@/server/services/analytics";
import { getSettings } from "@/server/services/settings";
import { aiStatus } from "@/server/ai/providers";
import { getIdea, ideaContext, ideasConfigured, listIdeas, tagIdeaAsProject } from "@/server/integrations/ideas";
import { khalConfigured } from "@/server/integrations/khal";
import { SpecSchema, specToMarkdown } from "@/lib/spec";
import { STATUS_IDS } from "@/lib/projects";
import { money } from "@/lib/format";
import { MINUTE, parseDateTime, toZonedISO, todayIn } from "@/lib/time";

/**
 * The single tool surface of the app. The MCP server (HTTP at /api/mcp and
 * stdio) and /api/tools expose exactly these tools. Every call runs on behalf
 * of one user (`ctx.userId`). Descriptions are prompts: keep them exact.
 */
export interface ToolContext {
  userId: string;
}

export interface PuroTool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  input: S;
  /** Write tools change data; PUROJEKUTO_AGENT_READONLY=1 hides them. */
  readOnly: boolean;
  destructive?: boolean;
  run: (input: z.output<S>, ctx: ToolContext) => unknown;
}

function tool<S extends z.ZodObject>(t: PuroTool<S>): PuroTool<S> {
  return t;
}

const tzOf = (uid: string) => getSettings(uid).timezone;
const projectRef = z.string().describe("Project id, or its title (exact, or a unique part of it)");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

function presentSummary(p: P.ProjectSummary, tz: string) {
  return {
    id: p.id,
    title: p.title,
    emoji: p.emoji,
    pitch: p.pitch || undefined,
    status: p.status,
    category: p.category?.name ?? null,
    priority: p.priority === 3 ? "high" : p.priority === 1 ? "low" : "normal",
    progress: `${p.progress}%`,
    tasks: `${p.tasksDone}/${p.tasksTotal} done${p.tasksDoing ? `, ${p.tasksDoing} doing` : ""}`,
    nextMilestone: p.nextMilestone,
    startDate: p.startDate,
    targetDate: p.targetDate,
    budget: p.budgetCents != null ? money(p.budgetCents, p.currency) : null,
    spent: p.spentCents ? money(p.spentCents, p.currency) : undefined,
    toBuy: p.toBuy || undefined,
    hoursWorked: p.minutesWorked ? Math.round(p.minutesWorked / 6) / 10 : undefined,
    nextSession: p.nextSession ? toZonedISO(p.nextSession.start, tz) : null,
    hasSpec: p.hasSpec,
    writingSpec: p.generating || undefined,
    source: p.sourceRef ?? undefined,
  };
}

function projectDetail(uid: string, id: string) {
  const tz = tzOf(uid);
  const p = P.projectSummary(uid, id);
  const spec = Sp.latestSpec(uid, id);
  const job = Sp.latestJob(uid, id);
  const ms = I.listMilestones(uid, id);
  return {
    ...presentSummary(p, tz),
    notes: p.notes || undefined,
    currency: p.currency,
    milestones: ms.map((m) => ({ id: m.id, title: m.title, dueDate: m.dueDate, done: !!m.doneAt })),
    tasks: I.listTasks(uid, id).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      milestone: ms.find((m) => m.id === t.milestoneId)?.title,
      dueDate: t.dueDate ?? undefined,
    })),
    purchases: I.listPurchases(uid, id).map((b) => ({
      id: b.id,
      name: b.name,
      quantity: b.quantity,
      unitPrice: b.unitCents != null ? b.unitCents / 100 : null,
      currency: b.currency,
      status: b.status,
      url: b.url ?? undefined,
    })),
    sessions: S.listSessions(uid, { projectId: id }).map((s) => ({
      id: s.id,
      title: s.title,
      start: toZonedISO(s.start, tz),
      minutes: Math.round((s.end - s.start) / MINUTE),
      status: s.status,
      inKhal: !!s.khalEventId,
      khalError: s.khalError ?? undefined,
    })),
    spec: spec ? { version: spec.version, appliedToProject: !!spec.appliedAt, markdown: specToMarkdown(p.title, spec.content, p.currency) } : null,
    specJob: job && job.status !== "done" ? { status: job.status, error: job.error ?? undefined } : undefined,
  };
}

function when(input: string, tz: string): number {
  return parseDateTime(input, tz);
}

const projectFields = {
  pitch: z.string().max(300).optional().describe("One line: what it is and why"),
  notes: z.string().max(20000).optional().describe("Everything the person said about it: context, constraints, ideas. The spec is written from this."),
  category: z.string().nullable().optional().describe("Category name (an unknown name creates it), or null for none"),
  status: z.enum(STATUS_IDS).optional(),
  priority: z.number().int().min(1).max(3).optional().describe("1 low, 2 normal, 3 high"),
  emoji: z.string().max(8).nullable().optional(),
  startDate: dateStr.nullable().optional(),
  targetDate: dateStr.nullable().optional(),
  budget: z.number().min(0).nullable().optional().describe("Planned spend in currency units"),
  currency: z.string().length(3).optional(),
  pinned: z.boolean().optional(),
};

export const TOOLS = [
  tool({
    name: "get_context",
    title: "Context",
    description:
      "Today's date and time in the user's timezone, their currency, the categories, whether AI spec writing, khal (calendar) and jinsen ideas are connected, and the active projects. Call this first.",
    input: z.object({}),
    readOnly: true,
    run: (_i, { userId }) => {
      const s = getSettings(userId);
      const ai = aiStatus(userId);
      return {
        now: toZonedISO(Date.now(), s.timezone),
        today: todayIn(s.timezone),
        timezone: s.timezone,
        currency: s.currency,
        sessionMinutes: s.sessionMinutes,
        ai: { ready: ai.ready, provider: ai.provider, reason: ai.reason },
        khal: khalConfigured() && s.khalSync,
        ideas: ideasConfigured(),
        categories: P.listCategories(userId).map((c) => `${c.emoji} ${c.name}`),
        active: P.listProjects(userId, { status: "active" }).map((p) => ({ id: p.id, title: p.title, progress: `${p.progress}%` })),
      };
    },
  }),

  tool({
    name: "list_projects",
    title: "List projects",
    description:
      'Projects with status, progress, next milestone, spend and next working session. status: "open" (default: idea, planned, active, paused), "all", or one status. Filter by category name or a search text.',
    input: z.object({
      status: z.enum(["open", "all", ...STATUS_IDS]).optional(),
      category: z.string().optional(),
      query: z.string().optional(),
    }),
    readOnly: true,
    run: (i, { userId }) => {
      const cat = i.category ? P.findCategory(userId, i.category) : undefined;
      if (i.category && !cat) throw new Error(`No category "${i.category}"`);
      const tz = tzOf(userId);
      return P.listProjects(userId, { status: i.status ?? "open", categoryId: cat?.id, q: i.query }).map((p) => presentSummary(p, tz));
    },
  }),

  tool({
    name: "get_project",
    title: "Get a project",
    description: "Everything about one project: notes, milestones, tasks (with ids), purchases, working sessions, and the latest spec as markdown.",
    input: z.object({ project: projectRef }),
    readOnly: true,
    run: (i, { userId }) => projectDetail(userId, P.findProject(userId, i.project).id),
  }),

  tool({
    name: "create_project",
    title: "Create a project",
    description:
      "Create a personal project from what the person said. Put everything they told you in `notes` (that is what the spec is written from) and a one-line `pitch`. By default an AI spec is written in the background (a few minutes): a lean plan with milestones, tasks, a shopping list and an effort estimate. Tell the person it is being written; get_project shows it when ready.",
    input: z.object({
      title: z.string().min(1).max(120),
      ...projectFields,
      writeSpec: z.boolean().optional().describe("Write the AI spec now (default true when AI is configured)"),
      instructions: z.string().max(1000).optional().describe("Guidance for the spec, e.g. 'keep it under 200 EUR' or 'two weekends max'"),
    }),
    readOnly: false,
    run: (i, { userId }) => {
      const { writeSpec, instructions, title, ...rest } = i;
      const p = P.createProject(userId, { title, ...rest });
      const ai = aiStatus(userId);
      const job = writeSpec !== false && ai.ready ? Sp.requestSpec(userId, p.id, instructions) : null;
      return {
        project: { id: p.id, title: p.title, status: p.status },
        spec: job ? "being written in the background (check with get_project in a few minutes)" : ai.ready ? "not requested" : `not available: ${ai.reason}`,
        url: publicUrl(p.id),
      };
    },
  }),

  tool({
    name: "update_project",
    title: "Update a project",
    description: "Change a project's fields: rename, re-pitch, add to its notes, move category, set dates, budget, priority, or status (idea, planned, active, paused, done, dropped). Only send what changes.",
    input: z.object({ project: projectRef, title: z.string().min(1).max(120).optional(), ...projectFields }),
    readOnly: false,
    run: (i, { userId }) => {
      const { project, ...patch } = i;
      const p = P.updateProject(userId, P.findProject(userId, project).id, patch);
      return presentSummary(P.projectSummary(userId, p.id), tzOf(userId));
    },
  }),

  tool({
    name: "delete_project",
    title: "Delete a project",
    description: "Delete a project and everything in it (tasks, purchases, sessions, specs). Prefer status 'dropped' or 'done'. Confirm with the person first.",
    input: z.object({ project: projectRef, confirm: z.literal(true) }),
    readOnly: false,
    destructive: true,
    run: async (i, { userId }) => {
      const p = P.findProject(userId, i.project);
      for (const s of S.listSessions(userId, { projectId: p.id })) await S.deleteSession(userId, s.id);
      P.deleteProject(userId, p.id);
      return { deleted: p.title };
    },
  }),

  tool({
    name: "list_ideas",
    title: "List ideas",
    description: "Ideas from the person's jinsen ideas inbox, with their research verdict and whether they already became a project (tag 'project'). Use project_from_idea to turn one into a project.",
    input: z.object({ includeTaken: z.boolean().optional().describe("Include ideas already tagged as a project") }),
    readOnly: true,
    run: async (i) => {
      const ideas = await listIdeas();
      return ideas
        .filter((x) => !x.archived && (i.includeTaken || !x.tags.includes("project")))
        .map((x) => ({ id: x.id, title: x.title, status: x.status, tags: x.tags, verdict: x.latest?.headline }));
    },
  }),

  tool({
    name: "project_from_idea",
    title: "Turn an idea into a project",
    description: "Create a project from a jinsen idea (by id): its text and research verdict become the notes, the idea is tagged 'project' in jinsen, and a spec is written in the background.",
    input: z.object({ ideaId: z.number().int(), category: z.string().optional(), writeSpec: z.boolean().optional(), instructions: z.string().max(1000).optional() }),
    readOnly: false,
    run: async (i, { userId }) => projectFromIdea(userId, i.ideaId, { category: i.category, writeSpec: i.writeSpec, instructions: i.instructions }),
  }),

  tool({
    name: "write_spec",
    title: "Write or rewrite the spec",
    description:
      "Ask the AI to write a new spec version for a project, in the background (a few minutes). Use it after the notes changed, or with instructions ('cheaper', 'split into two phases'). The project's current tasks and purchases are taken into account.",
    input: z.object({ project: projectRef, instructions: z.string().max(1000).optional() }),
    readOnly: false,
    run: (i, { userId }) => {
      const ai = aiStatus(userId);
      if (!ai.ready) throw new Error(ai.reason ?? "AI is not configured");
      const p = P.findProject(userId, i.project);
      const job = Sp.requestSpec(userId, p.id, i.instructions);
      return { project: p.title, job: job.id, status: job.status };
    },
  }),

  tool({
    name: "save_spec",
    title: "Save a spec you wrote",
    description: "Save a spec you wrote yourself as the project's next version (same shape the app's AI produces). Use when you already discussed the plan in detail with the person.",
    input: z.object({ project: projectRef, spec: SpecSchema }),
    readOnly: false,
    run: (i, { userId }) => {
      const p = P.findProject(userId, i.project);
      const s = Sp.saveSpec(userId, p.id, i.spec, "agent", null);
      return { project: p.title, version: s.version };
    },
  }),

  tool({
    name: "apply_spec",
    title: "Apply the spec's plan",
    description: "Copy the latest spec's milestones (dated from the start date), tasks and shopping list into the project. Existing items with the same title are skipped, so it is safe to repeat.",
    input: z.object({ project: projectRef }),
    readOnly: false,
    run: (i, { userId }) => {
      const p = P.findProject(userId, i.project);
      const spec = Sp.latestSpec(userId, p.id);
      if (!spec) throw new Error(`${p.title} has no spec yet`);
      return { project: p.title, version: spec.version, added: Sp.applySpec(userId, spec.id) };
    },
  }),

  tool({
    name: "add_task",
    title: "Add a task",
    description: "Add a to-do to a project, optionally under a milestone (title or id) and with a due date.",
    input: z.object({
      project: projectRef,
      title: z.string().min(1).max(200),
      milestone: z.string().optional(),
      status: z.enum(["todo", "doing", "done"]).optional(),
      dueDate: dateStr.optional(),
      notes: z.string().max(5000).optional(),
    }),
    readOnly: false,
    run: (i, { userId }) => {
      const p = P.findProject(userId, i.project);
      const ms = i.milestone ? I.listMilestones(userId, p.id).find((m) => m.id === i.milestone || m.title.toLowerCase() === i.milestone!.toLowerCase()) : undefined;
      if (i.milestone && !ms) throw new Error(`No milestone "${i.milestone}" in ${p.title}`);
      const t = I.addTask(userId, p.id, { title: i.title, status: i.status, dueDate: i.dueDate, notes: i.notes, milestoneId: ms?.id });
      return { id: t.id, title: t.title, status: t.status, project: p.title };
    },
  }),

  tool({
    name: "update_task",
    title: "Update a task",
    description: "Move a task to todo / doing / done, rename it, change its due date or notes. Task ids come from get_project.",
    input: z.object({
      id: z.string(),
      status: z.enum(["todo", "doing", "done"]).optional(),
      title: z.string().min(1).max(200).optional(),
      dueDate: dateStr.nullable().optional(),
      notes: z.string().max(5000).optional(),
    }),
    readOnly: false,
    run: (i, { userId }) => {
      const { id, ...patch } = i;
      const t = I.updateTask(userId, id, patch);
      return { id: t.id, title: t.title, status: t.status };
    },
  }),

  tool({
    name: "delete_task",
    title: "Delete a task",
    description: "Delete a task by id.",
    input: z.object({ id: z.string() }),
    readOnly: false,
    destructive: true,
    run: (i, { userId }) => (I.deleteTask(userId, i.id), { deleted: i.id }),
  }),

  tool({
    name: "add_milestone",
    title: "Add a milestone",
    description: "Add a milestone (a checkpoint with an optional date) to a project. Dated milestones also go to khal's Projects calendar when connected.",
    input: z.object({ project: projectRef, title: z.string().min(1).max(120), dueDate: dateStr.optional() }),
    readOnly: false,
    run: async (i, { userId }) => {
      const p = P.findProject(userId, i.project);
      const m = I.addMilestone(userId, p.id, { title: i.title, dueDate: i.dueDate });
      const khal = m.dueDate ? await S.mirrorMilestone(userId, m.id) : undefined;
      return { id: m.id, title: m.title, dueDate: m.dueDate, khal };
    },
  }),

  tool({
    name: "update_milestone",
    title: "Update a milestone",
    description: "Rename, re-date, or mark a milestone reached (done: true).",
    input: z.object({ id: z.string(), title: z.string().min(1).max(120).optional(), dueDate: dateStr.nullable().optional(), done: z.boolean().optional() }),
    readOnly: false,
    run: async (i, { userId }) => {
      const { id, ...patch } = i;
      const m = I.updateMilestone(userId, id, patch);
      if (patch.dueDate !== undefined || patch.done !== undefined) await S.mirrorMilestone(userId, m.id);
      return { id: m.id, title: m.title, dueDate: m.dueDate, done: !!m.doneAt };
    },
  }),

  tool({
    name: "add_purchase",
    title: "Add to the shopping list",
    description: "Add something to buy for a project. unitPrice is per item in currency units (the project's currency by default).",
    input: z.object({
      project: projectRef,
      name: z.string().min(1).max(160),
      quantity: z.number().int().min(1).optional(),
      unitPrice: z.number().min(0).optional(),
      currency: z.string().length(3).optional(),
      url: z.string().url().optional(),
      vendor: z.string().max(80).optional(),
      notes: z.string().max(500).optional(),
    }),
    readOnly: false,
    run: (i, { userId }) => {
      const { project, ...input } = i;
      const p = P.findProject(userId, project);
      const b = I.addPurchase(userId, p.id, input);
      return { id: b.id, name: b.name, project: p.title };
    },
  }),

  tool({
    name: "update_purchase",
    title: "Update a purchase",
    description: 'Mark something ordered or bought (status "ordered" / "bought"), or fix its price, quantity, link or vendor. When bought, set unitPrice to what was actually paid.',
    input: z.object({
      id: z.string(),
      status: z.enum(["needed", "ordered", "bought"]).optional(),
      quantity: z.number().int().min(1).optional(),
      unitPrice: z.number().min(0).nullable().optional(),
      url: z.string().url().nullable().optional(),
      vendor: z.string().max(80).nullable().optional(),
    }),
    readOnly: false,
    run: (i, { userId }) => {
      const { id, ...patch } = i;
      const b = I.updatePurchase(userId, id, patch);
      return { id: b.id, name: b.name, status: b.status };
    },
  }),

  tool({
    name: "shopping_list",
    title: "Shopping list",
    description: "Everything still to buy across open projects, grouped by project, with estimated totals.",
    input: z.object({}),
    readOnly: true,
    run: (_i, { userId }) => {
      const open = new Map(P.listProjects(userId, { status: "open" }).map((p) => [p.id, p]));
      const items = I.listPurchases(userId).filter((b) => b.status !== "bought" && open.has(b.projectId));
      const by = new Map<string, typeof items>();
      for (const b of items) by.set(b.projectId, [...(by.get(b.projectId) ?? []), b]);
      return [...by].map(([pid, list]) => ({
        project: open.get(pid)!.title,
        items: list.map((b) => ({ id: b.id, name: b.name, quantity: b.quantity, status: b.status, price: b.unitCents != null ? money(b.unitCents * b.quantity, b.currency) : null })),
      }));
    },
  }),

  tool({
    name: "schedule_session",
    title: "Schedule a working session",
    description:
      "Block time to work on a project. start is 'YYYY-MM-DDTHH:mm' in the user's timezone; give end or minutes (default: the user's session length). It is added to khal's Projects calendar when connected. Use khal's find_free_time first if you need a free slot.",
    input: z.object({
      project: projectRef,
      start: z.string(),
      end: z.string().optional(),
      minutes: z.number().int().min(15).max(960).optional(),
      title: z.string().max(140).optional(),
      notes: z.string().max(2000).optional(),
    }),
    readOnly: false,
    run: async (i, { userId }) => {
      const tz = tzOf(userId);
      const p = P.findProject(userId, i.project);
      const start = when(i.start, tz);
      const end = i.end ? when(i.end, tz) : i.minutes ? start + i.minutes * MINUTE : undefined;
      const s = await S.scheduleSession(userId, p.id, { start, end, title: i.title, notes: i.notes });
      return { id: s.id, title: s.title, start: toZonedISO(s.start, tz), end: toZonedISO(s.end, tz), inKhal: !!s.khalEventId, khalError: s.khalError ?? undefined };
    },
  }),

  tool({
    name: "update_session",
    title: "Update a working session",
    description: 'Move a session (start keeps its length unless end is given), rename it, add notes, or record how it went: status "done" (counts toward hours worked) or "skipped".',
    input: z.object({
      id: z.string(),
      start: z.string().optional(),
      end: z.string().optional(),
      title: z.string().max(140).optional(),
      notes: z.string().max(2000).optional(),
      status: z.enum(["planned", "done", "skipped"]).optional(),
    }),
    readOnly: false,
    run: async (i, { userId }) => {
      const tz = tzOf(userId);
      const s = await S.updateSession(userId, i.id, {
        start: i.start ? when(i.start, tz) : undefined,
        end: i.end ? when(i.end, tz) : undefined,
        title: i.title,
        notes: i.notes,
        status: i.status,
      });
      return { id: s.id, title: s.title, start: toZonedISO(s.start, tz), status: s.status, khalError: s.khalError ?? undefined };
    },
  }),

  tool({
    name: "delete_session",
    title: "Delete a working session",
    description: "Remove a planned session (and its khal event).",
    input: z.object({ id: z.string() }),
    readOnly: false,
    destructive: true,
    run: async (i, { userId }) => (await S.deleteSession(userId, i.id), { deleted: i.id }),
  }),

  tool({
    name: "get_planning",
    title: "Planning",
    description: "What's coming between two dates (default: today + 14 days): working sessions, milestones and dated tasks, plus active projects with no session planned.",
    input: z.object({ from: dateStr.optional(), to: dateStr.optional() }),
    readOnly: true,
    run: (i, { userId }) => {
      const tz = tzOf(userId);
      const from = i.from ?? todayIn(tz);
      const to = i.to ?? DateTime.fromISO(from).plus({ days: 14 }).toISODate()!;
      const pl = planning(userId, from, to);
      return {
        from,
        to,
        sessions: pl.sessions.map((s) => ({ id: s.id, project: s.projectTitle, title: s.title, start: toZonedISO(s.start, tz), minutes: Math.round((s.end - s.start) / MINUTE), status: s.status })),
        milestones: pl.milestones.map((m) => ({ project: m.projectTitle, title: m.title, dueDate: m.dueDate, done: !!m.doneAt })),
        dueTasks: pl.dueTasks.map((t) => ({ id: t.id, project: t.projectTitle, title: t.title, dueDate: t.dueDate, status: t.status })),
        activeWithoutSession: pl.unscheduled.map((p) => p.title),
      };
    },
  }),

  tool({
    name: "get_analytics",
    title: "Analytics",
    description: "Totals and trends: projects by status and category, tasks done and hours worked per week (last 12 weeks), spend, budgets, overdue and stalled projects.",
    input: z.object({}),
    readOnly: true,
    run: (_i, { userId }) => {
      const a = analytics(userId);
      return {
        totals: { ...a.totals, hoursWorked: Math.round(a.totals.minutesWorked / 6) / 10, spent: money(a.totals.spentCents, a.currency) },
        byStatus: a.byStatus.filter((s) => s.count),
        byCategory: a.byCategory.map((c) => ({ name: c.name, open: c.open, total: c.total })),
        weekly: a.weekly.map((w) => ({ week: w.week, tasksDone: w.tasksDone, hours: Math.round(w.minutes / 6) / 10 })),
        overdue: a.overdue,
        stalled: a.stale,
      };
    },
  }),

  tool({
    name: "list_categories",
    title: "List categories",
    description: "The categories projects are filed under, with open and total project counts.",
    input: z.object({}),
    readOnly: true,
    run: (_i, { userId }) => P.listCategories(userId).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, open: c.open, total: c.total })),
  }),

  tool({
    name: "create_category",
    title: "Create a category",
    description: "Add a category to file projects under.",
    input: z.object({ name: z.string().min(1).max(40), emoji: z.string().max(8).optional() }),
    readOnly: false,
    run: (i, { userId }) => {
      const c = P.createCategory(userId, i);
      return { id: c.id, name: c.name, emoji: c.emoji };
    },
  }),
];

function publicUrl(projectId: string): string | undefined {
  const base = process.env.PUROJEKUTO_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/projects/${projectId}` : undefined;
}

/** Shared by the tool and the Ideas page. */
export async function projectFromIdea(
  uid: string,
  ideaId: number,
  opts: { category?: string; writeSpec?: boolean; instructions?: string } = {},
) {
  const idea = await getIdea(ideaId);
  const ref = `jinsen-ideas:${idea.id}`;
  const existing = P.listProjects(uid, { status: "all" }).find((p) => p.sourceRef === ref);
  if (existing) return { project: { id: existing.id, title: existing.title, status: existing.status }, note: "This idea is already a project.", url: publicUrl(existing.id) };
  const p = P.createProject(uid, {
    title: idea.title.slice(0, 120),
    pitch: idea.latest?.headline?.slice(0, 300) ?? "",
    notes: ideaContext(idea),
    category: opts.category ?? null,
    status: "planned",
    sourceRef: ref,
  });
  await tagIdeaAsProject(idea);
  const ai = aiStatus(uid);
  const job = opts.writeSpec !== false && ai.ready ? Sp.requestSpec(uid, p.id, opts.instructions) : null;
  return { project: { id: p.id, title: p.title, status: p.status }, spec: job ? "being written in the background" : ai.ready ? "not requested" : `not available: ${ai.reason}`, url: publicUrl(p.id) };
}

export function enabledTools() {
  const readonly = /^(1|true|yes)$/i.test(process.env.PUROJEKUTO_AGENT_READONLY ?? "");
  return readonly ? TOOLS.filter((t) => t.readOnly) : TOOLS;
}

export function findTool(name: string) {
  return enabledTools().find((t) => t.name === name);
}

export async function callTool(ctx: ToolContext, name: string, args: unknown): Promise<{ ok: boolean; content: string; data?: unknown }> {
  const t = findTool(name) as PuroTool | undefined;
  if (!t) return { ok: false, content: `Unknown tool ${name}` };
  const parsed = t.input.safeParse(args ?? {});
  if (!parsed.success) return { ok: false, content: `Invalid input for ${name}: ${z.prettifyError(parsed.error)}` };
  try {
    const data = await t.run(parsed.data, ctx);
    return { ok: true, content: JSON.stringify(data, null, 1), data };
  } catch (e) {
    return { ok: false, content: e instanceof Error ? e.message : String(e) };
  }
}
