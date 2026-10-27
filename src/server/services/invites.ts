import { and, eq, gt, lt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db/client";
import { authChallenges } from "@/server/db/schema";
import { getUser } from "./users";

/**
 * Invites let the owner bring someone (a partner, family) onto a purojekuto whose
 * sign-up is closed: a single-use link, valid a week, that opens the sign-up
 * page for one new account. Stored with the other one-time codes.
 */
const TTL_MS = 7 * 24 * 3_600_000;

export interface Invite {
  code: string;
  name: string | null;
  expiresAt: Date;
}

function requireOwner(uid: string) {
  if (getUser(uid)?.role !== "owner") throw new Error("Only the owner of this purojekuto can invite people.");
}

export function createInvite(uid: string, name?: string | null): Invite {
  requireOwner(uid);
  db().delete(authChallenges).where(lt(authChallenges.expiresAt, new Date())).run();
  const code = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  const label = name?.trim().slice(0, 60) || null;
  db().insert(authChallenges).values({ id: `inv-${code}`, kind: "invite", challenge: code, userId: uid, pendingName: label, expiresAt }).run();
  return { code, name: label, expiresAt };
}

export function listInvites(uid: string): Invite[] {
  requireOwner(uid);
  return db()
    .select()
    .from(authChallenges)
    .where(and(eq(authChallenges.kind, "invite"), gt(authChallenges.expiresAt, new Date())))
    .all()
    .map((r) => ({ code: r.challenge, name: r.pendingName, expiresAt: r.expiresAt }));
}

export function revokeInvite(uid: string, code: string) {
  requireOwner(uid);
  db().delete(authChallenges).where(and(eq(authChallenges.id, `inv-${code}`), eq(authChallenges.kind, "invite"))).run();
}

/** A live invite (without using it up), or null. */
export function checkInvite(code: string | null | undefined): Invite | null {
  if (!code) return null;
  const r = db().select().from(authChallenges).where(eq(authChallenges.id, `inv-${code}`)).get();
  if (!r || r.kind !== "invite" || r.expiresAt.getTime() < Date.now()) return null;
  return { code: r.challenge, name: r.pendingName, expiresAt: r.expiresAt };
}

/** Use an invite up. False if it was already used or expired (someone was faster). */
export function consumeInvite(code: string): boolean {
  const res = db()
    .delete(authChallenges)
    .where(and(eq(authChallenges.id, `inv-${code}`), eq(authChallenges.kind, "invite"), gt(authChallenges.expiresAt, new Date())))
    .run();
  return res.changes === 1;
}
