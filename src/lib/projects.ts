import type { ProjectStatus, PurchaseStatus, TaskStatus } from "@/server/db/schema";

/** Labels and order for the project lifecycle. Pure: safe in the browser. */

export const STATUSES: { id: ProjectStatus; label: string; hint: string }[] = [
  { id: "idea", label: "Idea", hint: "Captured, not committed to" },
  { id: "planned", label: "Planned", hint: "Committed, not started" },
  { id: "active", label: "Active", hint: "Being worked on" },
  { id: "paused", label: "Paused", hint: "On hold" },
  { id: "done", label: "Done", hint: "Finished" },
  { id: "dropped", label: "Dropped", hint: "Decided against" },
];

export const STATUS_IDS = STATUSES.map((s) => s.id) as [ProjectStatus, ...ProjectStatus[]];
export const statusLabel = (s: ProjectStatus) => STATUSES.find((x) => x.id === s)?.label ?? s;
/** Open = still on the plate. */
export const OPEN_STATUSES: ProjectStatus[] = ["idea", "planned", "active", "paused"];

export const TASK_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "Doing" },
  { id: "done", label: "Done" },
];

export const PURCHASE_STATUSES: { id: PurchaseStatus; label: string }[] = [
  { id: "needed", label: "To buy" },
  { id: "ordered", label: "Ordered" },
  { id: "bought", label: "Bought" },
];

export const PRIORITIES = [
  { id: 3, label: "High" },
  { id: 2, label: "Normal" },
  { id: 1, label: "Low" },
] as const;

/**
 * Starter shelves for a new account. Colours come from the series ramp (no
 * teal, no green: those mean brand and status here). Users rename, recolour
 * and add their own.
 */
export const DEFAULT_CATEGORIES: { name: string; emoji: string; color: string }[] = [
  { name: "Home & DIY", emoji: "🔨", color: "#bc5806" },
  { name: "Tech & code", emoji: "💻", color: "#7c72ff" },
  { name: "Creative", emoji: "🎨", color: "#a53ead" },
  { name: "Learning", emoji: "📚", color: "#16a0d9" },
  { name: "Health & fitness", emoji: "💪", color: "#c4446a" },
  { name: "Garden & outdoors", emoji: "🌿", color: "#ba8b07" },
  { name: "Travel", emoji: "✈️", color: "#3f7fd9" },
  { name: "Car & bike", emoji: "🚲", color: "#6f86a6" },
  { name: "Money & admin", emoji: "🗂️", color: "#8a6d3b" },
  { name: "Events & people", emoji: "🎉", color: "#d0587e" },
  { name: "Side business", emoji: "🚀", color: "#5b4fe9" },
];

export const CATEGORY_COLORS = ["#7c72ff", "#16a0d9", "#a53ead", "#bc5806", "#ba8b07", "#c4446a", "#6f86a6", "#3f7fd9", "#8a6d3b", "#d0587e", "#5b4fe9"];
