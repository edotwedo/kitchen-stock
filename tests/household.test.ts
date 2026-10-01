import { describe, expect, it } from "vitest";
import { addFlag, addLocation, addPerson, moveLocation, removeFlag, removeLocation, setFreezerDays, updatePerson } from "../src/household";
import { DEFAULT_FREEZER_DAYS, type Household, type Item } from "../src/types";

const item = (id: string, loc: string, flags: string[] = []): Item => ({
  id, name: id, loc, qty: "", level: "full", useBy: "", remindOn: "", frozenOn: "", wrap: "regular", note: "", flags, updated: "",
});

const base = (): Household => ({
  name: "Test kitchen",
  locations: [
    { key: "fridge", label: "Fridge", kind: "fridge" },
    { key: "pantry", label: "Pantry", kind: "pantry" },
  ],
  freezerDays: { ...DEFAULT_FREEZER_DAYS },
  flags: [],
  people: [],
  items: [item("a", "fridge"), item("b", "fridge")],
});

const apply = (h: Household, ...changes: ((h: Household) => Household)[]) => changes.reduce((acc, c) => c(acc), h);

describe("household settings", () => {
  it("holds any number of people, each with their own rules", () => {
    let h = apply(base(), addFlag("Pork"), addFlag("Peanuts"), addPerson("Sam"), addPerson("Alex"), addPerson("Jordan"), addPerson("Riley"));
    expect(h.people.map((p) => p.name)).toEqual(["Sam", "Alex", "Jordan", "Riley"]);
    h = apply(h, updatePerson(h.people[0].id, { avoids: ["pork"] }), updatePerson(h.people[2].id, { avoids: ["pork", "peanuts"] }));
    expect(h.people.map((p) => p.avoids)).toEqual([["pork"], [], ["pork", "peanuts"], []]);
  });

  it("doesn't add the same flag twice, and keeps ids unique", () => {
    const h = apply(base(), addFlag("Tree nuts"), addFlag("tree nuts"), addFlag("Tree-nuts"));
    expect(h.flags).toEqual([
      { id: "tree-nuts", label: "Tree nuts" },
      { id: "tree-nuts-2", label: "Tree-nuts" },
    ]);
  });

  it("removing a flag clears it from items and people", () => {
    let h = apply(base(), addFlag("Pork"), addPerson("Sam"));
    h = { ...h, items: [item("a", "fridge", ["pork"]), item("b", "fridge")] };
    h = apply(h, updatePerson(h.people[0].id, { avoids: ["pork"] }), removeFlag("pork"));
    expect(h.flags).toEqual([]);
    expect(h.people[0].avoids).toEqual([]);
    expect(h.items[0].flags).toEqual([]);
  });

  it("adds places, reorders them, and only removes empty ones", () => {
    let h = apply(base(), addLocation("Garage freezer", "freezer"));
    expect(h.locations.at(-1)).toEqual({ key: "garage-freezer", label: "Garage freezer", kind: "freezer" });
    h = apply(h, moveLocation("garage-freezer", -1));
    expect(h.locations.map((l) => l.key)).toEqual(["fridge", "garage-freezer", "pantry"]);
    expect(apply(h, removeLocation("fridge")).locations).toHaveLength(3); // has items
    expect(apply(h, removeLocation("pantry")).locations).toHaveLength(2);
  });

  it("only accepts positive freezer day counts", () => {
    const h = apply(base(), setFreezerDays("vacuum", 400), setFreezerDays("chamber", 0));
    expect(h.freezerDays).toEqual({ regular: 90, vacuum: 400, chamber: 730 });
  });
});
