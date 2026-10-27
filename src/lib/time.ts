import { DateTime, Settings } from "luxon";

// One locale everywhere: the server renders the first paint and the browser
// hydrates it, so month and weekday names must not depend on either machine's
// locale (a French iPhone against an English server is a hydration mismatch).
Settings.defaultLocale = "en-GB";

/**
 * Time helpers shared by the server and the browser. Instants are UTC epoch
 * milliseconds; "local" strings are wall-clock times in a named IANA zone.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function isValidZone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}

export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s, { zone: "UTC" }).isValid;
}

/** 'YYYY-MM-DD' → UTC midnight ms (how all-day events are stored). */
export function dateToUtcMs(date: string): number {
  const dt = DateTime.fromISO(date, { zone: "UTC" });
  if (!dt.isValid || !isISODate(date)) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  return dt.toMillis();
}

/** UTC midnight ms → 'YYYY-MM-DD'. */
export function utcMsToDate(ms: number): string {
  return DateTime.fromMillis(ms, { zone: "UTC" }).toISODate()!;
}

/**
 * Parse a date-time for a timezone. Accepts an ISO instant with an offset or
 * Z ("2026-10-14T09:00:00Z", "2026-10-14T09:00+02:00"), or a wall-clock time
 * that is read in `tz` ("2026-10-14T09:00", "2026-10-14 09:00").
 */
export function parseDateTime(input: string, tz: string): number {
  const s = input.trim().replace(" ", "T");
  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const dt = hasOffset ? DateTime.fromISO(s, { setZone: true }) : DateTime.fromISO(s, { zone: tz });
  if (!dt.isValid) throw new Error(`Invalid date-time "${input}", expected e.g. 2026-10-14T09:00`);
  return dt.toMillis();
}

/** ms → 'YYYY-MM-DDTHH:mm' wall clock in tz (no offset). */
export function toLocalInput(ms: number, tz: string): string {
  return DateTime.fromMillis(ms, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** ms → ISO with the zone's offset, e.g. 2026-10-14T09:00:00+02:00. */
export function toZonedISO(ms: number, tz: string): string {
  return DateTime.fromMillis(ms, { zone: tz }).toISO({ suppressMilliseconds: true })!;
}

/** Midnight that starts the day containing `ms`, in tz. */
export function startOfDay(ms: number, tz: string): number {
  return DateTime.fromMillis(ms, { zone: tz }).startOf("day").toMillis();
}

/** 'YYYY-MM-DD' at midnight in tz → ms. */
export function zonedDateStart(date: string, tz: string): number {
  return DateTime.fromISO(date, { zone: tz }).startOf("day").toMillis();
}

/** Today's date ('YYYY-MM-DD') in tz. */
export function todayIn(tz: string, now = Date.now()): string {
  return DateTime.fromMillis(now, { zone: tz }).toISODate()!;
}

/** Human duration: 90 → "1 h 30 min". */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"}`;
  if (min % 60 === 0) return `${min / 60} h`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** Reminder label: 0 → "At start", 10 → "10 min before". */
export function reminderLabel(min: number): string {
  if (min === 0) return "At start";
  if (min % 10080 === 0) return `${min / 10080} week${min === 10080 ? "" : "s"} before`;
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"} before`;
  if (min % 60 === 0) return `${min / 60} hour${min === 60 ? "" : "s"} before`;
  return `${min} min before`;
}
