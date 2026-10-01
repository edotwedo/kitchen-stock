import { daysUntil, dueDate } from "./logic";
import type { Household, Item } from "./types";

export function fmtDate(iso: string, withYear?: boolean): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  const year = withYear ?? d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: year ? "numeric" : undefined });
}

/** The date tag shown on a row: what it says and how loud it is. */
export function dueTag(i: Item, h: Household, today: Date): { text: string; tone: "past" | "soon" | "quiet" } | null {
  const due = dueDate(i, h);
  if (!due) return null;
  const d = daysUntil(due.date, today);
  if (d === null) return null;
  if (due.kind === "quality") {
    // Frozen food stays safe; this is about taste and texture, so it never goes red.
    if (d < 0) return { text: "Past best quality", tone: "soon" };
    if (d <= 7) return { text: "Best quality until " + fmtDate(due.date), tone: "soon" };
    // Most of the freezer is months away; only mention the date once it's getting close.
    return d <= 30 ? { text: "Best until " + fmtDate(due.date), tone: "quiet" } : null;
  }
  if (d < 0) return { text: "Past " + fmtDate(due.date), tone: "past" };
  if (d === 0) return { text: "Use today", tone: "past" };
  if (d <= 3) return { text: "Use by " + fmtDate(due.date), tone: "soon" };
  return { text: "Use by " + fmtDate(due.date), tone: "quiet" };
}
