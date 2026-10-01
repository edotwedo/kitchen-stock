import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { importHousehold } from "./importData";
import type { Household, Item } from "./types";

/**
 * The connection to the shared online database (Supabase). When the app is built
 * without its address and key, `supabase` is null and the app keeps everything
 * on this device only.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

// ---------- rows <-> app objects ----------

export interface ItemRow {
  household_id: string;
  id: string;
  name: string;
  loc: string;
  qty: string;
  level: string;
  use_by: string | null;
  remind_on: string | null;
  frozen_on: string | null;
  wrap: string;
  note: string;
  flags: string[];
  updated_at?: string;
  updated_by?: string | null;
}

export interface HouseholdRow {
  id: string;
  name: string;
  settings: Record<string, unknown>;
}

export function toRow(householdId: string, i: Item): ItemRow {
  return {
    household_id: householdId,
    id: i.id,
    name: i.name,
    loc: i.loc,
    qty: i.qty,
    level: i.level,
    use_by: i.useBy || null,
    remind_on: i.remindOn || null,
    frozen_on: i.frozenOn || null,
    wrap: i.wrap,
    note: i.note,
    flags: i.flags,
  };
}

export function fromRow(r: ItemRow): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    loc: r.loc,
    qty: r.qty,
    level: r.level,
    useBy: r.use_by ?? "",
    remindOn: r.remind_on ?? "",
    frozenOn: r.frozen_on ?? "",
    wrap: r.wrap,
    note: r.note,
    flags: r.flags,
    updated: r.updated_at,
    by: r.updated_by ?? undefined,
  };
}

/** The settings column holds everything about a household except its name and items. */
export function settingsOf(h: Household): Record<string, unknown> {
  return { locations: h.locations, flags: h.flags, people: h.people, freezerDays: h.freezerDays };
}

/** Build the app's household from its row and item rows (run through the importer to fill defaults). */
export function householdFrom(row: HouseholdRow, items: ItemRow[]): Household {
  return importHousehold({ ...row.settings, name: row.name, items: items.map(fromRow) });
}

/** What changed between two versions of a household, as database writes. */
export function diff(before: Household, after: Household) {
  const was = new Map(before.items.map((i) => [i.id, i]));
  const now = new Set(after.items.map((i) => i.id));
  return {
    settingsChanged: before.name !== after.name || JSON.stringify(settingsOf(before)) !== JSON.stringify(settingsOf(after)),
    upserts: after.items.filter((i) => was.get(i.id) !== i),
    deletes: before.items.filter((i) => !now.has(i.id)).map((i) => i.id),
  };
}
