import { LEVELS, type Household, type Item, type Level } from "./types";

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

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toIso(d);
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isFrozen(i: Item, h: Pick<Household, "locations">): boolean {
  return h.locations.find((l) => l.key === i.loc)?.kind === "freezer";
}

/**
 * The date that decides when to use an item. Frozen food stays safe at 0°F, so a
 * freezer item's date is a quality date from its frozen-on day and wrap; the
 * printed date only counts for food outside the freezer.
 */
export type Due = { date: string; kind: "useBy" | "quality" };

export function dueDate(i: Item, h: Pick<Household, "locations" | "freezerDays">): Due | null {
  if (isFrozen(i, h)) return i.frozenOn ? { date: addDays(i.frozenOn, h.freezerDays[i.wrap] ?? h.freezerDays.regular), kind: "quality" } : null;
  return i.useBy ? { date: i.useBy, kind: "useBy" } : null;
}

export function isUseFirst(i: Item, h: Pick<Household, "locations" | "freezerDays">, today: Date): boolean {
  if (i.level === "out") return false;
  const due = dueDate(i, h);
  const d = due && daysUntil(due.date, today);
  return d !== null && d !== undefined && d <= USE_FIRST_DAYS;
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

export function byDue(h: Pick<Household, "locations" | "freezerDays">) {
  return (a: Item, b: Item) => (dueDate(a, h)?.date ?? "9999").localeCompare(dueDate(b, h)?.date ?? "9999");
}

/** Search matches the name and note, and (given the household) the place and dietary flags. */
export function matchesQuery(i: Item, q: string, h?: Pick<Household, "locations" | "flags">): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if (i.name.toLowerCase().includes(s) || i.note.toLowerCase().includes(s)) return true;
  if (!h) return false;
  const place = h.locations.find((l) => l.key === i.loc)?.label.toLowerCase() ?? "";
  const flags = h.flags.filter((f) => i.flags.includes(f.id)).map((f) => f.label.toLowerCase());
  return place.includes(s) || flags.some((f) => f.includes(s));
}
