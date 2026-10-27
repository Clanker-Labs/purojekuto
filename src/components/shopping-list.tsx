"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import { updatePurchaseAction } from "@/app/actions";
import { money } from "@/lib/format";
import type { PurchaseStatus } from "@/server/db/schema";

interface Item {
  id: string;
  projectId: string;
  name: string;
  quantity: number;
  unitCents: number | null;
  currency: string;
  url: string | null;
  vendor: string | null;
  status: PurchaseStatus;
}

/** Every open project's list in one place, for the trip to the shop. Ticking marks it bought. */
export function ShoppingList({ groups }: { groups: { project: { id: string; title: string; emoji: string | null }; items: Item[] }[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [, start] = useTransition();
  const toggle = (it: Item) => {
    const now = !(done[it.id] ?? it.status === "bought");
    setDone((d) => ({ ...d, [it.id]: now }));
    start(async () => void (await updatePurchaseAction(it.projectId, it.id, { status: now ? "bought" : "needed" })));
  };
  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const total = g.items.reduce((n, b) => n + (b.unitCents ?? 0) * b.quantity, 0);
        return (
          <section key={g.project.id}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <Link href={`/projects/${g.project.id}?tab=buy`} className="text-sm font-semibold hover:text-accent-text">
                {g.project.emoji ?? "📁"} {g.project.title}
              </Link>
              <span className="tabular text-xs text-muted">~{money(total, g.items[0]?.currency ?? "EUR")}</span>
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
              {g.items.map((b) => {
                const bought = done[b.id] ?? b.status === "bought";
                return (
                  <li key={b.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                      <input type="checkbox" checked={bought} onChange={() => toggle(b)} className="sr-only" />
                      <span className={clsx("grid h-5 w-5 shrink-0 place-items-center rounded-md border-2", bought ? "border-accent bg-accent text-accent-ink" : "border-border-strong")} aria-hidden>
                        {bought && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className={clsx("min-w-0 flex-1 text-sm", bought && "text-muted line-through")}>
                        {b.quantity > 1 && <span className="tabular text-muted">{b.quantity} × </span>}
                        {b.name}
                        {(b.vendor || b.status === "ordered") && (
                          <span className="block text-xs text-muted">
                            {b.status === "ordered" ? "ordered" : ""}
                            {b.vendor ? `${b.status === "ordered" ? " · " : ""}${b.vendor}` : ""}
                          </span>
                        )}
                      </span>
                      {b.url && (
                        <a href={b.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted hover:text-accent-text" aria-label={`Open link for ${b.name}`}>
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <span className="tabular w-20 shrink-0 text-right text-sm text-ink-2">{b.unitCents != null ? money(b.unitCents * b.quantity, b.currency) : "—"}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
