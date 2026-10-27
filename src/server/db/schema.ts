import { sql } from "drizzle-orm";
import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

// ── People & auth ────────────────────────────────────────────────────────

/** A person with their own private projects. The first user is the owner. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").$type<"owner" | "member">().notNull().default("member"),
  createdAt: createdAt(),
});

/** WebAuthn credentials (passkeys). A user can have several (phone, laptop…). */
export const passkeys = sqliteTable(
  "passkeys",
  {
    /** Credential ID, base64url. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    publicKey: blob("public_key", { mode: "buffer" }).notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports", { mode: "json" }).$type<string[]>(),
    deviceType: text("device_type"),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
    /** Human label, e.g. "iPhone" or "MacBook". */
    name: text("name"),
    createdAt: createdAt(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("passkeys_user").on(t.userId)],
);

/** Login sessions. `id` is the SHA-256 of the cookie token, never the token itself. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/** Pending WebAuthn challenges and one-time sign-in links (single use, short-lived). */
export const authChallenges = sqliteTable("auth_challenges", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<"register" | "login" | "add_passkey" | "magic_link" | "invite">().notNull(),
  challenge: text("challenge").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  /** Sign-up: JSON {name, userId} of the account to create once verified. */
  pendingName: text("pending_name"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

/** Per-user preferences (timezone, AI provider, khal calendar…), key/value. */
export const settings = sqliteTable(
  "settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// ── Projects ─────────────────────────────────────────────────────────────

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const owner = () =>
  text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/** Shelves to browse projects by (Home & DIY, Tech, Garden…). Seeded per user, editable. */
export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("📁"),
    /** Hex; shown as a wash behind text, never as text. */
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("categories_user").on(t.userId), uniqueIndex("categories_user_name").on(t.userId, t.name)],
);

export type ProjectStatus = "idea" | "planned" | "active" | "paused" | "done" | "dropped";

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    title: text("title").notNull(),
    /** One line: what it is and why. */
    pitch: text("pitch").notNull().default(""),
    /** Whatever the user wrote when they captured it; the spec is generated from this. */
    notes: text("notes").notNull().default(""),
    status: text("status").$type<ProjectStatus>().notNull().default("planned"),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** 1 low · 2 normal · 3 high. */
    priority: integer("priority").notNull().default(2),
    emoji: text("emoji"),
    /** Dates are 'YYYY-MM-DD' in the user's timezone. */
    startDate: text("start_date"),
    targetDate: text("target_date"),
    /** Planned spend, integer cents in `currency`. */
    budgetCents: integer("budget_cents"),
    currency: text("currency").notNull().default("EUR"),
    /** Where it came from, e.g. "jinsen-ideas:9". */
    sourceRef: text("source_ref"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_user").on(t.userId, t.status), index("projects_category").on(t.categoryId)],
);

export const milestones = sqliteTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueDate: text("due_date"),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
    sortOrder: integer("sort_order").notNull().default(0),
    /** The all-day event mirrored into khal, when one was created. */
    khalEventId: text("khal_event_id"),
    createdAt: createdAt(),
  },
  (t) => [index("milestones_project").on(t.projectId)],
);

export type TaskStatus = "todo" | "doing" | "done";

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: text("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status").$type<TaskStatus>().notNull().default("todo"),
    /** Position inside its column; fractional so a move rewrites one row. */
    sortOrder: real("sort_order").notNull().default(0),
    dueDate: text("due_date"),
    estimateMinutes: integer("estimate_minutes"),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tasks_project").on(t.projectId, t.status)],
);

export type PurchaseStatus = "needed" | "ordered" | "bought";

export const purchases = sqliteTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    /** Per unit, integer cents in `currency`. Estimated until bought, then what was paid. */
    unitCents: integer("unit_cents"),
    currency: text("currency").notNull().default("EUR"),
    url: text("url"),
    vendor: text("vendor"),
    notes: text("notes").notNull().default(""),
    status: text("status").$type<PurchaseStatus>().notNull().default("needed"),
    boughtAt: integer("bought_at", { mode: "timestamp_ms" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("purchases_project").on(t.projectId)],
);

export type SessionStatus = "planned" | "done" | "skipped";

/** A block of time to work on a project; mirrored into khal's Projects calendar. */
export const workSessions = sqliteTable(
  "work_sessions",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** UTC ms. */
    start: integer("start").notNull(),
    end: integer("end").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status").$type<SessionStatus>().notNull().default("planned"),
    khalEventId: text("khal_event_id"),
    /** Last khal sync problem, shown on the session (null = in sync or not linked). */
    khalError: text("khal_error"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_project").on(t.projectId), index("work_sessions_user_start").on(t.userId, t.start)],
);

/** Generated specs, append-only: a new version is a new row. */
export const specs = sqliteTable(
  "specs",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** The structured spec (see src/lib/spec.ts). */
    content: text("content", { mode: "json" }).notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    /** When its plan (tasks, milestones, purchases) was copied into the project. */
    appliedAt: integer("applied_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("specs_project_version").on(t.projectId, t.version)],
);

export type JobStatus = "queued" | "running" | "done" | "failed";

/** AI work runs in the background; pages poll this row. */
export const aiJobs = sqliteTable(
  "ai_jobs",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"spec">().notNull(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    /** Extra guidance for this run ("make it cheaper", "two weekends max"). */
    instructions: text("instructions"),
    error: text("error"),
    provider: text("provider"),
    model: text("model"),
    resultId: text("result_id"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("ai_jobs_project").on(t.projectId), index("ai_jobs_status").on(t.status)],
);

export type ActivityKind =
  | "created"
  | "status"
  | "task_done"
  | "milestone_done"
  | "purchase_bought"
  | "session_done"
  | "spec"
  | "note";

/** What happened, when: feeds the timeline and the analytics. */
export const activity = sqliteTable(
  "activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: owner(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ActivityKind>().notNull(),
    detail: text("detail").notNull().default(""),
    /** Minutes worked (session_done) or cents spent (purchase_bought), for analytics. */
    amount: integer("amount"),
    at: integer("at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("activity_user_at").on(t.userId, t.at), index("activity_project").on(t.projectId)],
);

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type WorkSession = typeof workSessions.$inferSelect;
export type SpecRow = typeof specs.$inferSelect;
export type AiJob = typeof aiJobs.$inferSelect;
export type Activity = typeof activity.$inferSelect;
