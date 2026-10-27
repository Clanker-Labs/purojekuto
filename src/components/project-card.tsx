import Link from "next/link";
import type { CSSProperties } from "react";
import { CalendarClock, Flag, Loader2, ShoppingCart } from "lucide-react";
import type { ProjectSummary } from "@/server/services/projects";
import { relativeDay, shortDate } from "@/lib/format";
import { CategoryChip, Progress, StatusPill } from "./bits";

export function ProjectCard({ p, today, tz }: { p: ProjectSummary; today: string; tz: string }) {
  const color = p.category?.color;
  const overdue = p.targetDate && p.targetDate < today && !["done", "dropped"].includes(p.status);
  return (
    <Link
      href={`/projects/${p.id}`}
      className="group tint-bar flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-card transition hover:border-border-strong hover:shadow-pop"
      style={{ "--c": color ?? "var(--border-strong)" } as CSSProperties}
    >
      <div className="flex items-start gap-3">
        <span className="tint grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl" style={{ "--c": color ?? "#6f86a6" } as CSSProperties} aria-hidden>
          {p.emoji ?? p.category?.emoji ?? "📁"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold group-hover:text-accent-text">{p.title}</h3>
            {p.pinned && <span className="text-xs text-muted" aria-label="Pinned">📌</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusPill status={p.status} />
            <CategoryChip category={p.category} />
            {p.priority === 3 && <span className="text-[11px] font-semibold text-critical-text">High</span>}
          </div>
        </div>
      </div>
      {p.pitch && <p className="mt-3 line-clamp-2 text-sm text-ink-2">{p.pitch}</p>}
      <div className="mt-auto pt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>{p.tasksTotal ? `${p.tasksDone} of ${p.tasksTotal} tasks` : p.hasSpec ? "Spec ready" : "No tasks yet"}</span>
          <span className="tabular font-medium text-ink-2">{p.progress}%</span>
        </div>
        <Progress value={p.progress} />
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
          {p.generating && (
            <span className="inline-flex items-center gap-1 text-accent-text">
              <Loader2 size={12} className="animate-spin" /> Writing spec…
            </span>
          )}
          {p.nextMilestone && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Flag size={12} className="shrink-0 text-muted" />
              <span className="truncate">{p.nextMilestone.title}</span>
              {p.nextMilestone.dueDate && <span className={p.nextMilestone.dueDate < today ? "text-critical-text" : "text-muted"}>· {relativeDay(p.nextMilestone.dueDate, today)}</span>}
            </span>
          )}
          {p.nextSession && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={12} className="text-muted" />
              {new Date(p.nextSession.start).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })}
            </span>
          )}
          {p.toBuy > 0 && (
            <span className="inline-flex items-center gap-1">
              <ShoppingCart size={12} className="text-muted" />
              {p.toBuy} to buy
            </span>
          )}
          {overdue && <span className="font-medium text-critical-text">Due {shortDate(p.targetDate!)}</span>}
        </div>
      </div>
    </Link>
  );
}
