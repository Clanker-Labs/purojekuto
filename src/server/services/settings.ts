import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { settings } from "@/server/db/schema";
import { isValidZone } from "@/lib/time";

export type AiProviderKind = "claude-code" | "anthropic" | "none";

export interface Settings {
  timezone: string;
  /** ISO 4217, for budgets and purchases. */
  currency: string;
  /** 1 = Monday … 7 = Sunday. */
  weekStart: 1 | 6 | 7;
  aiProvider: AiProviderKind;
  /** Claude model alias or id ("opus", "sonnet", "haiku", or a full id). */
  aiModel: string;
  /** Default length of a new working session, minutes. */
  sessionMinutes: number;
  /** Mirror work sessions and milestones into khal. */
  khalSync: boolean;
  /** The khal calendar purojekuto writes to (created on first use). */
  khalCalendarId: string | null;
}

/** Server default timezone: PUROJEKUTO_TIMEZONE, then TZ, then UTC. */
export function defaultTimezone(): string {
  for (const tz of [process.env.PUROJEKUTO_TIMEZONE, process.env.TZ]) if (tz && isValidZone(tz)) return tz;
  return "UTC";
}

function defaultProvider(): AiProviderKind {
  const v = (process.env.PUROJEKUTO_AI_PROVIDER ?? "").trim();
  return v === "anthropic" || v === "none" || v === "claude-code" ? v : "claude-code";
}

export const DEFAULT_SETTINGS = (): Settings => ({
  timezone: defaultTimezone(),
  currency: (process.env.PUROJEKUTO_CURRENCY || "EUR").toUpperCase(),
  weekStart: 1,
  aiProvider: defaultProvider(),
  aiModel: process.env.PUROJEKUTO_AI_MODEL || "opus",
  sessionMinutes: 120,
  khalSync: true,
  khalCalendarId: null,
});

export function getSettings(uid: string): Settings {
  const d = DEFAULT_SETTINGS();
  const r = Object.fromEntries(db().select().from(settings).where(eq(settings.userId, uid)).all().map((x) => [x.key, x.value]));
  const out = { ...d } as Record<string, unknown>;
  for (const k of Object.keys(d)) {
    if (r[k] === undefined) continue;
    try {
      out[k] = JSON.parse(r[k]);
    } catch {
      /* keep the default */
    }
  }
  const s = out as unknown as Settings;
  if (!isValidZone(s.timezone)) s.timezone = d.timezone;
  return s;
}

export function updateSettings(uid: string, patch: Partial<Settings>): Settings {
  if (patch.timezone !== undefined && !isValidZone(patch.timezone)) throw new Error(`Unknown timezone "${patch.timezone}"`);
  if (patch.currency !== undefined && !/^[A-Z]{3}$/.test(patch.currency)) throw new Error("currency must be a 3-letter code like EUR");
  if (patch.weekStart !== undefined && ![1, 6, 7].includes(patch.weekStart)) throw new Error("weekStart must be 1 (Mon), 6 (Sat) or 7 (Sun)");
  if (patch.aiProvider !== undefined && !["claude-code", "anthropic", "none"].includes(patch.aiProvider)) throw new Error("Unknown AI provider");
  if (patch.sessionMinutes !== undefined && !(patch.sessionMinutes >= 15 && patch.sessionMinutes <= 600)) throw new Error("sessionMinutes must be 15–600");
  db().transaction((tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const v = JSON.stringify(value);
      tx.insert(settings).values({ userId: uid, key, value: v }).onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value: v } }).run();
    }
  });
  return getSettings(uid);
}
