"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { AlertTriangle, CalendarCheck, CalendarPlus, Check, ExternalLink, SkipForward, Trash2 } from "lucide-react";
import { deleteSessionAction, scheduleSessionAction, updateSessionAction } from "@/app/actions";
import { duration } from "@/lib/format";
import type { SessionStatus } from "@/server/db/schema";
import { Button, Field, Input, Select } from "../ui";

interface S {
  id: string;
  title: string;
  start: number;
  end: number;
  notes: string;
  status: SessionStatus;
  inKhal: boolean;
  khalError: string | null;
  /** Someone else's (their name): shown, not editable. Null = yours. */
  by: string | null;
}

const LENGTHS = [30, 45, 60, 90, 120, 180, 240, 360];

/** Next Saturday 10:00, or tomorrow 18:00 on a weekend: a sensible first suggestion. */
function suggestStart(tz: string): { date: string; time: string } {
  const now = DateTime.now().setZone(tz);
  const sat = now.weekday >= 6 ? now.plus({ days: 1 }).set({ hour: 18 }) : now.set({ weekday: 6, hour: 10 });
  return { date: sat.toISODate()!, time: sat.toFormat("HH:00") };
}

export function Sessions({
  projectId,
  sessions,
  tz,
  defaultMinutes,
  khal,
  suggestion,
}: {
  projectId: string;
  sessions: S[];
  tz: string;
  defaultMinutes: number;
  khal: { connected: boolean; url: string | null; reason?: string | null };
  suggestion: string | null;
}) {
  const first = suggestStart(tz);
  const [date, setDate] = useState(first.date);
  const [time, setTime] = useState(first.time);
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const now = Date.now();
  const upcoming = sessions.filter((s) => s.status === "planned" && s.end > now);
  const past = sessions.filter((s) => !(s.status === "planned" && s.end > now)).reverse();
  const mine = sessions.filter((s) => !s.by);
  const workedMin = mine.filter((s) => s.status === "done").reduce((n, s) => n + (s.end - s.start) / 60000, 0);
  const fmt = (ms: number) => DateTime.fromMillis(ms, { zone: tz }).toFormat("ccc d LLL · HH:mm");

  const act = (fn: () => Promise<{ ok: boolean; error?: string; khalError?: string | null }>) =>
    start(async () => {
      const r = await fn();
      setMsg(!r.ok ? { text: r.error ?? "Failed", bad: true } : r.khalError ? { text: `Saved, but khal said: ${r.khalError}`, bad: true } : null);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Coming up</h2>
          {upcoming.length ? (
            <ul className="space-y-2">
              {upcoming.map((s) => (
                <li key={s.id} className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-card">
                  <div className="grid w-12 shrink-0 place-items-center rounded-xl bg-accent-soft py-1.5 text-accent-text">
                    <span className="text-[10px] font-semibold uppercase">{DateTime.fromMillis(s.start, { zone: tz }).toFormat("ccc")}</span>
                    <span className="text-lg leading-none font-semibold">{DateTime.fromMillis(s.start, { zone: tz }).toFormat("d")}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {s.title}
                      {s.by && <span className="font-normal text-muted"> · {s.by}</span>}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {DateTime.fromMillis(s.start, { zone: tz }).toFormat("HH:mm")}–{DateTime.fromMillis(s.end, { zone: tz }).toFormat("HH:mm")} · {duration((s.end - s.start) / 60000)}
                      {s.inKhal && !s.khalError && (
                        <span className="inline-flex items-center gap-0.5 text-accent-text">
                          <CalendarCheck size={11} /> in khal
                        </span>
                      )}
                      {s.khalError && (
                        <span className="inline-flex items-center gap-0.5 text-critical-text" title={s.khalError}>
                          <AlertTriangle size={11} /> not in khal
                        </span>
                      )}
                    </p>
                  </div>
                  {!s.by && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => act(() => updateSessionAction(projectId, s.id, { status: "done" }))} title="Mark done">
                        <Check size={14} /> Done
                      </Button>
                      <button
                        type="button"
                        onClick={() => confirm("Remove this session (and its khal event)?") && act(() => deleteSessionAction(projectId, s.id))}
                        className="rounded-lg p-1.5 text-muted opacity-0 group-hover:opacity-100 hover:text-critical-text focus:opacity-100"
                        aria-label="Delete session"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-border-strong p-5 text-sm text-ink-2">No session planned. Time in the calendar is what turns “someday” into “Saturday”.</p>
          )}
        </section>

        {past.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              History <span className="font-normal normal-case">· {duration(workedMin)} worked{mine.length < sessions.length ? " by you" : ""}</span>
            </h2>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
              {past.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={clsx("h-2 w-2 shrink-0 rounded-full", s.status === "done" ? "bg-accent" : s.status === "skipped" ? "bg-border-strong" : "bg-warning")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {s.title}
                    {s.by && <span className="text-muted"> · {s.by}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{fmt(s.start)}</span>
                  {s.status === "planned" && !s.by ? (
                    <span className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" onClick={() => act(() => updateSessionAction(projectId, s.id, { status: "done" }))} aria-label="It happened">
                        <Check size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => act(() => updateSessionAction(projectId, s.id, { status: "skipped" }))} aria-label="Skipped">
                        <SkipForward size={13} />
                      </Button>
                    </span>
                  ) : (
                    <span className="w-16 shrink-0 text-right text-xs text-muted">{s.status === "done" ? duration((s.end - s.start) / 60000) : s.status === "planned" ? "planned" : "skipped"}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="h-fit rounded-2xl border border-border bg-surface p-5 shadow-card lg:sticky lg:top-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarPlus size={17} className="text-accent-text" /> Plan a session
        </h2>
        {suggestion && <p className="mt-1 text-xs text-ink-2">The spec suggests {suggestion}.</p>}
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              const r = await scheduleSessionAction(projectId, { start: `${date}T${time}`, minutes, title: title || undefined });
              if (r.ok) setTitle("");
              return r;
            });
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Field label="Day">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="From">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required step={900} />
            </Field>
          </div>
          <Field label="For">
            <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[...new Set([...LENGTHS, defaultMinutes])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {duration(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Focus (optional)">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cut and sand the shelves" />
          </Field>
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            Add to the plan
          </Button>
        </form>
        <p className="mt-3 text-xs text-ink-2">
          {khal.connected ? (
            <>
              Goes into your own khal <b>Projects</b> calendar.{" "}
              {khal.url && (
                <a href={khal.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent-text hover:underline">
                  Open khal <ExternalLink size={10} />
                </a>
              )}
            </>
          ) : (
            `${khal.reason ?? "khal isn't connected"}, so your sessions stay here only.`
          )}
        </p>
        {msg && <p className={clsx("mt-3 text-sm", msg.bad ? "text-critical-text" : "text-ink-2")}>{msg.text}</p>}
      </aside>
    </div>
  );
}
