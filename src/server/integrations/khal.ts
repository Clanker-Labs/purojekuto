import { getSettings, updateSettings } from "@/server/services/settings";
import { toZonedISO } from "@/lib/time";

/**
 * khal, the calendar, over its plain-HTTP tool API (POST /api/tools/<name>,
 * the same tools its MCP server exposes). purojekuto keeps one calendar of
 * its own there — "Projects" — and writes work sessions (timed) and
 * milestones (all-day) into it. khal stays the source of truth for time; the
 * ids it returns are stored on our rows so edits and deletes follow.
 *
 * Optional: unset PUROJEKUTO_KHAL_URL and nothing here is called.
 */

export const KHAL_CALENDAR_NAME = "Projects";

export function khalConfigured(): boolean {
  return Boolean(process.env.PUROJEKUTO_KHAL_URL?.trim());
}

/** Where people open khal in a browser (links on sessions), if known. */
export function khalPublicUrl(): string | null {
  return process.env.PUROJEKUTO_KHAL_PUBLIC_URL?.trim().replace(/\/+$/, "") || null;
}

export class KhalError extends Error {}

async function call<T = unknown>(tool: string, args: Record<string, unknown>): Promise<T> {
  const base = process.env.PUROJEKUTO_KHAL_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new KhalError("khal is not connected (PUROJEKUTO_KHAL_URL is unset)");
  const token = process.env.PUROJEKUTO_KHAL_TOKEN?.trim();
  let res: Response;
  try {
    res = await fetch(`${base}/api/tools/${tool}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new KhalError(`khal is unreachable at ${base}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) throw new KhalError("khal refused the token (check PUROJEKUTO_KHAL_TOKEN), or khal has no account yet");
  if (!res.ok) throw new KhalError(`khal ${tool}: ${body.error ?? `HTTP ${res.status}`}`);
  return body as T;
}

interface KhalCalendar {
  id: string;
  name: string;
  ref?: string;
  readOnly?: boolean;
  role?: string;
}

/** The Projects calendar's id, creating it in khal the first time. */
export async function ensureCalendar(uid: string): Promise<string> {
  const known = getSettings(uid).khalCalendarId;
  const { calendars } = await call<{ calendars: KhalCalendar[] }>("list_calendars", {});
  if (known && calendars.some((c) => c.id === known)) return known;
  const existing = calendars.find((c) => c.name === KHAL_CALENDAR_NAME && !c.readOnly && (c.role ?? "owner") === "owner");
  const id =
    existing?.id ??
    (
      await call<KhalCalendar>("create_calendar", {
        name: KHAL_CALENDAR_NAME,
        color: "#7c72ff",
        description: "Work sessions and milestones from purojekuto. Edit them there; changes here are overwritten.",
      })
    ).id;
  updateSettings(uid, { khalCalendarId: id });
  return id;
}

export interface KhalEventInput {
  title: string;
  /** Timed: UTC ms. */
  start?: number;
  end?: number;
  /** All-day: 'YYYY-MM-DD'. */
  date?: string;
  description?: string;
  url?: string | null;
}

function eventArgs(uid: string, e: KhalEventInput) {
  const tz = getSettings(uid).timezone;
  const when =
    e.date != null
      ? { allDay: true, start: e.date, end: e.date }
      : { allDay: false, start: toZonedISO(e.start!, tz), end: toZonedISO(e.end!, tz), timezone: tz };
  return { title: e.title, description: e.description ?? null, url: e.url ?? null, ...when };
}

export async function createKhalEvent(uid: string, e: KhalEventInput): Promise<string> {
  const calendar = await ensureCalendar(uid);
  const out = await call<{ event: { eventId?: string; id: string } }>("create_event", { ...eventArgs(uid, e), calendar });
  return out.event.eventId ?? out.event.id;
}

export async function updateKhalEvent(uid: string, id: string, e: KhalEventInput): Promise<void> {
  await call("update_event", { id, ...eventArgs(uid, e) });
}

/** Deleting something already gone in khal is fine. */
export async function deleteKhalEvent(id: string): Promise<void> {
  try {
    await call("delete_event", { id });
  } catch (e) {
    if (e instanceof KhalError && /no (such )?event|not found/i.test(e.message)) return;
    throw e;
  }
}

/** For the settings page: is it wired, and does it answer? */
export async function khalStatus(uid: string): Promise<{ configured: boolean; ok: boolean; calendarId: string | null; error?: string }> {
  if (!khalConfigured()) return { configured: false, ok: false, calendarId: null };
  try {
    const calendarId = await ensureCalendar(uid);
    return { configured: true, ok: true, calendarId };
  } catch (e) {
    return { configured: true, ok: false, calendarId: null, error: e instanceof Error ? e.message : String(e) };
  }
}
