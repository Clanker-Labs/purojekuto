"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { createProjectAction, updateProjectAction } from "@/app/actions";
import { PRIORITIES, STATUSES } from "@/lib/projects";
import type { ProjectStatus } from "@/server/db/schema";
import { Button, Field, Input, Select, Switch, Textarea } from "./ui";

export interface ProjectFormValues {
  title: string;
  emoji: string;
  pitch: string;
  notes: string;
  category: string;
  status: ProjectStatus;
  priority: number;
  startDate: string;
  targetDate: string;
  budget: string;
  currency: string;
}

/** New project (with the AI spec switch) or edit an existing one. */
export function ProjectForm({
  initial,
  categories,
  projectId,
  aiReady,
  onDone,
}: {
  initial: ProjectFormValues;
  categories: { id: string; name: string; emoji: string }[];
  projectId?: string;
  aiReady?: boolean;
  onDone?: () => void;
}) {
  const [v, setV] = useState(initial);
  const [writeSpec, setWriteSpec] = useState(!!aiReady);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ProjectFormValues>(k: K, val: ProjectFormValues[K]) => setV((x) => ({ ...x, [k]: val }));

  const submit = () =>
    start(async () => {
      setError(null);
      const fields = {
        title: v.title,
        emoji: v.emoji || null,
        pitch: v.pitch,
        notes: v.notes,
        category: v.category || null,
        status: v.status,
        priority: v.priority,
        startDate: v.startDate || null,
        targetDate: v.targetDate || null,
        budget: v.budget.trim() ? Number(v.budget.replace(",", ".")) : null,
        currency: v.currency,
      };
      if (fields.budget != null && Number.isNaN(fields.budget)) return setError("Budget must be a number");
      const r = projectId ? await updateProjectAction(projectId, fields) : await createProjectAction({ ...fields, writeSpec: writeSpec && aiReady, instructions });
      if (r && !r.ok) setError(r.error);
      else onDone?.();
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-[72px_1fr] gap-3">
        <Field label="Emoji">
          <Input value={v.emoji} onChange={(e) => set("emoji", e.target.value)} placeholder="🔨" maxLength={8} className="text-center text-lg" />
        </Field>
        <Field label="Title">
          <Input value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Build a bookshelf for the alcove" maxLength={120} required data-autofocus autoFocus={!projectId} />
        </Field>
      </div>
      <Field label="One line: what and why" hint="Shown on the card.">
        <Input value={v.pitch} onChange={(e) => set("pitch", e.target.value)} placeholder="Floor-to-ceiling shelves so the books leave the boxes" maxLength={300} />
      </Field>
      <Field label="Notes" hint={projectId ? "Rewrite the spec after changing these." : "Everything you already know. The spec is written from this, so more context means a better plan."}>
        <Textarea rows={6} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Alcove is about 90 cm wide and 2.4 m high. Want oak-look, nothing fancy. Have a drill and a saw. Budget around 150 €, done before my parents visit in December." />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category">
          <Select value={v.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={v.status} onChange={(e) => set("status", e.target.value as ProjectStatus)}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={v.priority} onChange={(e) => set("priority", Number(e.target.value))}>
            {PRIORITIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start">
          <Input type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="Wanted by">
          <Input type="date" value={v.targetDate} onChange={(e) => set("targetDate", e.target.value)} />
        </Field>
        <Field label="Budget">
          <div className="flex gap-2">
            <Input inputMode="decimal" value={v.budget} onChange={(e) => set("budget", e.target.value)} placeholder="150" />
            <Input value={v.currency} onChange={(e) => set("currency", e.target.value.toUpperCase().slice(0, 3))} className="w-16 text-center" aria-label="Currency" />
          </div>
        </Field>
      </div>

      {!projectId && (
        <div className="rounded-xl border border-border bg-page p-4">
          {aiReady ? (
            <>
              <Switch
                checked={writeSpec}
                onChange={setWriteSpec}
                label={
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Sparkles size={15} className="text-accent-text" /> Write a lean spec with AI
                  </span>
                }
              />
              <p className="mt-1.5 text-xs text-ink-2">A one-page plan: goal, scope, milestones with tasks, a shopping list with prices, and an honest effort estimate. Takes a few minutes in the background.</p>
              {writeSpec && (
                <Input className="mt-3" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Anything for the AI? e.g. “two weekends max”, “keep it under 100 €”" maxLength={1000} />
              )}
            </>
          ) : (
            <p className="text-sm text-ink-2">AI specs aren&apos;t set up. You can add tasks by hand, or connect Claude in Settings and write the spec later.</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-critical-text">{error}</p>}
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={pending || !v.title.trim()}>
          {pending && <Loader2 size={15} className="animate-spin" />}
          {projectId ? "Save" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
