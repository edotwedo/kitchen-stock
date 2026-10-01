import { LEVELS, type Flag, type Household, type Item, type Level, type Location } from "./types";

/**
 * Turns an imported JSON file into a Household. Accepts either this app's own
 * export, or the prototype's format ({ household, items } where each item may
 * carry `moms: true` for "contains pork").
 */

// Labels for the prototype's location keys. Anything else uses its key as the label.
const PROTOTYPE_LOCATIONS: Record<string, string> = {
  chest: "Chest freezer",
  kitchen: "Kitchen freezer",
  fridge: "Fridge",
  pantry: "Cupboards",
};

const PORK: Flag = { id: "pork", label: "Contains pork" };

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const date = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : "");

export class ImportError extends Error {}

export function importHousehold(raw: unknown): Household {
  if (!raw || typeof raw !== "object") throw new ImportError("That file isn't a kitchen list.");
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.items)) throw new ImportError("That file has no items in it.");

  const flags: Flag[] = Array.isArray(r.flags)
    ? r.flags.filter((f) => f && str(f.id)).map((f) => ({ id: str(f.id), label: str(f.label) || str(f.id) }))
    : [];

  const seen = new Set<string>();
  const items: Item[] = [];
  for (const x of r.items as Record<string, unknown>[]) {
    const name = str(x?.name).trim();
    if (!name) continue;
    let id = str(x.id) || crypto.randomUUID();
    if (seen.has(id)) id = crypto.randomUUID();
    seen.add(id);

    const itemFlags = Array.isArray(x.flags) ? x.flags.map(str).filter(Boolean) : [];
    if (x.moms === true && !itemFlags.includes(PORK.id)) itemFlags.push(PORK.id);

    items.push({
      id,
      name,
      loc: str(x.loc) || "pantry",
      qty: str(x.qty),
      level: (LEVELS as readonly string[]).includes(str(x.level)) ? (x.level as Level) : "full",
      useBy: date(x.useBy),
      remindOn: date(x.remindOn),
      note: str(x.note),
      flags: itemFlags,
      updated: str(x.updated) || new Date().toISOString(),
      by: str(x.by) || undefined,
    });
  }

  if (items.some((i) => i.flags.includes(PORK.id)) && !flags.some((f) => f.id === PORK.id)) flags.push(PORK);

  let locations: Location[] = Array.isArray(r.locations)
    ? r.locations.filter((l) => l && str(l.key)).map((l) => ({ key: str(l.key), label: str(l.label) || str(l.key) }))
    : [];
  if (!locations.length) {
    const keys = [...new Set(items.map((i) => i.loc))];
    const order = Object.keys(PROTOTYPE_LOCATIONS);
    keys.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    locations = keys.map((k) => ({ key: k, label: PROTOTYPE_LOCATIONS[k] ?? k }));
  }

  const people = Array.isArray(r.people)
    ? r.people
        .filter((p) => p && str(p.name))
        .map((p) => ({ id: str(p.id) || crypto.randomUUID(), name: str(p.name), avoids: Array.isArray(p.avoids) ? p.avoids.map(str) : [] }))
    : [];

  return { name: str(r.household) || str(r.name) || "My kitchen", locations, flags, people, items };
}
