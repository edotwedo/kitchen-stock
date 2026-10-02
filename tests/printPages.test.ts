import { describe, expect, it } from "vitest";
import { printPages } from "../src/printPages";
import type { Household, Item } from "../src/types";

const item = (o: Partial<Item>): Item => ({ id: o.name ?? "x", name: "x", loc: "fridge", qty: "", level: "full", useBy: "", remindOn: "", frozenOn: "", wrap: "regular", note: "", flags: [], updated: "", ...o });
const h: Household = {
  name: "Home",
  locations: [
    { key: "fridge", label: "Fridge", kind: "fridge" },
    { key: "freezer", label: "Freezer", kind: "freezer" },
    { key: "pantry", label: "Pantry", kind: "pantry" },
  ],
  freezerDays: { regular: 90, vacuum: 365, chamber: 730 },
  flags: [],
  people: [],
  items: [
    item({ name: "Yogurt", useBy: "2026-10-09", qty: "2 cups" }),
    item({ name: "Butter", level: "low", note: "salted" }),
    item({ name: "Eggs", level: "out" }),
    item({ name: "Chuck roast", loc: "freezer", frozenOn: "2026-09-30", useBy: "2026-10-03" }),
  ],
};
const all = h.locations.map((l) => l.key);

describe("print sheets (no seed file needed)", () => {
  it("inventory: one page per place with items, A to Z, use-by in the fridge and frozen-on in the freezer", () => {
    const pages = printPages(h, "inventory", all);
    expect(pages.map((p) => [p.place, p.frozen, p.rows.map((r) => r.name)])).toEqual([
      ["Fridge", false, ["Butter", "Eggs", "Yogurt"]],
      ["Freezer", true, ["Chuck roast"]],
    ]);
    expect(pages[0].rows[2]).toMatchObject({ qty: "2 cups", date: "Oct 9, 2026" });
    expect(pages[1].rows[0].date).toBe("Sep 30, 2026");
  });

  it("shopping: out first, then low, and only the places asked for", () => {
    expect(printPages(h, "shopping", all).map((p) => p.rows.map((r) => r.name))).toEqual([["Eggs", "Butter"]]);
    expect(printPages(h, "shopping", ["pantry", "freezer"])).toEqual([]);
  });
});
