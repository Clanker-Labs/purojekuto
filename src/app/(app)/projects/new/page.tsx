import { requireUser } from "@/server/session";
import { getSettings } from "@/server/services/settings";
import { listCategories } from "@/server/services/projects";
import { aiStatus } from "@/server/ai/providers";
import { Card, PageHeader } from "@/components/bits";
import { ProjectForm } from "@/components/project-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ c?: string; title?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const s = getSettings(user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New project" subtitle="A sentence is enough to start. Add what you know; the spec fills in the rest." />
      <Card className="sm:p-6">
        <ProjectForm
          aiReady={aiStatus(user.id).ready}
          categories={listCategories(user.id).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))}
          initial={{ title: sp.title ?? "", emoji: "", pitch: "", notes: "", category: sp.c ?? "", status: "planned", priority: 2, startDate: "", targetDate: "", budget: "", currency: s.currency }}
        />
      </Card>
    </div>
  );
}
