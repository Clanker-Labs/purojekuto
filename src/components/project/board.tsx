"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { ArrowRight, Check, Flag, GripVertical, Plus, Trash2, Undo2 } from "lucide-react";
import { addTaskAction, deleteTaskAction, moveTaskAction, updateTaskAction } from "@/app/actions";
import { TASK_COLUMNS } from "@/lib/projects";
import { relativeDay } from "@/lib/format";
import type { TaskStatus } from "@/server/db/schema";
import { Button, Input, Select } from "../ui";

interface T {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  milestoneId: string | null;
  dueDate: string | null;
}

/**
 * Three columns. Desktop: drag cards between and within columns. Touch: the
 * arrow on a card moves it to the next column. State is optimistic; the
 * server's answer replaces it on refresh.
 */
export function Board({ projectId, tasks: initial, milestones, today }: { projectId: string; tasks: T[]; milestones: { id: string; title: string }[]; today: string }) {
  const [tasks, setTasks] = useState(initial);
  const [filter, setFilter] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: TaskStatus; before: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setTasks(initial), [initial]);

  const msName = useMemo(() => new Map(milestones.map((m) => [m.id, m.title])), [milestones]);
  const visible = filter ? tasks.filter((t) => (filter === "none" ? !t.milestoneId : t.milestoneId === filter)) : tasks;
  const col = (s: TaskStatus) => visible.filter((t) => t.status === s);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Failed"));
      if (!r.ok) setTasks(initial);
    });

  const move = (id: string, status: TaskStatus, beforeId: string | null) => {
    const list = tasks.filter((t) => t.id !== id);
    const moved = { ...tasks.find((t) => t.id === id)!, status };
    const colList = list.filter((t) => t.status === status);
    const idx = beforeId ? colList.findIndex((t) => t.id === beforeId) : colList.length;
    const afterId = idx > 0 ? colList[idx - 1].id : null;
    // Optimistic: rebuild the order the server will produce.
    const others = list.filter((t) => t.status !== status);
    colList.splice(idx < 0 ? colList.length : idx, 0, moved);
    setTasks([...others, ...colList]);
    run(() => moveTaskAction(projectId, id, status, beforeId, afterId));
  };

  const next: Record<TaskStatus, TaskStatus> = { todo: "doing", doing: "done", done: "todo" };

  return (
    <div>
      {milestones.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <Flag size={14} className="text-muted" />
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-64" aria-label="Filter by milestone">
            <option value="">All milestones</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
            <option value="none">No milestone</option>
          </Select>
        </div>
      )}
      {error && <p className="mb-3 text-sm text-critical-text">{error}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {TASK_COLUMNS.map((c) => {
          const items = col(c.id);
          return (
            <section
              key={c.id}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                if (over?.col !== c.id || over.before !== null) {
                  if (!(e.target as HTMLElement).closest("[data-card]")) setOver({ col: c.id, before: null });
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag && over) move(drag, over.col, over.before);
                setDrag(null);
                setOver(null);
              }}
              className={clsx("flex min-h-40 flex-col rounded-2xl border bg-inset/60 p-2.5 transition", drag && over?.col === c.id ? "border-accent/60" : "border-border")}
            >
              <header className="mb-2 flex items-center justify-between px-1.5 pt-1">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <span className={clsx("h-2 w-2 rounded-full", c.id === "todo" ? "bg-border-strong" : c.id === "doing" ? "bg-warning" : "bg-accent")} aria-hidden />
                  {c.label}
                  <span className="tabular text-xs font-normal text-muted">{items.length}</span>
                </h2>
              </header>
              <ul className="flex flex-1 flex-col gap-2">
                {items.map((t) => (
                  <li
                    key={t.id}
                    data-card
                    draggable
                    onDragStart={(e) => {
                      setDrag(t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setOver(null);
                    }}
                    onDragOver={(e) => {
                      if (!drag || drag === t.id) return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (over?.before !== t.id) setOver({ col: c.id, before: t.id });
                    }}
                    className={clsx(
                      "group relative rounded-xl border border-border bg-surface p-3 shadow-card",
                      drag === t.id && "opacity-40",
                      over?.before === t.id && drag !== t.id && "before:absolute before:-top-1.5 before:right-2 before:left-2 before:h-0.5 before:rounded before:bg-accent",
                    )}
                  >
                    <TaskCard
                      t={t}
                      milestone={t.milestoneId ? msName.get(t.milestoneId) : undefined}
                      today={today}
                      onAdvance={() => move(t.id, next[t.status], null)}
                      onRename={(title) => run(() => updateTaskAction(projectId, t.id, { title }))}
                      onDelete={() => {
                        setTasks((x) => x.filter((y) => y.id !== t.id));
                        run(() => deleteTaskAction(projectId, t.id));
                      }}
                    />
                  </li>
                ))}
                {drag && over?.col === c.id && over.before === null && <li className="h-0.5 rounded bg-accent" aria-hidden />}
              </ul>
              <AddTask projectId={projectId} status={c.id} milestoneId={filter && filter !== "none" ? filter : null} onError={setError} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({ t, milestone, today, onAdvance, onRename, onDelete }: { t: T; milestone?: string; today: string; onAdvance: () => void; onRename: (title: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title);
  const overdue = t.dueDate && t.dueDate < today && t.status !== "done";
  return (
    <div className="flex gap-2">
      <GripVertical size={14} className="mt-0.5 hidden shrink-0 cursor-grab text-faint md:block" aria-hidden />
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setEditing(false);
              if (title.trim() && title !== t.title) onRename(title.trim());
            }}
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => setEditing(false)} autoFocus className="h-8" />
          </form>
        ) : (
          <p className={clsx("text-sm leading-snug", t.status === "done" && "text-muted line-through")} onDoubleClick={() => setEditing(true)}>
            {t.title}
          </p>
        )}
        {(milestone || t.dueDate) && (
          <p className="mt-1.5 flex flex-wrap gap-x-2 text-[11px] text-muted">
            {milestone && <span className="truncate">⚑ {milestone}</span>}
            {t.dueDate && <span className={overdue ? "font-medium text-critical-text" : ""}>{relativeDay(t.dueDate, today)}</span>}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <button
          type="button"
          onClick={onAdvance}
          className={clsx(
            "grid h-7 w-7 place-items-center rounded-lg border transition",
            t.status === "done" ? "border-border text-muted hover:text-ink" : "border-border text-ink-2 hover:border-accent hover:text-accent-text",
          )}
          aria-label={t.status === "todo" ? "Start" : t.status === "doing" ? "Mark done" : "Reopen"}
          title={t.status === "todo" ? "Start" : t.status === "doing" ? "Mark done" : "Reopen"}
        >
          {t.status === "todo" ? <ArrowRight size={14} /> : t.status === "doing" ? <Check size={14} /> : <Undo2 size={13} />}
        </button>
        <button type="button" onClick={onDelete} className="grid h-6 w-7 place-items-center rounded text-muted opacity-0 group-hover:opacity-100 hover:text-critical-text focus:opacity-100" aria-label="Delete task">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function AddTask({ projectId, status, milestoneId, onError }: { projectId: string; status: TaskStatus; milestoneId: string | null; onError: (e: string | null) => void }) {
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface hover:text-ink">
        <Plus size={14} /> Add a task
      </button>
    );
  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        start(async () => {
          const r = await addTaskAction(projectId, { title, status, milestoneId });
          onError(r.ok ? null : r.error);
          if (r.ok) setTitle("");
        });
      }}
    >
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" autoFocus onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
      <div className="mt-1.5 flex gap-1.5">
        <Button type="submit" size="sm" variant="primary" disabled={pending || !title.trim()}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}
