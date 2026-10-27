"use client";

import { useEffect, useState, useTransition } from "react";
import clsx from "clsx";
import { Check, ExternalLink, Plus, Trash2, Truck } from "lucide-react";
import { addPurchaseAction, deletePurchaseAction, updatePurchaseAction } from "@/app/actions";
import { money } from "@/lib/format";
import type { PurchaseStatus } from "@/server/db/schema";
import { Button, Input } from "../ui";

interface B {
  id: string;
  name: string;
  quantity: number;
  unitCents: number | null;
  currency: string;
  url: string | null;
  vendor: string | null;
  notes: string;
  status: PurchaseStatus;
}

export function Purchases({ projectId, items: initial, currency, budgetCents }: { projectId: string; items: B[]; currency: string; budgetCents: number | null }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setItems(initial), [initial]);

  const total = (b: B) => (b.unitCents ?? 0) * b.quantity;
  const same = items.filter((b) => b.currency === currency);
  const spent = same.filter((b) => b.status === "bought").reduce((n, b) => n + total(b), 0);
  const left = same.filter((b) => b.status !== "bought").reduce((n, b) => n + total(b), 0);
  const unknown = items.filter((b) => b.status !== "bought" && b.unitCents == null).length;

  const set = (id: string, patch: Partial<B> & { unitPrice?: number | null }) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch, ...(patch.unitPrice !== undefined ? { unitCents: patch.unitPrice == null ? null : Math.round(patch.unitPrice * 100) } : {}) } : x)));
    start(async () => {
      const r = await updatePurchaseAction(projectId, id, patch);
      setError(r.ok ? null : r.error);
    });
  };

  const groups: { id: PurchaseStatus; label: string }[] = [
    { id: "needed", label: "To buy" },
    { id: "ordered", label: "Ordered" },
    { id: "bought", label: "Bought" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        {items.length === 0 && <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-sm text-ink-2">Nothing to buy yet. Add items below, or let the spec suggest them.</p>}
        {groups.map((g) => {
          const list = items.filter((b) => b.status === g.id);
          if (!list.length) return null;
          return (
            <section key={g.id}>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                {g.label} <span className="tabular font-normal">· {list.length}</span>
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                {list.map((b) => (
                  <li key={b.id} className="group flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => set(b.id, { status: b.status === "bought" ? "needed" : "bought" })}
                      className={clsx("grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition", b.status === "bought" ? "border-accent bg-accent text-accent-ink" : "border-border-strong hover:border-accent")}
                      aria-label={b.status === "bought" ? `Mark ${b.name} not bought` : `Mark ${b.name} bought`}
                    >
                      {b.status === "bought" && <Check size={12} strokeWidth={3} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={clsx("text-sm", b.status === "bought" && "text-muted line-through")}>
                        {b.quantity > 1 && <span className="tabular text-muted">{b.quantity} × </span>}
                        {b.name}
                      </p>
                      <p className="flex flex-wrap gap-x-2 text-xs text-muted">
                        {b.vendor && <span>{b.vendor}</span>}
                        {b.url && (
                          <a href={b.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-accent-text">
                            link <ExternalLink size={10} />
                          </a>
                        )}
                        {b.notes && <span className="truncate">{b.notes}</span>}
                      </p>
                    </div>
                    <PriceInput b={b} onSave={(unitPrice) => set(b.id, { unitPrice })} />
                    {b.status === "needed" && (
                      <button type="button" onClick={() => set(b.id, { status: "ordered" })} className="hidden rounded-lg p-1.5 text-muted group-hover:block hover:bg-surface-2 hover:text-ink" title="Mark ordered" aria-label="Mark ordered">
                        <Truck size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setItems((xs) => xs.filter((x) => x.id !== b.id));
                        start(async () => void (await deletePurchaseAction(projectId, b.id)));
                      }}
                      className="rounded-lg p-1.5 text-muted opacity-0 group-hover:opacity-100 hover:text-critical-text focus:opacity-100"
                      aria-label={`Delete ${b.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <AddPurchase projectId={projectId} currency={currency} onError={setError} />
        {error && <p className="text-sm text-critical-text">{error}</p>}
      </div>

      <aside className="h-fit space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-card lg:sticky lg:top-6">
        <Row label="Spent" value={money(spent, currency)} strong />
        <Row label="Still to buy" value={`${money(left, currency)}${unknown ? ` + ${unknown} unpriced` : ""}`} />
        {budgetCents != null && (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="flex h-full">
                <div className="bg-accent" style={{ width: `${Math.min(100, (spent / Math.max(budgetCents, 1)) * 100)}%` }} />
                <div className="bg-[color-mix(in_srgb,var(--accent)_35%,transparent)]" style={{ width: `${Math.min(100, (left / Math.max(budgetCents, 1)) * 100)}%` }} />
              </div>
            </div>
            <Row label="Budget" value={money(budgetCents, currency)} />
            <p className={clsx("text-xs", spent + left > budgetCents ? "text-critical-text" : "text-ink-2")}>
              {spent + left > budgetCents ? `${money(spent + left - budgetCents, currency)} over budget if you buy everything.` : `${money(budgetCents - spent - left, currency)} to spare.`}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-2">{label}</span>
      <span className={clsx("tabular", strong && "text-lg font-semibold")}>{value}</span>
    </div>
  );
}

function PriceInput({ b, onSave }: { b: B; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(b.unitCents != null ? String(b.unitCents / 100) : "");
  useEffect(() => setV(b.unitCents != null ? String(b.unitCents / 100) : ""), [b.unitCents]);
  return (
    <label className="flex shrink-0 items-center gap-1 text-sm">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = v.trim() ? Number(v.replace(",", ".")) : null;
          if (n !== null && Number.isNaN(n)) return setV(b.unitCents != null ? String(b.unitCents / 100) : "");
          if ((n == null ? null : Math.round(n * 100)) !== b.unitCents) onSave(n);
        }}
        inputMode="decimal"
        placeholder="price"
        aria-label={`Unit price of ${b.name}`}
        className="tabular w-20 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right hover:border-border focus:border-accent focus:outline-none"
      />
      <span className="text-xs text-muted">{b.currency}</span>
    </label>
  );
}

function AddPurchase({ projectId, currency, onError }: { projectId: string; currency: string; onError: (e: string | null) => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="rounded-2xl border border-border bg-surface p-3 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        start(async () => {
          const r = await addPurchaseAction(projectId, {
            name,
            quantity: Number(qty) || 1,
            unitPrice: price.trim() ? Number(price.replace(",", ".")) : null,
            url: url.trim() || null,
          });
          onError(r.ok ? null : r.error);
          if (r.ok) {
            setName("");
            setQty("1");
            setPrice("");
            setUrl("");
          }
        });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add something to buy" className="min-w-40 flex-[3]" />
        <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className="w-14 text-center" aria-label="Quantity" />
        <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder={`€/unit`.replace("€", currency)} className="w-24" aria-label="Unit price" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link (optional)" className="min-w-32 flex-[2]" />
        <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
          <Plus size={15} /> Add
        </Button>
      </div>
    </form>
  );
}
