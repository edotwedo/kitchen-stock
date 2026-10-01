import { addFlag, addLocation } from "./household";
import { guessKind, importHousehold } from "./importData";
import type { Household, Item } from "./types";

/**
 * Add items from a list file to a kitchen without wiping it: the organizer's photo
 * intake, or a client's restock. An item already in the same place (matched by name,
 * ignoring case, punctuation and a trailing plural "s") is updated instead of added twice.
 */

export interface MergeResult {
  household: Household;
  added: number;
  updated: number;
}

export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

export function mergeList(h: Household, raw: unknown, now = new Date()): MergeResult {
  const incoming = importHousehold(raw);
  let out: Household = h;

  // Places and flags the file uses that this kitchen doesn't have yet, matched by name.
  const locKey = new Map<string, string>();
  for (const l of incoming.locations) {
    const have = out.locations.find((x) => x.key === l.key || x.label.toLowerCase() === l.label.toLowerCase());
    if (have) locKey.set(l.key, have.key);
    else {
      out = addLocation(l.label, l.kind)(out);
      locKey.set(l.key, out.locations[out.locations.length - 1].key);
    }
  }
  const flagId = new Map<string, string>();
  for (const f of incoming.flags) {
    const have = out.flags.find((x) => x.id === f.id || x.label.toLowerCase() === f.label.toLowerCase());
    if (!have) out = addFlag(f.label)(out);
    flagId.set(f.id, (have ?? out.flags[out.flags.length - 1]).id);
  }

  const updatedAt = now.toISOString();
  const items = [...out.items];
  const index = new Map(items.map((i, n) => [`${i.loc}|${nameKey(i.name)}`, n]));
  const ids = new Set(items.map((i) => i.id));
  let added = 0;
  let updated = 0;

  for (const inc of incoming.items) {
    let loc = locKey.get(inc.loc) ?? inc.loc;
    // A place the file uses but never describes, and this kitchen doesn't have: add it,
    // so the item never lands somewhere no list shows.
    if (!out.locations.some((l) => l.key === loc)) {
      const label = inc.loc.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
      out = addLocation(label, guessKind(label))(out);
      loc = out.locations[out.locations.length - 1].key;
      locKey.set(inc.loc, loc);
    }
    const flags = inc.flags.map((f) => flagId.get(f) ?? f);
    const key = `${loc}|${nameKey(inc.name)}`;
    const at = index.get(key);
    if (at !== undefined) {
      const cur = items[at];
      // Only overwrite what the file actually says; keep the rest.
      const next: Item = {
        ...cur,
        qty: inc.qty || cur.qty,
        level: inc.level,
        useBy: inc.useBy || cur.useBy,
        remindOn: inc.remindOn || cur.remindOn,
        frozenOn: inc.frozenOn || cur.frozenOn,
        wrap: inc.wrap !== "regular" ? inc.wrap : cur.wrap,
        note: inc.note || cur.note,
        flags: [...new Set([...cur.flags, ...flags])],
        updated: updatedAt,
      };
      items[at] = next;
      updated++;
    } else {
      const id = ids.has(inc.id) ? crypto.randomUUID() : inc.id;
      ids.add(id);
      items.push({ ...inc, id, loc, flags, updated: updatedAt });
      index.set(key, items.length - 1);
      added++;
    }
  }
  return { household: { ...out, items }, added, updated };
}
