import { importHousehold } from "./importData";
import { agoText } from "./format";
import { isShopping, isUseFirst } from "./logic";
import { LEVELS, WRAPS, type Household, type Item, type Level, type Wrap } from "./types";

/**
 * A one-line picture of a kitchen for the "Your kitchens" overview: how much needs
 * using first, how long the shopping list is, and the place that's gone longest
 * without a full count. Same rules as the app's own Use first and Shopping tabs.
 */

/** Just the item columns the overview reads (one query covers every kitchen). */
export interface SummaryRow {
  household_id: string;
  level: string;
  use_by: string | null;
  frozen_on: string | null;
  wrap: string;
  loc: string;
}

export interface KitchenSummary {
  items: number;
  useFirst: number;
  shopping: number;
  /** The place counted longest ago (never counted beats any date); null when the kitchen has no places. */
  oldestCount: { label: string; date: string | null } | null;
}

type Rules = Pick<Household, "locations" | "freezerDays">;
type Counted = Pick<Item, "loc" | "level" | "useBy" | "frozenOn" | "wrap">;

/** A household row's settings, with the same defaults the app fills in when it opens a kitchen. */
export function rulesFrom(settings: unknown): Rules {
  const s = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const h = importHousehold({ ...s, items: [] });
  return { locations: h.locations, freezerDays: h.freezerDays };
}

/** An item row from the database, trimmed to what Use first and Shopping need. */
export function itemFromRow(r: SummaryRow): Counted {
  return {
    loc: r.loc,
    level: (LEVELS as readonly string[]).includes(r.level) ? (r.level as Level) : "full",
    useBy: r.use_by ?? "",
    frozenOn: r.frozen_on ?? "",
    wrap: (WRAPS as readonly string[]).includes(r.wrap) ? (r.wrap as Wrap) : "regular",
  };
}

export function summarize(rules: Rules, items: Counted[], today: Date): KitchenSummary {
  let useFirst = 0;
  let shopping = 0;
  for (const i of items) {
    if (isUseFirst(i as Item, rules, today)) useFirst++;
    if (isShopping(i as Item)) shopping++;
  }
  let oldestCount: KitchenSummary["oldestCount"] = null;
  for (const l of rules.locations) {
    const date = l.counted || null;
    if (!oldestCount || (oldestCount.date !== null && (date === null || date < oldestCount.date))) oldestCount = { label: l.label, date };
  }
  return { items: items.length, useFirst, shopping, oldestCount };
}

/** Summaries for every kitchen from one batch of household rows and one batch of item rows. */
export function summarizeAll(households: { id: string; settings: unknown }[], rows: SummaryRow[], today: Date): Map<string, KitchenSummary> {
  const byKitchen = new Map<string, Counted[]>();
  for (const r of rows) {
    const list = byKitchen.get(r.household_id);
    if (list) list.push(itemFromRow(r));
    else byKitchen.set(r.household_id, [itemFromRow(r)]);
  }
  return new Map(households.map((h) => [h.id, summarize(rulesFrom(h.settings), byKitchen.get(h.id) ?? [], today)]));
}

/** Most to use first at the top, then A to Z. Kitchens without a summary go last. */
export function byUrgency<T extends { name: string; summary: KitchenSummary | null }>(a: T, b: T): number {
  return (b.summary?.useFirst ?? -1) - (a.summary?.useFirst ?? -1) || a.name.localeCompare(b.name);
}

/** "Pantry never counted", "Fridge last counted 3 weeks ago". */
export function countedText(s: KitchenSummary, today: Date): string {
  const c = s.oldestCount;
  if (!c) return "No places set up";
  return c.date ? `${c.label} last counted ${agoText(c.date, today)}` : `${c.label} never counted`;
}
