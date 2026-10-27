import clsx from "clsx";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ProjectStatus } from "@/server/db/schema";
import { statusLabel } from "@/lib/projects";

/** Presentational pieces shared by server and client components (no hooks). */

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium text-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={clsx("rounded-2xl border border-border bg-surface p-5 shadow-card", className)}>{children}</As>;
}

export function CardTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("mb-3 flex items-center justify-between gap-2", className)}>
      <h2 className="text-sm font-semibold">{children}</h2>
      {action}
    </div>
  );
}

const STATUS_STYLE: Record<ProjectStatus, string> = {
  idea: "text-ink-2 bg-surface-2",
  planned: "text-ink-2 bg-surface-2 ring-1 ring-inset ring-border-strong",
  active: "text-accent-text bg-accent-soft",
  paused: "text-warning bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]",
  done: "text-accent-ink bg-accent",
  dropped: "text-muted bg-surface-2 line-through",
};

export function StatusPill({ status, className }: { status: ProjectStatus; className?: string }) {
  return <span className={clsx("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold", STATUS_STYLE[status], className)}>{statusLabel(status)}</span>;
}

export function CategoryChip({ category, className }: { category: { name: string; emoji: string; color: string } | null; className?: string }) {
  if (!category) return null;
  return (
    <span className={clsx("tint inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium", className)} style={{ "--c": category.color } as CSSProperties}>
      <span aria-hidden>{category.emoji}</span>
      {category.name}
    </span>
  );
}

export function Progress({ value, className, color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={clsx("h-1.5 overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(value, value > 0 ? 3 : 0)}%`, background: color }} />
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-2xl border border-border bg-surface p-4 shadow-card", className)}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-2">{hint}</div>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-text">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-md text-sm text-ink-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LinkButton({ href, children, variant = "secondary", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition",
        variant === "primary" && "bg-accent font-semibold text-accent-ink hover:brightness-105",
        variant === "secondary" && "border border-border bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {children}
    </Link>
  );
}
