/** Display helpers shared by pages and agent tools. Pure: safe in the browser. */

export function money(cents: number | null | undefined, currency: string, opts: { exact?: boolean } = {}): string {
  if (cents == null) return "—";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: opts.exact || Math.abs(value) < 100 ? 2 : 0,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** "1 h 30", "45 min". */
export function duration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** "in 3 days", "2 weeks ago", "today" for a 'YYYY-MM-DD' against today's date. */
export function relativeDay(date: string, today: string): string {
  const d = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  const abs = Math.abs(d);
  const unit = abs >= 14 ? `${Math.round(abs / 7)} weeks` : `${abs} days`;
  return d > 0 ? `in ${unit}` : `${unit} ago`;
}

export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
