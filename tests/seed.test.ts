import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importHousehold } from "../src/importData";
import { dueDate, isShopping, isUseFirst, nextLevel } from "../src/logic";

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

  it("lists fridge and cupboard items due within a week under Use first", () => {
    expect(h.items.filter((i) => isUseFirst(i, h, COUNTED))).toHaveLength(12);
  });

  it("starts every freezer item's quality clock on the count date", () => {
    const frozen = h.items.filter((i) => i.loc === "chest" || i.loc === "kitchen");
    expect(frozen).toHaveLength(60);
    expect(frozen.every((i) => i.frozenOn === "2026-09-30")).toBe(true);
    expect(h.locations.filter((l) => l.kind === "freezer").map((l) => l.key)).toEqual(["chest", "kitchen"]);
  });

  it("gives regular wrap 90 days and vacuum bags a year", () => {
    const meatballs = h.items.find((i) => i.name === "Meatballs, vacuum-sealed")!;
    expect(meatballs.wrap).toBe("vacuum");
    expect(dueDate(meatballs, h)).toEqual({ date: "2027-09-30", kind: "quality" });
    const roast = h.items.find((i) => i.name === "Angus chuck roast")!;
    expect(dueDate(roast, h)).toEqual({ date: "2026-12-29", kind: "quality" });
    // A printed date on a frozen item no longer makes it overdue.
    expect(isUseFirst(meatballs, h, COUNTED)).toBe(false);
  });

  it("flags freezer items in the last week of their clock", () => {
    const roast = h.items.find((i) => i.name === "Angus chuck roast")!;
    expect(isUseFirst(roast, h, new Date("2026-12-21T12:00:00"))).toBe(false);
    expect(isUseFirst(roast, h, new Date("2026-12-22T12:00:00"))).toBe(true);
  });
});

describe("gauge", () => {
  it("steps full → half → low → out → full", () => {
    expect(["full", "half", "low", "out"].map((l) => nextLevel(l as never))).toEqual(["half", "low", "out", "full"]);
  });
});
