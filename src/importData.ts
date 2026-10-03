import { DEFAULT_FREEZER_DAYS, LEVELS, WRAPS, type Flag, type FreezerDays, type Household, type Item, type Level, type Location, type LocationKind, type Wrap } from "./types";

/**
 * Turns an imported JSON file into a Household. Accepts either this app's own
 * export, or the prototype's format ({ household, items } where each item may
 * carry `moms: true` for "contains pork").
 */

// Labels for the prototype's location keys. Anything else uses its key as the label.
const PROTOTYPE_LOCATIONS: Record<string, { label: string; kind: LocationKind }> = {
  chest: { label: "Chest freezer", kind: "freezer" },
  kitchen: { label: "Kitchen freezer", kind: "freezer" },
  fridge: { label: "Fridge", kind: "fridge" },
  pantry: { label: "Cupboards", kind: "pantry" },
};

export function guessKind(key: string, label = ""): LocationKind {
  const s = (key + " " + label).toLowerCase();
  if (/freez/.test(s)) return "freezer";
  if (/fridge|refrig/.test(s)) return "fridge";
  if (/pantry|cupboard|cabinet|shelf/.test(s)) return "pantry";
  return "other";
}

const PORK: Flag = { id: "pork", label: "Pork" };

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

    const text = (name + " " + str(x.note)).toLowerCase();
    const wrap: Wrap = (WRAPS as readonly string[]).includes(str(x.wrap)) ? (x.wrap as Wrap) : /chamber/.test(text) ? "chamber" : /vacuum|vac-sealed|vac sealed/.test(text) ? "vacuum" : "regular";

    items.push({
      id,
      name,
      loc: str(x.loc) || "pantry",
      qty: str(x.qty),
      level: (LEVELS as readonly string[]).includes(str(x.level)) ? (x.level as Level) : "full",
      useBy: date(x.useBy),
      remindOn: date(x.remindOn),
      frozenOn: date(x.frozenOn),
      wrap,
      note: str(x.note),
      flags: itemFlags,
      ...(str(x.spot).trim() ? { spot: str(x.spot).trim() } : {}),
      ...(str(x.buy).trim() ? { buy: str(x.buy).trim() } : {}),
      ...(/^\d{6,14}$/.test(str(x.upc).trim()) ? { upc: str(x.upc).trim() } : {}),
      updated: str(x.updated) || new Date().toISOString(),
      by: str(x.by) || undefined,
    });
  }

  if (items.some((i) => i.flags.includes(PORK.id)) && !flags.some((f) => f.id === PORK.id)) flags.push(PORK);

  let locations: Location[] = Array.isArray(r.locations)
    ? r.locations.filter((l) => l && str(l.key)).map((l) => {
        const label = str(l.label) || str(l.key);
        const kind = ["freezer", "fridge", "pantry", "other"].includes(str(l.kind)) ? (l.kind as LocationKind) : guessKind(str(l.key), label);
        const spots = Array.isArray(l.spots) ? l.spots.map(str).map((s: string) => s.trim()).filter(Boolean) : [];
        const counted = date(l.counted);
        return { key: str(l.key), label, kind, ...(spots.length ? { spots } : {}), ...(counted ? { counted } : {}) };
      })
    : [];
  if (!locations.length) {
    const keys = [...new Set(items.map((i) => i.loc))];
    const order = Object.keys(PROTOTYPE_LOCATIONS);
    keys.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    locations = keys.map((k) => PROTOTYPE_LOCATIONS[k] ? { key: k, ...PROTOTYPE_LOCATIONS[k] } : { key: k, label: k, kind: guessKind(k, k) });
  }

  // Frozen items with no frozen-on date start their clock on the day the list was counted.
  const counted = date(r.counted);
  if (counted) {
    const freezers = new Set(locations.filter((l) => l.kind === "freezer").map((l) => l.key));
    for (const i of items) if (freezers.has(i.loc) && !i.frozenOn) i.frozenOn = counted;
  }

  const fd = (r.freezerDays ?? {}) as Record<string, unknown>;
  const freezerDays: FreezerDays = { ...DEFAULT_FREEZER_DAYS };
  for (const w of WRAPS) if (typeof fd[w] === "number" && (fd[w] as number) > 0) freezerDays[w] = fd[w] as number;

  const people = Array.isArray(r.people)
    ? r.people
        .filter((p) => p && str(p.name))
        .map((p) => ({ id: str(p.id) || crypto.randomUUID(), name: str(p.name), avoids: Array.isArray(p.avoids) ? p.avoids.map(str) : [], limits: Array.isArray(p.limits) ? p.limits.map(str) : [] }))
    : [];

  return { name: str(r.household) || str(r.name) || "My kitchen", locations, freezerDays, flags, people, items };
}
