import { db } from "@/server/db/client";
import { getSettings, updateSettings } from "./settings";
import { deleteUser, getUser, listUsers } from "./users";

/**
 * The people with an account here, as the owner manages them: who they are,
 * which khal person their sessions go to, and removing them. Invites (how
 * they get an account) live in ./invites.
 */

function requireOwner(uid: string) {
  if (getUser(uid)?.role !== "owner") throw new Error("Only the owner of this purojekuto can manage people.");
}

export interface PersonRow {
  id: string;
  name: string;
  role: "owner" | "member";
  /** The khal person their sessions go to; null = not linked ("default" never shows: the owner's null means khal's default user). */
  khalUserId: string | null;
  createdAt: Date;
}

export function listPeopleDetailed(): PersonRow[] {
  return listUsers().map((u) => ({ id: u.id, name: u.name, role: u.role, khalUserId: getSettings(u.id).khalUserId, createdAt: u.createdAt }));
}

/** Point someone's sessions at a khal person (null = unlink; for the owner, back to khal's default user). */
export function linkKhal(uid: string, personId: string, khalUserId: string | null) {
  requireOwner(uid);
  if (!getUser(personId)) throw new Error("No such person");
  const before = getSettings(personId).khalUserId;
  if (before === khalUserId) return;
  // A different person in khal means a different Projects calendar: find or create theirs next time.
  updateSettings(personId, { khalUserId, khalCalendarId: null });
}

/**
 * Delete someone's account. Their own projects go with it (say so first).
 * What they added to other people's projects stays, handed to each project's
 * owner, so a shared board doesn't lose tasks when a member leaves.
 */
export function removePerson(uid: string, personId: string) {
  requireOwner(uid);
  if (personId === uid) throw new Error("The owner can't remove themselves");
  if (!getUser(personId)) return;
  const sqlite = db().$client;
  sqlite.transaction(() => {
    for (const table of ["tasks", "milestones", "purchases", "specs", "ai_jobs", "activity"]) {
      sqlite
        .prepare(
          `UPDATE ${table} SET user_id = (SELECT p.user_id FROM projects p WHERE p.id = ${table}.project_id)
           WHERE user_id = ? AND project_id IN (SELECT id FROM projects WHERE user_id != ?)`,
        )
        .run(personId, personId);
    }
    deleteUser(personId);
  })();
}
