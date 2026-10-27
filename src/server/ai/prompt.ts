import type { Project, Purchase, Milestone, Task } from "@/server/db/schema";
import { money } from "@/lib/format";

export const SPEC_SYSTEM = `You write project specs for one person's PERSONAL projects: home and DIY jobs, side projects, trips, learning goals, hobbies. You are a practical friend who has done this before, not a consultant.

Lean is the whole point:
- Write for someone who will read it on a phone and then go do the thing. Short lines, plain words, no headings inside fields, no filler, no motivational talk.
- Prefer fewer, sharper items. Do not fill a list because it has room. Two good milestones beat five vague ones.
- Every task is a concrete action a person can do in one sitting ("Measure the alcove and sketch the shelf layout"), never a theme ("Planning").
- Purchases: only things that actually need buying, with realistic prices for the given currency and region. Skip tools a typical household already has unless the work clearly needs a specific one.
- Size the effort honestly for a person with a job: evenings and weekends.
- Scope out what would make it balloon. Name real risks only.
- Open questions only when the answer changes the plan.
- Never invent facts about the person; when the notes are thin, choose the most common sensible interpretation and say so in one open question.
- Write in the language of the user's notes (English if unclear).`;

export function specPrompt(opts: {
  project: Project;
  categoryName: string | null;
  today: string;
  idea?: string | null;
  instructions?: string | null;
  existing?: { tasks: Task[]; milestones: Milestone[]; purchases: Purchase[] };
}): string {
  const p = opts.project;
  const lines = [
    `Today is ${opts.today}.`,
    "",
    `Project: ${p.title}`,
    p.pitch ? `In one line: ${p.pitch}` : null,
    opts.categoryName ? `Category: ${opts.categoryName}` : null,
    `Currency: ${p.currency}`,
    p.startDate ? `Starts: ${p.startDate}` : "Starts: as soon as possible",
    p.targetDate ? `Wanted by: ${p.targetDate}` : null,
    p.budgetCents != null ? `Budget: ${money(p.budgetCents, p.currency)}` : null,
  ].filter((l) => l !== null) as string[];
  if (p.notes.trim()) lines.push("", "The person's notes:", '"""', p.notes.trim(), '"""');
  if (opts.idea) lines.push("", "It started as this idea (from their ideas inbox):", '"""', opts.idea, '"""');
  const ex = opts.existing;
  if (ex && (ex.tasks.length || ex.milestones.length || ex.purchases.length)) {
    lines.push("", "Already in the project (keep what still fits, do not repeat finished work):");
    for (const m of ex.milestones) lines.push(`- milestone: ${m.title}${m.doneAt ? " (reached)" : ""}`);
    for (const t of ex.tasks.slice(0, 40)) lines.push(`- task: ${t.title} [${t.status}]`);
    for (const b of ex.purchases.slice(0, 30)) lines.push(`- purchase: ${b.quantity} × ${b.name} [${b.status}]`);
  }
  if (opts.instructions?.trim()) lines.push("", `Their instructions for this version: ${opts.instructions.trim()}`);
  lines.push("", "Write the spec.");
  return lines.join("\n");
}
