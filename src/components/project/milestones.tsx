"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { CalendarCheck, Plus, Trash2 } from "lucide-react";
import { addMilestoneAction, deleteMilestoneAction, updateMilestoneAction } from "@/app/actions";
import { relativeDay, shortDate } from "@/lib/format";
import { Button, Input } from "../ui";

interface M {
  id: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  inKhal: boolean;
  tasks: number;
  tasksDone: number;
}

export function Milestones({ projectId, milestones, today }: { projectId: string; milestones: M[]; today: string }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string } | { ok: true }>) =>
    start(async () => {
      const r = (await fn()) as { ok: boolean; error?: string };
      setError(r.ok ? null : (r.error ?? "Failed"));
    });

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Milestones</h2>
        <Button size="sm" variant="ghost" onClick={() => setAdding((a) => !a)}>
          <Plus size={14} /> Add
        </Button>
      </div>
      {milestones.length === 0 && !adding && <p className="text-sm text-ink-2">Checkpoints worth celebrating. “Use this plan” adds the spec&apos;s.</p>}
      <ol className="relative space-y-1">
        {milestones.map((m, i) => (
          <li key={m.id} className="group relative flex gap-3 rounded-lg py-1.5 pr-1">
            {i < milestones.length - 1 && <span className="absolute top-7 bottom-[-10px] left-[9px] w-px bg-border" aria-hidden />}
            <button
              type="button"
              onClick={() => run(() => updateMilestoneAction(projectId, m.id, { done: !m.done }))}
              className={clsx("relative z-10 mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border-2 transition", m.done ? "border-accent bg-accent" : "border-border-strong bg-surface hover:border-accent")}
              aria-label={m.done ? `Mark “${m.title}” not reached` : `Mark “${m.title}” reached`}
            >
              {m.done && <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className={clsx("text-sm font-medium", m.done && "text-muted line-through")}>{m.title}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <label className="cursor-pointer hover:text-ink">
                  <input
                    type="date"
                    value={m.dueDate ?? ""}
                    onChange={(e) => run(() => updateMilestoneAction(projectId, m.id, { dueDate: e.target.value || null }))}
                    className="sr-only"
                  />
                  {m.dueDate ? (m.done ? shortDate(m.dueDate) : <span className={m.dueDate < today ? "font-medium text-critical-text" : ""}>{relativeDay(m.dueDate, today)}</span>) : "Set a date"}
                </label>
                {m.tasks > 0 && (
                  <span>
                    {m.tasksDone}/{m.tasks} tasks
                  </span>
                )}
                {m.inKhal && (
                  <span className="inline-flex items-center gap-0.5" title="In khal">
                    <CalendarCheck size={11} /> khal
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => confirm(`Delete milestone “${m.title}”? Its tasks stay.`) && run(() => deleteMilestoneAction(projectId, m.id))}
              className="self-start rounded p-1 text-muted opacity-0 group-hover:opacity-100 hover:text-critical-text focus:opacity-100"
              aria-label={`Delete ${m.title}`}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ol>
      {adding && (
        <form
          className="anim-fade mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            run(async () => {
              const r = await addMilestoneAction(projectId, { title, dueDate: date || null });
              if (r.ok) {
                setTitle("");
                setDate("");
                setAdding(false);
              }
              return r;
            });
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Shelves up and level" autoFocus />
          <div className="flex gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Button type="submit" variant="primary">
              Add
            </Button>
          </div>
        </form>
      )}
      {error && <p className="mt-2 text-xs text-critical-text">{error}</p>}
    </section>
  );
}
