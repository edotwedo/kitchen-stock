import { LEVELS, type Item, type Level } from "./types";

/** Days in the Use first window. */
export const USE_FIRST_DAYS = 7;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Whole days from `today` until an ISO date; null when empty or invalid. */
export function daysUntil(iso: string, today: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - startOfDay(today).getTime()) / 864e5);
}

export function isUseFirst(i: Item, today: Date): boolean {
  if (i.level === "out") return false;
  const d = daysUntil(i.useBy, today);
  return d !== null && d <= USE_FIRST_DAYS;
}

export function isShopping(i: Item): boolean {
  return i.level === "low" || i.level === "out";
}

export function isReminderDue(i: Item, today: Date): boolean {
  const d = daysUntil(i.remindOn, today);
  return d !== null && d <= 0;
}

/** Tapping the gauge steps full → half → low → out → full. */
export function nextLevel(l: Level): Level {
  return LEVELS[(LEVELS.indexOf(l) + 1) % LEVELS.length];
}

/** Emptiest items first (out, low, half, full), then A–Z — same as the prototype. */
export function byLevelThenName(a: Item, b: Item): number {
  return LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || a.name.localeCompare(b.name);
}

export function byUseBy(a: Item, b: Item): number {
  return a.useBy.localeCompare(b.useBy);
}

export function matchesQuery(i: Item, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || i.name.toLowerCase().includes(s) || i.note.toLowerCase().includes(s);
}
