import { fmtDate } from "./format";
import { byLevelThenName, dueDate, isFrozen, isShopping } from "./logic";
import type { Household, Item } from "./types";

/**
 * What goes on the printable sheets: an inventory sheet per place (every item, A to Z)
 * or the shopping list (low and out items, grouped by place). Shared with the phone app.
 */

export type PrintKind = "inventory" | "shopping";

export interface PrintPage {
  place: string;
  frozen: boolean;
  rows: { name: string; qty: string; level: string; date: string; note: string; buy: string }[];
}

export function printPages(h: Household, kind: PrintKind, places: string[]): PrintPage[] {
  return h.locations
    .filter((l) => places.includes(l.key))
    .map((l) => {
      const items = h.items
        .filter((i) => i.loc === l.key && (kind === "inventory" || isShopping(i)))
        .sort(kind === "inventory" ? (a, b) => a.name.localeCompare(b.name) : byLevelThenName);
      return {
        place: l.label,
        frozen: l.kind === "freezer",
        rows: items.map((i: Item) => {
          const due = dueDate(i, h);
          const date = isFrozen(i, h) ? (i.frozenOn ? fmtDate(i.frozenOn, true) : "") : due ? fmtDate(due.date, true) : "";
          return { name: i.name, qty: i.qty, level: i.level, date, note: i.note, buy: i.buy?.trim() ?? "" };
        }),
      };
    })
    .filter((p) => p.rows.length > 0);
}
