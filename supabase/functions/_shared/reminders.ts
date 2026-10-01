/**
 * What the reminder notifications say. Shared by the app (tests, previews) and the
 * send-reminders server function, so it has no imports and works in Node and Deno.
 *
 * Rules agreed with the owner:
 * - One morning notification, not one per item: food due within 3 days (or past due),
 *   frozen food reaching the end of its quality clock, and remind-on dates for today.
 * - The Use first list already shows a 7-day window without interrupting anyone.
 * - Saturday morning: the shopping list (everything low or out), plus a one-line nudge for
 *   any place that was counted before but not in the last two weeks.
 */

export interface ReminderItem {
  name: string;
  loc: string;
  level: string; // full | half | low | out
  use_by: string | null; // YYYY-MM-DD
  remind_on: string | null;
  frozen_on: string | null;
  wrap: string; // regular | vacuum | chamber
}

export interface ReminderKitchen {
  name: string;
  settings: {
    locations?: { key: string; label: string; kind: string; counted?: string }[];
    freezerDays?: Partial<Record<string, number>>;
  };
}

export interface Notice {
  title: string;
  body: string;
  /** Opens this list in the app when tapped. */
  tab: "first" | "shop";
  count: number;
}

export const WARN_DAYS = 3;
export const RECOUNT_DAYS = 14;
const FREEZER_DEFAULTS: Record<string, number> = { regular: 90, vacuum: 365, chamber: 730 };

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
}

/** The local calendar date (YYYY-MM-DD) at an instant, in a time zone like "America/Los_Angeles". */
export function localDate(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The local hour (0-23) and weekday (0 = Sunday) at an instant. */
export function localClock(at: Date, timeZone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Sun");
  return { hour, weekday };
}

function list(names: string[], max = 4): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

/** The morning notification, or null when nothing needs attention. */
export function morningNotice(k: ReminderKitchen, items: ReminderItem[], today: string): Notice | null {
  const freezers = new Set((k.settings.locations ?? []).filter((l) => l.kind === "freezer").map((l) => l.key));
  const days = { ...FREEZER_DEFAULTS, ...(k.settings.freezerDays ?? {}) } as Record<string, number>;
  const t = dayNumber(today);

  const past: string[] = [];
  const soon: string[] = [];
  const quality: string[] = [];
  const remind: string[] = [];
  for (const i of items) {
    if (i.remind_on && dayNumber(i.remind_on) === t) remind.push(i.name);
    if (i.level === "out") continue;
    if (freezers.has(i.loc)) {
      if (!i.frozen_on) continue;
      const left = dayNumber(i.frozen_on) + (days[i.wrap] ?? days.regular) - t;
      // Only on the day it crosses into its last week, so it isn't repeated daily.
      if (left === 7) quality.push(i.name);
    } else if (i.use_by) {
      const left = dayNumber(i.use_by) - t;
      if (left < 0 && left >= -2) past.push(i.name); // just went past: mention for two days, then stop
      else if (left >= 0 && left <= WARN_DAYS) soon.push(i.name);
    }
  }

  const lines: string[] = [];
  if (past.length) lines.push(`Past date: ${list(past)}`);
  if (soon.length) lines.push(`Use soon: ${list(soon)}`);
  if (quality.length) lines.push(`Freezer, best within a week: ${list(quality)}`);
  if (remind.length) lines.push(`Reminder: ${list(remind)}`);
  const count = past.length + soon.length + quality.length + remind.length;
  if (!count) return null;
  return { title: count === 1 ? `${k.name}: 1 thing to check` : `${k.name}: ${count} things to check`, body: lines.join("\n"), tab: "first", count };
}

/** Saturday's shopping list notification, or null when nothing is low or out. */
export function shoppingNotice(k: ReminderKitchen, items: ReminderItem[], today?: string): Notice | null {
  const need = items.filter((i) => i.level === "low" || i.level === "out").map((i) => i.name);
  if (!need.length) return null;
  // Places that have been counted before, but not lately (never-counted places aren't nagged about).
  const stale = today ? (k.settings.locations ?? []).filter((l) => l.counted && dayNumber(today) - dayNumber(l.counted) >= RECOUNT_DAYS).map((l) => l.label) : [];
  const body = list(need, 8) + (stale.length ? `
Not counted in a while: ${list(stale)}` : "");
  return { title: `${k.name}: shopping list (${need.length})`, body, tab: "shop", count: need.length };
}
