import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";

/**
 * Tiny server-rendered charts: no chart library, no client JS. Series colours
 * come from --series-* (never teal, never green: those mean brand and status).
 */

export function WeekBars({ data, color = "var(--series-1)", format = (v: number) => String(v), label }: { data: { week: string; value: number }[]; color?: string; format?: (v: number) => string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <figure>
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className="tabular text-xs text-muted">{format(total)} in {data.length} weeks</span>
      </figcaption>
      <div className="flex h-36 items-end gap-1.5" role="img" aria-label={`${label}: ${data.map((d) => `${d.week} ${format(d.value)}`).join(", ")}`}>
        {data.map((d, i) => (
          <div key={d.week} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className={clsx("min-h-[2px] rounded-t-[5px] transition-opacity group-hover:opacity-80", d.value === 0 && "opacity-30")}
              style={{ height: `${(d.value / max) * 100}%`, background: d.value ? color : "var(--border-strong)" }}
            />
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[10px] whitespace-nowrap text-page group-hover:block">
              {format(d.value)}
            </span>
            {(i === 0 || i === data.length - 1 || i % 4 === 0) && <span className="absolute -bottom-5 left-0 text-[10px] whitespace-nowrap text-muted">{d.week.slice(5)}</span>}
          </div>
        ))}
      </div>
      <div className="h-5" />
    </figure>
  );
}

export function HBars({ rows, format = (v: number) => String(v), empty }: { rows: { key: string; label: ReactNode; value: number; color?: string; secondary?: number }[]; format?: (v: number) => string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.secondary ?? 0)));
  if (!rows.length) return <p className="text-sm text-ink-2">{empty ?? "Nothing yet."}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="tabular shrink-0 text-xs text-ink-2">{format(r.value)}</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
            {r.secondary != null && <div className="absolute inset-y-0 left-0 rounded-full bg-border-strong" style={{ width: `${(r.secondary / max) * 100}%` }} />}
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? "var(--series-1)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Heatmap({ days, today }: { days: { date: string; count: number }[]; today: string }) {
  const level = (n: number) => (n === 0 ? "" : n === 1 ? "heat-1" : n <= 3 ? "heat-2" : n <= 6 ? "heat-3" : "heat-4");
  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]" role="img" aria-label="Activity per day over the last six months">
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {w.map((d) => (
              <span
                key={d.date}
                title={`${d.date}: ${d.count} thing${d.count === 1 ? "" : "s"}`}
                className={clsx("h-3 w-3 rounded-[3px] bg-surface-2", level(d.count), d.date > today && "opacity-0", d.date === today && "ring-1 ring-accent")}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted">
        Less
        {["bg-surface-2", "heat-1", "heat-2", "heat-3", "heat-4"].map((c) => (
          <span key={c} className={clsx("h-2.5 w-2.5 rounded-[3px]", c)} />
        ))}
        More
      </div>
    </div>
  );
}

export function StackBar({ parts }: { parts: { key: string; label: string; value: number; color: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return <p className="text-sm text-ink-2">No projects yet.</p>;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {parts.filter((p) => p.value).map((p) => (
          <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color } as CSSProperties} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {parts.filter((p) => p.value).map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label} <span className="tabular text-muted">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
