"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CircleHelp, ClipboardList, Loader2, RefreshCw, ShieldAlert, Sparkles, Wand2 } from "lucide-react";
import { applySpecAction, jobStatusAction, requestSpecAction } from "@/app/actions";
import type { Spec } from "@/lib/spec";
import { duration } from "@/lib/format";
import { Button, Input } from "../ui";

interface Props {
  projectId: string;
  currency: string;
  ai: { ready: boolean; reason: string | null };
  spec: { id: string; version: number; content: Spec; model: string | null; provider: string; applied: boolean; createdAt: number } | null;
  versions: number;
  job: { status: string; error: string | null } | null;
  hasNotes: boolean;
}

export function SpecPanel({ projectId, currency, ai, spec, versions, job: initialJob, hasNotes }: Props) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [instructions, setInstructions] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = job?.status === "queued" || job?.status === "running";

  useEffect(() => setJob(initialJob), [initialJob]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      const j = await jobStatusAction(projectId).catch(() => null);
      if (j && j.status !== job?.status) {
        setJob(j);
        if (j.status === "done" || j.status === "failed") router.refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [busy, projectId, job?.status, router]);

  const write = () =>
    start(async () => {
      setMsg(null);
      const r = await requestSpecAction(projectId, instructions || undefined);
      if (!r.ok) setMsg(r.error);
      else {
        setJob({ status: "queued", error: null });
        setRewriting(false);
        setInstructions("");
      }
    });

  const apply = () =>
    start(async () => {
      if (!spec) return;
      const r = await applySpecAction(projectId, spec.id);
      setMsg(r.ok ? `Added ${r.added.milestones} milestones, ${r.added.tasks} tasks and ${r.added.purchases} purchases.` : r.error);
    });

  const money = (n: number | null) => (n == null ? "?" : new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(n));

  if (busy) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex items-center gap-3">
          <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
            <Sparkles size={18} />
            <span className="absolute inset-0 animate-ping rounded-xl bg-accent-soft" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">{spec ? `Writing version ${spec.version + 1}…` : "Writing the spec…"}</h2>
            <p className="text-sm text-ink-2">Usually two to four minutes. You can leave this page; it keeps going.</p>
          </div>
        </div>
        <div className="mt-5 space-y-2.5" aria-hidden>
          {[92, 78, 85, 60].map((w, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-surface-2" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      </section>
    );
  }

  const failure = job?.status === "failed" && job.error && (
    <p className="mb-4 flex gap-2 rounded-xl bg-[color-mix(in_srgb,var(--critical)_10%,transparent)] px-3 py-2.5 text-sm text-critical-text">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>The last attempt failed: {job.error}</span>
    </p>
  );

  if (!spec) {
    return (
      <section className="rounded-2xl border border-dashed border-border-strong bg-surface p-6 text-center">
        {failure}
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-text">
          <Wand2 size={20} />
        </span>
        <h2 className="font-semibold">No spec yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
          {ai.ready
            ? hasNotes
              ? "A lean one-pager from your notes: goal, scope, milestones with tasks, what to buy, and how long it really takes."
              : "Add a few notes to the project first (edit ✏️): why, constraints, budget. Then the plan fits you, not a template."
            : ai.reason}
        </p>
        {ai.ready && (
          <div className="mx-auto mt-4 flex max-w-md flex-col gap-2 sm:flex-row">
            <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Optional: “one weekend”, “under 80 €”…" />
            <Button variant="primary" onClick={write} disabled={pending}>
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Write spec
            </Button>
          </div>
        )}
        {msg && <p className="mt-3 text-sm text-critical-text">{msg}</p>}
      </section>
    );
  }

  const c = spec.content;
  return (
    <section className="rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles size={15} className="text-accent-text" />
          <span className="font-semibold">Spec</span>
          <span className="text-muted">
            v{spec.version}
            {versions > 1 ? ` of ${versions}` : ""} · {spec.provider === "agent" ? "written by an agent" : (spec.model ?? spec.provider)}
          </span>
        </div>
        <div className="flex gap-1.5">
          {ai.ready && (
            <Button size="sm" variant="ghost" onClick={() => setRewriting((r) => !r)}>
              <RefreshCw size={13} /> Rewrite
            </Button>
          )}
          <Button size="sm" variant={spec.applied ? "secondary" : "primary"} onClick={apply} disabled={pending}>
            {spec.applied ? <Check size={13} /> : <ClipboardList size={13} />} {spec.applied ? "Applied, re-apply" : "Use this plan"}
          </Button>
        </div>
      </div>
      {rewriting && (
        <div className="anim-fade flex flex-col gap-2 border-b border-border bg-page px-5 py-3 sm:flex-row">
          <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="What should change? e.g. “cheaper”, “split into two phases”, “I already have the wood”" autoFocus />
          <Button variant="primary" onClick={write} disabled={pending}>
            <Sparkles size={14} /> Write v{spec.version + 1}
          </Button>
        </div>
      )}
      <div className="space-y-5 p-5">
        {failure}
        {msg && <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-text">{msg}</p>}
        {!spec.applied && (c.milestones.length > 0 || c.purchases.length > 0) && !msg && (
          <p className="text-xs text-ink-2">“Use this plan” copies the milestones, tasks and shopping list into the project. Nothing is duplicated if you do it twice.</p>
        )}
        <p className="text-[15px] leading-relaxed">{c.summary}</p>
        <div className="rounded-xl bg-accent-soft px-4 py-3">
          <div className="text-[11px] font-semibold tracking-wide text-accent-text uppercase">Done when</div>
          <p className="mt-0.5 text-sm">{c.goal}</p>
        </div>

        {(c.scopeIn.length > 0 || c.scopeOut.length > 0) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {c.scopeIn.length > 0 && <List title="In scope" items={c.scopeIn} mark="+" />}
            {c.scopeOut.length > 0 && <List title="Not now" items={c.scopeOut} mark="–" muted />}
          </div>
        )}

        <div>
          <H>Approach</H>
          <ol className="space-y-1.5">
            {c.approach.map((a, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="tabular grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink-2">{i + 1}</span>
                {a}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <H>Milestones</H>
          <div className="space-y-3">
            {c.milestones.map((m, i) => (
              <div key={i} className="rounded-xl border border-border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{m.title}</span>
                  <span className="shrink-0 text-xs text-muted">{m.weekOffset === 0 ? "week 1" : `week ${m.weekOffset + 1}`}</span>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {m.tasks.map((t, j) => (
                    <li key={j} className="flex gap-2 text-sm text-ink-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full border border-border-strong" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {c.purchases.length > 0 && (
          <div>
            <H>To buy</H>
            <ul className="divide-y divide-border rounded-xl border border-border text-sm">
              {c.purchases.map((b, i) => (
                <li key={i} className="flex items-baseline gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    {b.quantity > 1 && <span className="tabular text-muted">{b.quantity} × </span>}
                    {b.name}
                    {b.note && <span className="block text-xs text-muted">{b.note}</span>}
                  </span>
                  <span className="tabular shrink-0 text-ink-2">{b.estimatedCost != null ? money(b.estimatedCost * b.quantity) : "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Mini label="Effort" value={`~${c.estimate.hours} h`} hint={`${c.sessions.count} × ${duration(c.sessions.minutes)}`} />
          <Mini label="When" value={c.sessions.cadence} />
          <Mini label="Budget" value={c.estimate.budget != null ? money(c.estimate.budget) : "Nothing to buy"} />
        </div>

        {c.risks.length > 0 && <List title="Watch out for" items={c.risks} icon={<ShieldAlert size={14} className="text-warning" />} />}
        {c.openQuestions.length > 0 && <List title="Open questions" items={c.openQuestions} icon={<CircleHelp size={14} className="text-muted" />} />}

        <div className="rounded-xl border border-accent/40 px-4 py-3">
          <div className="text-[11px] font-semibold tracking-wide text-accent-text uppercase">First step</div>
          <p className="mt-0.5 text-sm font-medium">{c.firstStep}</p>
        </div>
      </div>
    </section>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{children}</h3>;
}

function List({ title, items, mark, muted, icon }: { title: string; items: string[]; mark?: string; muted?: boolean; icon?: React.ReactNode }) {
  return (
    <div>
      <H>{title}</H>
      <ul className="space-y-1">
        {items.map((s, i) => (
          <li key={i} className={`flex gap-2 text-sm ${muted ? "text-ink-2" : ""}`}>
            {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : <span className="w-3 shrink-0 text-center text-muted">{mark}</span>}
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-page px-3 py-2.5">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      {hint && <div className="text-xs text-ink-2">{hint}</div>}
    </div>
  );
}
