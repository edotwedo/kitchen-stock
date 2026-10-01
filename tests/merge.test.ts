import { describe, expect, it } from "vitest";
import { importHousehold } from "../src/importData";
import { mergeList, nameKey } from "../src/merge";

const kitchen = () =>
  importHousehold({
    locations: [
      { key: "fridge", label: "Fridge", kind: "fridge" },
      { key: "chest", label: "Chest freezer", kind: "freezer" },
    ],
    flags: [{ id: "pork", label: "Pork" }],
    items: [
      { id: "a", name: "Ground beef", loc: "chest", qty: "2 lb", frozenOn: "2026-09-30" },
      { id: "b", name: "Eggs", loc: "fridge", qty: "1 dozen", level: "low", note: "Brown" },
    ],
  });

describe("adding from a list file", () => {
  it("matches names loosely", () => {
    expect(nameKey("Bread & Butter Chips")).toBe(nameKey("bread and butter chip"));
    expect(nameKey("Eggs")).toBe(nameKey("egg"));
    expect(nameKey("Swiss Miss")).not.toBe(nameKey("Swiss Mis"));
  });

  it("updates what's already there and adds the rest, keeping what the file doesn't say", () => {
    const { household: h, added, updated } = mergeList(kitchen(), {
      items: [
        { name: "eggs", loc: "fridge", qty: "18", level: "full" },
        { name: "Bacon", loc: "fridge", qty: "1 lb", flags: ["pork"] },
      ],
    });
    expect([added, updated]).toEqual([1, 1]);
    const eggs = h.items.find((i) => i.id === "b")!;
    expect(eggs).toMatchObject({ name: "Eggs", qty: "18", level: "full", note: "Brown" });
    expect(h.items.find((i) => i.name === "Bacon")).toMatchObject({ loc: "fridge", flags: ["pork"] });
    expect(h.items).toHaveLength(3);
  });

  it("adds places and flags the file brings, matching existing ones by name", () => {
    const { household: h } = mergeList(kitchen(), {
      locations: [{ key: "garage", label: "Garage freezer" }, { key: "fridge2", label: "fridge" }],
      flags: [{ id: "gl", label: "Gluten" }, { id: "p", label: "pork" }],
      items: [
        { name: "Elk steaks", loc: "garage", flags: ["p"] },
        { name: "Bread", loc: "fridge2", flags: ["gl"] },
      ],
    });
    expect(h.locations.map((l) => l.label)).toEqual(["Fridge", "Chest freezer", "Garage freezer"]);
    expect(h.locations[2].kind).toBe("freezer");
    expect(h.flags.map((f) => f.label)).toEqual(["Pork", "Gluten"]);
    expect(h.items.find((i) => i.name === "Elk steaks")).toMatchObject({ loc: "garage-freezer", flags: ["pork"] });
    expect(h.items.find((i) => i.name === "Bread")).toMatchObject({ loc: "fridge", flags: ["gluten"] });
  });

  it("never reuses an id that's already taken", () => {
    const { household: h } = mergeList(kitchen(), { items: [{ id: "a", name: "Butter", loc: "fridge" }] });
    expect(h.items.filter((i) => i.id === "a")).toHaveLength(1);
    expect(h.items).toHaveLength(3);
  });
});

describe("a /intake list file", () => {
  it("loads into a new kitchen with the count date as the freezer clock start", () => {
    const empty = importHousehold({ locations: [{ key: "fridge", label: "Fridge", kind: "fridge" }], items: [] });
    const file = {
      household: "Smith kitchen",
      counted: "2026-10-04",
      locations: [{ key: "chest-freezer", label: "Chest freezer", kind: "freezer" }],
      flags: [{ id: "pork", label: "Pork" }, { id: "beef", label: "Beef" }],
      items: [
        { name: "Ground beef", loc: "chest-freezer", qty: "2 lb", level: "full", wrap: "vacuum", flags: ["beef"] },
        { name: "Bacon", loc: "chest-freezer", qty: "1 lb", flags: ["pork"], note: "Opened" },
        { name: "Milk", loc: "fridge", level: "half", useBy: "2026-10-09" },
      ],
    };
    const { household: h, added } = mergeList(empty, file);
    expect(added).toBe(3);
    expect(h.locations.map((l) => `${l.label}:${l.kind}`)).toEqual(["Fridge:fridge", "Chest freezer:freezer"]);
    expect(h.items.find((i) => i.name === "Ground beef")).toMatchObject({ frozenOn: "2026-10-04", wrap: "vacuum", flags: ["beef"] });
    expect(h.items.find((i) => i.name === "Milk")).toMatchObject({ loc: "fridge", useBy: "2026-10-09", frozenOn: "" });
  });
});

describe("places the file doesn't describe", () => {
  it("adds them instead of hiding the items", () => {
    const { household: h } = mergeList(kitchen(), { locations: [{ key: "fridge", label: "Fridge" }], items: [{ name: "Venison", loc: "garage-freezer" }] });
    const loc = h.locations.find((l) => l.label === "Garage freezer");
    expect(loc?.kind).toBe("freezer");
    expect(h.items.find((i) => i.name === "Venison")?.loc).toBe(loc?.key);
  });
});
