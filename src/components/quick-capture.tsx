"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { createProjectAction } from "@/app/actions";
import { Button, Select, Switch, Textarea } from "./ui";

/** The fastest way in: a title, optionally some notes, and the spec gets written while you do something else. */
export function QuickCapture({ categories, aiReady }: { categories: { id: string; name: string; emoji: string }[]; aiReady: boolean }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("");
  const [writeSpec, setWriteSpec] = useState(aiReady);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await createProjectAction({ title, notes, category: category || null, writeSpec: writeSpec && aiReady });
      if (r && !r.ok) setError(r.error);
    });

  return (
    <form
      className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) submit();
      }}
    >
      <label htmlFor="capture" className="text-sm font-semibold">
        What do you want to make happen?
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="capture"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Build a bookshelf for the alcove, learn to sail, plan the Lisbon trip…"
          maxLength={120}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-page px-3.5 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <Button type="submit" variant="primary" className="h-11 px-4" disabled={!title.trim() || pending}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          <span className="hidden sm:inline">Create</span>
        </Button>
      </div>
      {open && (
        <div className="anim-fade mt-3 space-y-3">
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything you already know: why, constraints, rough budget, deadline, what you have… The spec is written from this."
          />
          <div className="flex flex-wrap items-center gap-3">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-56" aria-label="Category">
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </Select>
            {aiReady ? (
              <Switch
                checked={writeSpec}
                onChange={setWriteSpec}
                label={
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <Sparkles size={14} className="text-accent-text" /> Write a lean spec with AI
                  </span>
                }
              />
            ) : (
              <span className="text-xs text-muted">AI specs are off: set them up in Settings.</span>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-critical-text">{error}</p>}
    </form>
  );
}
