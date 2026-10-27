"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { fromIdeaAction } from "@/app/actions";
import { Button, Select } from "./ui";

export function IdeaPromote({ ideaId, categories }: { ideaId: number; categories: { id: string; name: string; emoji: string }[] }) {
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44" aria-label="Category">
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.emoji} {c.name}
          </option>
        ))}
      </Select>
      <Button
        variant="primary"
        size="sm"
        className="h-9"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await fromIdeaAction(ideaId, category || undefined);
            if (r && !r.ok) setError(r.error);
          })
        }
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} Make it a project
      </Button>
      {error && <p className="w-full text-xs text-critical-text">{error}</p>}
    </div>
  );
}
