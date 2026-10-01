import { nameKey } from "./merge";
import type { Household, Item } from "./types";

/** Items already in the kitchen whose names match what's being typed, one per name, newest first. */
export function pastMatches(h: Household, typed: string, limit = 4): Item[] {
  const q = nameKey(typed);
  if (q.length < 2) return [];
  const seen = new Set<string>();
  const words = q.split(" ");
  return [...h.items]
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))
    .filter((i) => {
      const k = nameKey(i.name);
      if (seen.has(k) || k === q || !words.every((w) => k.split(" ").some((x) => x.startsWith(w)))) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

/** The same thing already logged in the same place (so adding it again would make a duplicate). */
export function alreadyHave(h: Household, name: string, loc: string): Item | null {
  const k = nameKey(name);
  if (!k) return null;
  return h.items.find((i) => i.loc === loc && nameKey(i.name) === k) ?? null;
}
