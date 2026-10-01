import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importHousehold } from "../src/importData";
import { isShopping, isUseFirst, nextLevel } from "../src/logic";

// The real household seed is private and not in the repo. These tests run
// when it's present locally (kitchen-seed-data.json) and skip otherwise.
const SEED = `${process.cwd()}/kitchen-seed-data.json`;
const COUNTED = new Date("2026-09-30T12:00:00");

describe.skipIf(!existsSync(SEED))("seed data (Sept 30, 2026 count)", () => {
  const h = importHousehold(JSON.parse(readFileSync(SEED, "utf8")));

  it("imports every item", () => {
    expect(h.items).toHaveLength(214);
    expect(new Set(h.items.map((i) => i.id)).size).toBe(214);
  });

  it("keeps the four prototype locations in order", () => {
    expect(h.locations.map((l) => l.key)).toEqual(["chest", "kitchen", "fridge", "pantry"]);
    const per = Object.fromEntries(h.locations.map((l) => [l.key, h.items.filter((i) => i.loc === l.key).length]));
    expect(per).toEqual({ chest: 18, kitchen: 42, fridge: 91, pantry: 63 });
  });

  it("turns the prototype's pork checkbox into a flag", () => {
    expect(h.flags).toEqual([{ id: "pork", label: "Contains pork" }]);
    expect(h.items.filter((i) => i.flags.includes("pork"))).toHaveLength(6);
  });

  it("puts low and out items on the shopping list", () => {
    expect(h.items.filter(isShopping)).toHaveLength(25);
  });

  it("lists items due within a week under Use first", () => {
    expect(h.items.filter((i) => isUseFirst(i, COUNTED))).toHaveLength(15);
  });
});

describe("gauge", () => {
  it("steps full → half → low → out → full", () => {
    expect(["full", "half", "low", "out"].map((l) => nextLevel(l as never))).toEqual(["half", "low", "out", "full"]);
  });
});
