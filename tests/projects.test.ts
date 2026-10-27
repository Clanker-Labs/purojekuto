import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshDb, freshUser } from "./helpers";
import { createUser } from "@/server/services/users";
import * as P from "@/server/services/projects";
import * as I from "@/server/services/items";
import * as S from "@/server/services/sessions";
import * as Sp from "@/server/services/specs";
import { analytics, planning } from "@/server/services/analytics";
import { linkKhal, removePerson } from "@/server/services/people";
import { callTool } from "@/server/agent/tools";
import { SpecSchema, specToMarkdown, type Spec } from "@/lib/spec";
import { projectHtml } from "@/server/export-html";
import { generateObject } from "@/server/ai/providers";

vi.mock("@/server/ai/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/providers")>()),
  generateObject: vi.fn(),
}));

const SPEC: Spec = {
  summary: "Shelves in the alcove.",
  goal: "Six shelves up and loaded.",
  scopeIn: ["Alcove"],
  scopeOut: ["Doors"],
  approach: ["Measure", "Cut", "Fix"],
  milestones: [
    { title: "Measured", weekOffset: 0, tasks: ["Measure the alcove", "Order wood"] },
    { title: "Up", weekOffset: 2, tasks: ["Fix battens", "Fit shelves"] },
  ],
  purchases: [{ name: "MDF shelf", quantity: 6, estimatedCost: 14, note: null }],
  sessions: { count: 3, minutes: 180, cadence: "Saturday mornings" },
  risks: [],
  openQuestions: [],
  firstStep: "Measure the alcove.",
  estimate: { hours: 10, budget: 120 },
};

let uid: string;
beforeEach(() => {
  uid = freshUser();
  delete process.env.PUROJEKUTO_KHAL_URL;
  delete process.env.PUROJEKUTO_IDEAS_URL;
});

describe("projects", () => {
  it("seeds categories and creates projects into them, by name", () => {
    expect(P.listCategories(uid).length).toBeGreaterThan(5);
    const p = P.createProject(uid, { title: "Shelf", category: "Home & DIY" });
    expect(P.projectSummary(uid, p.id).category?.name).toBe("Home & DIY");
    const q = P.createProject(uid, { title: "Pottery", category: "Ceramics" });
    expect(P.findCategory(uid, "Ceramics")?.id).toBe(q.categoryId);
  });

  it("keeps users apart", () => {
    const p = P.createProject(uid, { title: "Mine" });
    const other = createUser("Other").id;
    expect(P.listProjects(other, { status: "all" })).toHaveLength(0);
    expect(() => P.getProject(other, p.id)).toThrow();
    expect(() => I.addTask(other, p.id, { title: "x" })).toThrow();
  });

  it("finds projects by id or a unique part of the title", () => {
    const a = P.createProject(uid, { title: "Paint the bedroom" });
    P.createProject(uid, { title: "Paint the fence" });
    expect(P.findProject(uid, a.id).id).toBe(a.id);
    expect(P.findProject(uid, "bedroom").id).toBe(a.id);
    expect(() => P.findProject(uid, "paint")).toThrow(/several/);
  });

  it("logs status changes and stamps completion", () => {
    const p = P.createProject(uid, { title: "X" });
    P.updateProject(uid, p.id, { status: "done" });
    expect(P.getProject(uid, p.id).completedAt).toBeInstanceOf(Date);
    expect(P.recentActivity(uid, { projectId: p.id }).map((a) => a.kind)).toContain("status");
  });
});

describe("board", () => {
  it("computes progress and starts a planned project when a task moves to doing", () => {
    const p = P.createProject(uid, { title: "X" });
    const a = I.addTask(uid, p.id, { title: "a" });
    I.addTask(uid, p.id, { title: "b" });
    I.updateTask(uid, a.id, { status: "doing" });
    expect(P.getProject(uid, p.id).status).toBe("active");
    I.updateTask(uid, a.id, { status: "done" });
    expect(P.projectSummary(uid, p.id).progress).toBe(50);
  });

  it("moves a card between two others with one write", () => {
    const p = P.createProject(uid, { title: "X" });
    const [a, b, c] = ["a", "b", "c"].map((t) => I.addTask(uid, p.id, { title: t }));
    I.moveTask(uid, c.id, "todo", b.id, a.id);
    expect(I.listTasks(uid, p.id).map((t) => t.title)).toEqual(["a", "c", "b"]);
  });
});

describe("purchases", () => {
  it("totals spend and what's left", () => {
    const p = P.createProject(uid, { title: "X", budget: 100 });
    const a = I.addPurchase(uid, p.id, { name: "wood", quantity: 2, unitPrice: 20 });
    I.addPurchase(uid, p.id, { name: "paint", unitPrice: 15.5 });
    I.updatePurchase(uid, a.id, { status: "bought" });
    const s = P.projectSummary(uid, p.id);
    expect(s.spentCents).toBe(4000);
    expect(s.plannedSpendCents).toBe(5550);
    expect(s.toBuy).toBe(1);
  });
});

describe("specs", () => {
  it("validates, versions and applies a plan without duplicating", () => {
    expect(SpecSchema.safeParse(SPEC).success).toBe(true);
    const p = P.createProject(uid, { title: "Shelf", startDate: "2026-11-02" });
    const v1 = Sp.saveSpec(uid, p.id, SPEC, "agent", null);
    expect(Sp.applySpec(uid, v1.id)).toEqual({ milestones: 2, tasks: 4, purchases: 1 });
    expect(Sp.applySpec(uid, v1.id)).toEqual({ milestones: 0, tasks: 0, purchases: 0 });
    const ms = I.listMilestones(uid, p.id);
    expect(ms.map((m) => m.dueDate)).toEqual(["2026-11-02", "2026-11-16"]);
    const proj = P.getProject(uid, p.id);
    expect(proj.budgetCents).toBe(12000);
    expect(proj.targetDate).toBe("2026-11-16");
    const v2 = Sp.saveSpec(uid, p.id, SPEC, "agent", null);
    expect(v2.version).toBe(2);
    expect(specToMarkdown("Shelf", SPEC, "EUR")).toContain("- [ ] Measure the alcove");
  });

  it("runs a queued job through the provider and records failures", async () => {
    const p = P.createProject(uid, { title: "Shelf" });
    const job = Sp.requestSpec(uid, p.id, "cheap");
    expect(Sp.requestSpec(uid, p.id).id).toBe(job.id); // one at a time
    const spy = vi.mocked(generateObject).mockResolvedValueOnce({ object: SPEC, provider: "claude-code", model: "test" });
    await Sp.runJob(job);
    expect(Sp.getJob(uid, job.id).status).toBe("done");
    expect(Sp.latestSpec(uid, p.id)?.version).toBe(1);
    expect(spy.mock.calls[0][1].prompt).toContain("Their instructions for this version: cheap");
    spy.mockRejectedValueOnce(new Error("not logged in"));
    const j2 = Sp.requestSpec(uid, p.id);
    await Sp.runJob(j2);
    expect(Sp.getJob(uid, j2.id)).toMatchObject({ status: "failed", error: "not logged in" });
  });

  it("fails jobs a restart interrupted", () => {
    freshDb();
    uid = createUser("A").id;
    const p = P.createProject(uid, { title: "X" });
    const j = Sp.requestSpec(uid, p.id);
    Sp.recoverJobs();
    expect(Sp.getJob(uid, j.id).status).toBe("queued");
  });
});

describe("sessions and khal", () => {
  it("saves sessions without khal, and mirrors them when khal is configured", async () => {
    const p = P.createProject(uid, { title: "Shelf", emoji: "📚" });
    const local = await S.scheduleSession(uid, p.id, { start: Date.UTC(2026, 10, 7, 9), end: Date.UTC(2026, 10, 7, 12) });
    expect(local.khalEventId).toBeNull();

    process.env.PUROJEKUTO_KHAL_URL = "http://khal.test";
    process.env.PUROJEKUTO_KHAL_TOKEN = "t";
    const calls: { tool: string; body: Record<string, unknown> }[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const tool = String(url).split("/").pop()!;
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({ tool, body });
      const out =
        tool === "list_calendars" ? { calendars: [] } : tool === "create_calendar" ? { id: "cal-1", name: "Projects" } : tool === "create_event" ? { event: { id: "occ", eventId: "ev-1" } } : {};
      return new Response(JSON.stringify(out), { status: 200 });
    });
    const s = await S.scheduleSession(uid, p.id, { start: Date.UTC(2026, 10, 8, 9), title: "Fit shelves" });
    expect(s.khalEventId).toBe("ev-1");
    expect(s.end - s.start).toBe(120 * 60_000); // default session length
    const create = calls.find((c) => c.tool === "create_event")!;
    expect(create.body).toMatchObject({ calendar: "cal-1", title: "📚 Fit shelves", allDay: false });
    await S.deleteSession(uid, s.id);
    expect(calls.at(-1)).toMatchObject({ tool: "delete_event", body: { id: "ev-1" } });

    fetchMock.mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down"));
    const failed = await S.scheduleSession(uid, p.id, { start: Date.UTC(2026, 10, 9, 9) });
    expect(failed.khalError).toMatch(/unreachable/);
    fetchMock.mockRestore();
  });

  it("counts done sessions as worked time", async () => {
    const p = P.createProject(uid, { title: "X" });
    const s = await S.scheduleSession(uid, p.id, { start: Date.now() - 3 * 3600_000, end: Date.now() - 3600_000 });
    await S.updateSession(uid, s.id, { status: "done" });
    expect(P.projectSummary(uid, p.id).minutesWorked).toBe(120);
    expect(analytics(uid).weekly.at(-1)!.minutes).toBe(120);
  });
});

describe("sharing", () => {
  it("lets members see and work on a shared project, but only the owner shares or deletes it", () => {
    const p = P.createProject(uid, { title: "Garden shed", category: "Home & DIY" });
    const sam = createUser("Sam").id;
    expect(() => P.addMember(sam, p.id, sam)).toThrow(); // can't see it yet
    P.addMember(uid, p.id, sam);
    expect(P.listMembers(sam, p.id).map((x) => `${x.name}:${x.role}`)).toEqual(["Test:owner", "Sam:member"]);
    expect(P.listProjects(sam, { sharedWithMe: true }).map((x) => x.title)).toEqual(["Garden shed"]);
    expect(P.listProjects(uid, { sharedWithMe: true })).toHaveLength(0);

    const t = I.addTask(sam, p.id, { title: "Level the base", assigneeId: sam });
    I.addTask(uid, p.id, { title: "Buy felt", assigneeId: uid });
    expect(I.listTasks(uid, p.id)).toHaveLength(2);
    expect(I.myTasks(sam).map((x) => x.title)).toEqual(["Level the base"]);
    const stranger = createUser("Stranger").id;
    expect(() => I.addTask(uid, p.id, { title: "x", assigneeId: stranger })).toThrow(/people on the project/);
    expect(() => I.updateTask(stranger, t.id, { status: "done" })).toThrow();

    // Members file it under the owner's shelves, never their own.
    P.updateProject(sam, p.id, { category: "Garden" });
    expect(P.findCategory(uid, "Garden")?.id).toBe(P.getProject(uid, p.id).categoryId);

    expect(() => P.addMember(sam, p.id, stranger)).toThrow(/owner/);
    expect(() => P.deleteProject(sam, p.id)).toThrow(/owner/);

    // Due tasks in planning: yours or nobody's.
    I.updateTask(uid, t.id, { dueDate: "2026-11-02" });
    expect(planning(uid, "2026-11-01", "2026-11-30").dueTasks).toHaveLength(0);
    expect(planning(sam, "2026-11-01", "2026-11-30").dueTasks.map((x) => x.title)).toEqual(["Level the base"]);

    P.removeMember(sam, p.id, sam); // leave
    expect(() => P.getProject(sam, p.id)).toThrow();
    expect(I.listTasks(uid, p.id).find((x) => x.id === t.id)?.assigneeId).toBeNull();
  });

  it("keeps what a removed person added to someone else's project", () => {
    const p = P.createProject(uid, { title: "Shed" });
    const sam = createUser("Sam").id;
    P.addMember(uid, p.id, sam);
    I.addTask(sam, p.id, { title: "Sam's task" });
    const own = P.createProject(sam, { title: "Sam's own" });
    expect(() => removePerson(sam, uid)).toThrow(/owner/);
    removePerson(uid, sam);
    expect(I.listTasks(uid, p.id).map((x) => x.title)).toEqual(["Sam's task"]);
    expect(() => P.getProject(uid, own.id)).toThrow();
  });

  it("writes each person's sessions into their own khal calendar, milestones into the owner's", async () => {
    process.env.PUROJEKUTO_KHAL_URL = "http://khal.test";
    process.env.PUROJEKUTO_KHAL_TOKEN = "t";
    const calls: { tool: string; as: string | null }[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const tool = String(url).split("/").pop()!;
      calls.push({ tool, as: new Headers(init?.headers).get("x-khal-user") });
      const out =
        tool === "list_calendars" ? { calendars: [] } : tool === "create_calendar" ? { id: "cal" } : tool === "create_event" ? { event: { id: "o", eventId: `ev-${calls.length}` } } : {};
      return new Response(JSON.stringify(out), { status: 200 });
    });
    const p = P.createProject(uid, { title: "Shed" });
    const sam = createUser("Sam").id;
    P.addMember(uid, p.id, sam);

    // Not linked yet: saved, nothing sent to khal for Sam.
    const s1 = await S.scheduleSession(sam, p.id, { start: Date.UTC(2026, 10, 8, 9) });
    expect(s1.khalEventId).toBeNull();
    expect(calls).toHaveLength(0);
    expect(() => linkKhal(sam, sam, "khal-sam")).toThrow(/owner/);

    linkKhal(uid, sam, "khal-sam");
    const s2 = await S.scheduleSession(sam, p.id, { start: Date.UTC(2026, 10, 9, 9) });
    expect(s2.khalEventId).toBeTruthy();
    expect(calls.every((c) => c.as === "khal-sam")).toBe(true);

    calls.length = 0;
    const m = I.addMilestone(sam, p.id, { title: "Roof on", dueDate: "2026-11-20" });
    await S.mirrorMilestone(sam, m.id);
    expect(calls.find((c) => c.tool === "create_event")?.as).toBeNull(); // the owner = khal's default user

    await expect(S.updateSession(uid, s2.id, { notes: "x" })).rejects.toThrow(/someone else/);
    expect(S.listSessions(uid, { projectId: p.id }).map((x) => x.by)).toEqual(["Sam", "Sam"]);
    fetchMock.mockRestore();
  });
});

describe("agent tools", () => {
  it("creates a project from a conversation and reads it back", async () => {
    const r = await callTool({ userId: uid }, "create_project", { title: "Repaint the bedroom", notes: "Walls only, 200 EUR, before Christmas", category: "Home & DIY", writeSpec: false });
    expect(r.ok).toBe(true);
    const id = (r.data as { project: { id: string } }).project.id;
    const t = await callTool({ userId: uid }, "add_task", { project: "bedroom", title: "Buy paint" });
    expect(t.ok).toBe(true);
    const got = await callTool({ userId: uid }, "get_project", { project: id });
    expect(got.data).toMatchObject({ title: "Repaint the bedroom", category: "Home & DIY", tasks: [{ title: "Buy paint", status: "todo" }] });
    const bad = await callTool({ userId: uid }, "delete_project", { project: id });
    expect(bad.ok).toBe(false); // needs confirm: true
  });

  it("saves an agent-written spec through the tool", async () => {
    const p = P.createProject(uid, { title: "Shelf" });
    const r = await callTool({ userId: uid }, "save_spec", { project: p.id, spec: SPEC });
    expect(r).toMatchObject({ ok: true, data: { version: 1 } });
  });

  it("turns an idea into a project once, and tags the idea", async () => {
    process.env.PUROJEKUTO_IDEAS_URL = "http://ideas.test";
    const idea = { id: 9, title: "Funny correlation web app", body: "Spurious correlations, but interactive", tags: ["web"], starred: false, archived: false, status: "analysed", created_at: "", updated_at: "", latest: { id: 1, headline: "Fun, small, doable in a weekend", shape: "x", weakest: "Data licensing", generated_at: "" }, report_count: 1 };
    const patches: unknown[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if (init?.method === "PATCH") patches.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(idea), { status: 200 });
    });
    const r = await callTool({ userId: uid }, "project_from_idea", { ideaId: 9, writeSpec: false });
    expect(r.ok).toBe(true);
    const p = P.listProjects(uid, { status: "all" })[0];
    expect(p).toMatchObject({ title: "Funny correlation web app", sourceRef: "jinsen-ideas:9", pitch: "Fun, small, doable in a weekend" });
    expect(p.notes).toContain("Weakest point found: Data licensing");
    expect(patches).toEqual([{ tags: ["web", "project"] }]);
    const again = await callTool({ userId: uid }, "project_from_idea", { ideaId: 9 });
    expect(again.data).toMatchObject({ note: "This idea is already a project." });
    fetchMock.mockRestore();
  });
});

describe("html export", () => {
  it("escapes user text and stays self-contained", () => {
    const p = P.createProject(uid, { title: '<script>alert("x")</script>' });
    const html = projectHtml({ project: P.getProject(uid, p.id), category: null, spec: SPEC, tasks: [], milestones: [], purchases: [], sessions: [], timezone: "UTC", exportedAt: new Date() });
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<(link|img|iframe)\b|src="http/);
  });
});
