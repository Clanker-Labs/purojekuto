import { ShoppingCart } from "lucide-react";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/services/settings";
import { listProjects } from "@/server/services/projects";
import { listPurchases } from "@/server/services/items";
import { Empty, PageHeader, Stat } from "@/components/bits";
import { ShoppingList } from "@/components/shopping-list";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shopping" };

export default async function ShoppingPage() {
  const user = await requireUser();
  const currency = getSettings(user.id).currency;
  const open = listProjects(user.id, { status: "open" });
  const all = listPurchases(user.id);
  const groups = open
    .map((p) => ({ project: { id: p.id, title: p.title, emoji: p.emoji ?? p.category?.emoji ?? null }, items: all.filter((b) => b.projectId === p.id && b.status !== "bought") }))
    .filter((g) => g.items.length);
  const left = groups.flatMap((g) => g.items).filter((b) => b.currency === currency).reduce((n, b) => n + (b.unitCents ?? 0) * b.quantity, 0);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const openIds = new Set(open.map((p) => p.id));
  const spent = all.filter((b) => b.status === "bought" && openIds.has(b.projectId) && b.currency === currency).reduce((n, b) => n + (b.unitCents ?? 0) * b.quantity, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Shopping" subtitle="Everything still to buy, across open projects. Tick as you go." />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Items" value={count} />
        <Stat label="Still to spend" value={money(left, currency)} />
        <Stat label="Spent so far" value={money(spent, currency)} />
      </div>
      {groups.length ? (
        <ShoppingList
          groups={groups.map((g) => ({
            project: g.project,
            items: g.items.map((b) => ({ id: b.id, projectId: b.projectId, name: b.name, quantity: b.quantity, unitCents: b.unitCents, currency: b.currency, url: b.url, vendor: b.vendor, status: b.status })),
          }))}
        />
      ) : (
        <Empty icon={<ShoppingCart size={20} />} title="Nothing to buy">
          Purchases you add to projects, or that a spec suggests, show up here.
        </Empty>
      )}
    </div>
  );
}
