export const LEVELS = ["full", "half", "low", "out"] as const;
export type Level = (typeof LEVELS)[number];

export type LocationKind = "freezer" | "fridge" | "pantry" | "other";

/** A place in the kitchen. Each household defines its own. */
export interface Location {
  key: string;
  label: string;
  kind: LocationKind;
}

export const WRAPS = ["regular", "vacuum", "chamber"] as const;
export type Wrap = (typeof WRAPS)[number];

export const WRAP_LABELS: Record<Wrap, string> = {
  regular: "Regular",
  vacuum: "Vacuum bag",
  chamber: "Chamber sealed",
};

/** Days a frozen item keeps its best quality, by how it's wrapped. */
export type FreezerDays = Record<Wrap, number>;

export const DEFAULT_FREEZER_DAYS: FreezerDays = { regular: 90, vacuum: 365, chamber: 730 };

/** Something an item can contain that some people avoid (pork, gluten, peanuts…). */
export interface Flag {
  id: string;
  label: string;
}

/** A household member: flags they can't have at all, and flags they should go easy on. */
export interface Person {
  id: string;
  name: string;
  avoids: string[];
  limits: string[];
}

export type Rule = "avoid" | "limit";

export interface Item {
  id: string;
  name: string;
  loc: string;
  qty: string;
  level: Level;
  useBy: string; // YYYY-MM-DD or "" — the printed date (for frozen items it's informational)
  remindOn: string; // YYYY-MM-DD or ""
  frozenOn: string; // YYYY-MM-DD or "" — starts the freezer quality clock
  wrap: Wrap;
  note: string;
  flags: string[];
  spot?: string; // where in the place: "Door", "Top shelf", "Bin 2"; "" once cleared, missing if never set
  updated: string; // ISO timestamp
  by?: string;
}

export interface Household {
  name: string;
  locations: Location[];
  freezerDays: FreezerDays;
  flags: Flag[];
  people: Person[];
  items: Item[];
}
