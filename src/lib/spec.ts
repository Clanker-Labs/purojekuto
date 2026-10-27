import { z } from "zod";

/**
 * The shape of a generated project spec. Lean on purpose: every list is
 * capped, so a weekend project gets a page, not a document. Optional values
 * are nullable rather than optional so the strict JSON Schema given to the
 * model can require every key (see server/ai/json-schema.ts).
 */
export const SpecSchema = z.object({
  summary: z.string().min(1).max(600).describe("Two or three plain sentences: what this is and why it is worth doing."),
  goal: z.string().min(1).max(300).describe("Definition of done, one sentence a person can check."),
  scopeIn: z.array(z.string().max(160)).max(6).describe("What is in scope, as short phrases."),
  scopeOut: z.array(z.string().max(160)).max(5).describe("What is deliberately left out."),
  approach: z.array(z.string().max(220)).min(1).max(6).describe("How to go about it, in order. One line each."),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        weekOffset: z.number().int().min(0).max(104).describe("Weeks after the start date this should be reached."),
        tasks: z.array(z.string().min(1).max(140)).min(1).max(8).describe("Concrete actions, each doable in one sitting."),
      }),
    )
    .min(1)
    .max(5),
  purchases: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        quantity: z.number().int().min(1).max(999),
        estimatedCost: z.number().min(0).nullable().describe("Per unit, in the project's currency; null if unknown."),
        note: z.string().max(160).nullable(),
      }),
    )
    .max(15)
    .describe("Things to buy. Empty when nothing needs buying."),
  sessions: z.object({
    count: z.number().int().min(0).max(60).describe("How many working sessions it will take."),
    minutes: z.number().int().min(15).max(600).describe("Length of a typical session."),
    cadence: z.string().max(120).describe('When they fit, e.g. "Saturday mornings" or "two evenings a week".'),
  }),
  risks: z.array(z.string().max(200)).max(4),
  openQuestions: z.array(z.string().max(200)).max(3).describe("Only questions that change the plan."),
  firstStep: z.string().min(1).max(200).describe("The very next action, doable in under 30 minutes."),
  estimate: z.object({
    hours: z.number().min(0).max(5000),
    budget: z.number().min(0).nullable().describe("Total spend in the project's currency; null if nothing to buy."),
  }),
});

export type Spec = z.output<typeof SpecSchema>;

/** Plain-text rendering, for agents and for copy-paste. */
export function specToMarkdown(title: string, spec: Spec, currency: string): string {
  const money = (n: number | null) => (n == null ? "?" : `${Math.round(n).toLocaleString("en")} ${currency}`);
  const lines = [`# ${title}`, "", spec.summary, "", `**Done when:** ${spec.goal}`, ""];
  if (spec.scopeIn.length) lines.push("## In scope", ...spec.scopeIn.map((s) => `- ${s}`), "");
  if (spec.scopeOut.length) lines.push("## Not now", ...spec.scopeOut.map((s) => `- ${s}`), "");
  lines.push("## Approach", ...spec.approach.map((s, i) => `${i + 1}. ${s}`), "");
  lines.push("## Milestones");
  for (const m of spec.milestones) {
    lines.push(`### ${m.title} (week ${m.weekOffset})`, ...m.tasks.map((t) => `- [ ] ${t}`));
  }
  lines.push("");
  if (spec.purchases.length) {
    lines.push("## To buy", ...spec.purchases.map((p) => `- ${p.quantity} × ${p.name} — ${money(p.estimatedCost)}${p.note ? ` (${p.note})` : ""}`), "");
  }
  lines.push(
    "## Effort",
    `- ${spec.sessions.count} sessions of ${spec.sessions.minutes} min, ${spec.sessions.cadence}`,
    `- About ${spec.estimate.hours} h${spec.estimate.budget != null ? `, ${money(spec.estimate.budget)}` : ""}`,
    "",
  );
  if (spec.risks.length) lines.push("## Risks", ...spec.risks.map((s) => `- ${s}`), "");
  if (spec.openQuestions.length) lines.push("## Open questions", ...spec.openQuestions.map((s) => `- ${s}`), "");
  lines.push(`**First step:** ${spec.firstStep}`);
  return lines.join("\n");
}
