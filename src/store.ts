import { useSyncExternalStore } from "react";
import { importHousehold } from "./importData";
import type { Household, Item } from "./types";

/**
 * Local store kept in this browser only. Step 2 of the plan swaps this for the
 * shared online database; the rest of the app talks to it through these functions.
 */

const KEY = "ks-household-v1";
let state: Household | null = load();
const listeners = new Set<() => void>();

function load(): Household | null {
  try {
    const s = localStorage.getItem(KEY);
    // Re-read through the importer so lists saved by older versions pick up new fields.
    return s ? importHousehold(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

function commit(next: Household | null) {
  state = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage full or blocked: keep working in memory.
  }
  listeners.forEach((l) => l());
}

export function useHousehold(): Household | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function replaceHousehold(h: Household) {
  commit(h);
}

export type ItemFields = Omit<Item, "id" | "updated" | "by">;

export function saveItem(id: string | null, patch: Partial<ItemFields>) {
  if (!state) return;
  const updated = new Date().toISOString();
  const items = id
    ? state.items.map((i) => (i.id === id ? { ...i, ...patch, updated } : i))
    : [
        ...state.items,
        { name: "", loc: state.locations[0]?.key ?? "pantry", qty: "", level: "full", useBy: "", remindOn: "", frozenOn: "", wrap: "regular", note: "", flags: [], ...patch, id: crypto.randomUUID(), updated } as Item,
      ];
  commit({ ...state, items });
}

export function deleteItem(id: string) {
  if (!state) return;
  commit({ ...state, items: state.items.filter((i) => i.id !== id) });
}

/** The whole household as a downloadable JSON string (backup / move to another device). */
export function exportJson(): string {
  return JSON.stringify(state, null, 1);
}
