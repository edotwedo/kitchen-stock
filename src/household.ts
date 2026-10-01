import type { Household, LocationKind, Person, Wrap } from "./types";

/**
 * Household settings changes. Each takes a household and returns a new one, so
 * they can be tested without a screen and applied with updateHousehold().
 */

/** Common things households avoid. Offered as one-tap suggestions in settings. */
export const SUGGESTED_FLAGS = ["Pork", "Beef", "Shellfish", "Fish", "Alcohol", "Gluten", "Dairy", "Eggs", "Peanuts", "Tree nuts", "Soy", "Sesame"];

export function slug(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
}

function uniqueId(base: string, taken: string[]): string {
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

// ---------- people ----------

export const addPerson = (name: string) => (h: Household): Household => ({
  ...h,
  people: [...h.people, { id: crypto.randomUUID(), name: name.trim(), avoids: [] }],
});

export const updatePerson = (id: string, patch: Partial<Omit<Person, "id">>) => (h: Household): Household => ({
  ...h,
  people: h.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
});

export const removePerson = (id: string) => (h: Household): Household => ({
  ...h,
  people: h.people.filter((p) => p.id !== id),
});

// ---------- dietary flags ----------

export const addFlag = (label: string) => (h: Household): Household => {
  const clean = label.trim();
  if (!clean || h.flags.some((f) => f.label.toLowerCase() === clean.toLowerCase())) return h;
  const id = uniqueId(slug(clean), h.flags.map((f) => f.id));
  return { ...h, flags: [...h.flags, { id, label: clean }] };
};

export const renameFlag = (id: string, label: string) => (h: Household): Household => ({
  ...h,
  flags: h.flags.map((f) => (f.id === id ? { ...f, label } : f)),
});

/** Removing a flag also takes it off every item and every person's rules. */
export const removeFlag = (id: string) => (h: Household): Household => ({
  ...h,
  flags: h.flags.filter((f) => f.id !== id),
  people: h.people.map((p) => ({ ...p, avoids: p.avoids.filter((a) => a !== id) })),
  items: h.items.map((i) => (i.flags.includes(id) ? { ...i, flags: i.flags.filter((f) => f !== id) } : i)),
});

// ---------- places ----------

export const addLocation = (label: string, kind: LocationKind) => (h: Household): Household => {
  const clean = label.trim();
  if (!clean) return h;
  const key = uniqueId(slug(clean), h.locations.map((l) => l.key));
  return { ...h, locations: [...h.locations, { key, label: clean, kind }] };
};

export const updateLocation = (key: string, patch: { label?: string; kind?: LocationKind }) => (h: Household): Household => ({
  ...h,
  locations: h.locations.map((l) => (l.key === key ? { ...l, ...patch } : l)),
});

/** Only empty places can be removed, so no item is ever left with nowhere to live. */
export const removeLocation = (key: string) => (h: Household): Household =>
  h.items.some((i) => i.loc === key) ? h : { ...h, locations: h.locations.filter((l) => l.key !== key) };

export const moveLocation = (key: string, by: -1 | 1) => (h: Household): Household => {
  const from = h.locations.findIndex((l) => l.key === key);
  const to = from + by;
  if (from < 0 || to < 0 || to >= h.locations.length) return h;
  const locations = [...h.locations];
  [locations[from], locations[to]] = [locations[to], locations[from]];
  return { ...h, locations };
};

// ---------- freezer clock and name ----------

export const setFreezerDays = (wrap: Wrap, days: number) => (h: Household): Household =>
  days > 0 ? { ...h, freezerDays: { ...h.freezerDays, [wrap]: Math.round(days) } } : h;

export const renameHousehold = (name: string) => (h: Household): Household => ({ ...h, name });
