"use client";

import { useState, useTransition } from "react";
import { FileDown, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { deleteProjectAction, setStatusAction, updateProjectAction } from "@/app/actions";
import { STATUSES } from "@/lib/projects";
import type { ProjectStatus } from "@/server/db/schema";
import { Button, Select, Sheet } from "../ui";
import { ProjectForm, type ProjectFormValues } from "../project-form";

export function ProjectActions({
  project,
  categories,
  form,
}: {
  project: { id: string; title: string; status: ProjectStatus; pinned: boolean; isOwner: boolean };
  categories: { id: string; name: string; emoji: string }[];
  form: ProjectFormValues;
}) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [, start] = useTransition();

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Select
        value={project.status}
        onChange={(e) => start(async () => void (await setStatusAction(project.id, e.target.value as ProjectStatus)))}
        className="hidden w-32 sm:block"
        aria-label="Status"
      >
        {STATUSES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </Select>
      <Button size="icon" onClick={() => setEditing(true)} aria-label="Edit project">
        <Pencil size={16} />
      </Button>
      <div className="relative">
        <Button size="icon" variant="ghost" onClick={() => setMenu((m) => !m)} aria-label="More" aria-expanded={menu}>
          <MoreHorizontal size={18} />
        </Button>
        {menu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} aria-hidden />
            <div className="anim-fade absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-pop" role="menu">
              <label className="block px-3 py-2 sm:hidden">
                <span className="mb-1 block text-xs text-muted">Status</span>
                <Select value={project.status} onChange={(e) => start(async () => void (await setStatusAction(project.id, e.target.value as ProjectStatus)))}>
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </label>
              <MenuItem
                icon={project.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                onClick={() => start(async () => void (await updateProjectAction(project.id, { pinned: !project.pinned })))}
              >
                {project.pinned ? "Unpin" : "Pin to the top"}
              </MenuItem>
              <a href={`/projects/${project.id}/export`} target="_blank" rel="noopener" className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2" role="menuitem">
                <FileDown size={15} className="text-muted" /> Interactive page (HTML)
              </a>
              <a href={`/projects/${project.id}/export?download=1`} className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2" role="menuitem">
                <FileDown size={15} className="text-muted" /> Download HTML
              </a>
              <a href={`/projects/${project.id}/export?format=md`} target="_blank" rel="noopener" className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2" role="menuitem">
                <FileDown size={15} className="text-muted" /> Spec as Markdown
              </a>
              {project.isOwner && <div className="my-1 border-t border-border" />}
              {project.isOwner && (
                <MenuItem
                  danger
                  icon={<Trash2 size={15} />}
                  onClick={() => {
                    if (confirm(`Delete “${project.title}” and everything in it, for everyone on it? Marking it Dropped keeps the history.`)) start(() => deleteProjectAction(project.id));
                  }}
                >
                  Delete project
                </MenuItem>
              )}
            </div>
          </>
        )}
      </div>
      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit project" size="lg">
        <ProjectForm projectId={project.id} initial={form} categories={categories} onDone={() => setEditing(false)} />
      </Sheet>
    </div>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2 ${danger ? "text-critical-text" : ""}`}>
      <span className={danger ? "" : "text-muted"}>{icon}</span>
      {children}
    </button>
  );
}
