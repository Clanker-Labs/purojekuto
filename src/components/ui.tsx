"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";

/** Small UI primitives. Quiet surfaces, hairline borders, one accent. */

const buttonStyles = {
  primary: "bg-accent text-accent-ink hover:brightness-105 active:brightness-95 font-semibold",
  secondary: "border border-border bg-surface hover:bg-surface-2 text-ink",
  ghost: "hover:bg-surface-2 text-ink-2 hover:text-ink",
  danger: "border border-border text-critical-text hover:bg-surface-2",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles; size?: "sm" | "md" | "icon" }) {
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition select-none disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-xs" : size === "icon" ? "h-9 w-9" : "h-9 px-3.5 text-sm",
        buttonStyles[variant],
        className,
      )}
      {...rest}
    />
  );
}

// Full width unless the caller gives a width (w-28, w-32…): two w-* classes would fight on CSS order.
const width = (className?: string) => (/(^|\s)(max-|min-)?w-/.test(className ?? "") ? null : "w-full");
const fieldBase =
  "h-9 rounded-lg border border-border bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={clsx(fieldBase, width(className), className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={clsx(fieldBase, width(className), "pr-8", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={clsx(fieldBase, width(className), "h-auto py-2", className)} {...rest} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; className?: string }) {
  return (
    <label className={clsx("inline-flex cursor-pointer items-center gap-2.5 text-sm select-none", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx("relative h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-border-strong")}
      >
        <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <span>{label}</span>
    </label>
  );
}

/**
 * Modal: a bottom sheet on phones, a centered dialog from `sm` up. Esc and a
 * click on the scrim close it; focus moves into it on open.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current;
      el?.focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={clsx(
          "anim-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-pop outline-none sm:rounded-2xl",
          size === "sm" ? "sm:max-w-sm" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden />
        {title !== undefined && (
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-4">
            <div id={labelledBy} className="min-w-0 text-base font-semibold">
              {title}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="-mr-2">
              <X size={18} />
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="safe-bottom flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 pt-3 sm:pb-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted">{children}</kbd>;
}
