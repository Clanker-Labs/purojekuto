"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LogOut, UserPlus, Users, X } from "lucide-react";
import { shareProjectAction, unshareProjectAction } from "@/app/actions";
import { Avatar, AvatarStack } from "../bits";
import { Button, Select, Sheet } from "../ui";

interface Person {
  id: string;
  name: string;
}

/**
 * Who is on a project. The owner shares it with anyone who has an account
 * here and takes people off it; a member can see who's on it and leave.
 */
export function ProjectPeople({ projectId, title, people, everyone, me }: { projectId: string; title: string; people: (Person & { role: "owner" | "member" })[]; everyone: Person[]; me: string }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const owner = people[0];
  const isOwner = owner?.id === me;
  const others = everyone.filter((p) => !people.some((x) => x.id === p.id));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Failed"));
    });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg py-0.5 pr-2 text-xs text-ink-2 hover:text-ink">
        {people.length > 1 ? (
          <>
            <AvatarStack people={people} size={22} />
            <span>{isOwner ? `Shared with ${people.length - 1}` : `${owner.name}'s project`}</span>
          </>
        ) : (
          <>
            <Users size={14} className="text-muted" /> Share
          </>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={`People on “${title}”`} size="sm">
        <ul className="divide-y divide-border rounded-xl border border-border">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Avatar person={p} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {p.name}
                  {p.id === me && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className="block text-xs text-muted">{p.role === "owner" ? "Owner" : "Can see and edit everything"}</span>
              </span>
              {isOwner && p.role === "member" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label={`Remove ${p.name}`}
                  onClick={() => confirm(`Take ${p.name} off “${title}”? Their tasks here become unassigned.`) && run(() => unshareProjectAction(projectId, p.id))}
                >
                  <X size={14} />
                </Button>
              )}
            </li>
          ))}
        </ul>

        {isOwner ? (
          others.length ? (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!pick) return;
                run(async () => {
                  const r = await shareProjectAction(projectId, pick);
                  if (r.ok) setPick("");
                  return r;
                });
              }}
            >
              <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Person to add">
                <option value="">Add someone…</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="primary" disabled={!pick || pending}>
                <UserPlus size={15} /> Add
              </Button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-ink-2">
              {everyone.length > 1 ? "Everyone with an account is already on it." : "Nobody else has an account yet."}{" "}
              <Link href="/settings#people" className="font-medium text-accent-text hover:underline">
                Invite someone
              </Link>
            </p>
          )
        ) : (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Only {owner?.name} can add people or delete it.</p>
            <Button size="sm" disabled={pending} onClick={() => confirm(`Leave “${title}”? You won't see it any more.`) && run(() => unshareProjectAction(projectId, me))}>
              <LogOut size={14} /> Leave
            </Button>
          </div>
        )}
        <p className="mt-4 text-xs text-muted">Everyone on a project sees the plan, board, shopping list and sessions. Each person's sessions go into their own khal calendar.</p>
        {error && <p className="mt-2 text-sm text-critical-text">{error}</p>}
      </Sheet>
    </>
  );
}
