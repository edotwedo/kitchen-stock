export const LEVELS = ["full", "half", "low", "out"] as const;
export type Level = (typeof LEVELS)[number];

/** A place in the kitchen. Each household defines its own. */
export interface Location {
  key: string;
  label: string;
}

/** Something an item can contain that some people avoid (pork, gluten, peanuts…). */
export interface Flag {
  id: string;
  label: string;
}

/** A household member and the flags they avoid. */
export interface Person {
  id: string;
  name: string;
  avoids: string[];
}

export interface Item {
  id: string;
  name: string;
  loc: string;
  qty: string;
  level: Level;
  useBy: string; // YYYY-MM-DD or ""
  remindOn: string; // YYYY-MM-DD or ""
  note: string;
  flags: string[];
  updated: string; // ISO timestamp
  by?: string;
}

export interface Household {
  name: string;
  locations: Location[];
  flags: Flag[];
  people: Person[];
  items: Item[];
}
