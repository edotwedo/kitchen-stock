import { describe, expect, it } from "vitest";
import { HAS_SEED, seedJson } from "./seedFile";
import { importHousehold } from "../src/importData";
import { printPages } from "../src/printPages";


describe.skipIf(!HAS_SEED)("print sheets from the seed", () => {
  const h = importHousehold(seedJson());
  const all = h.locations.map((l) => l.key);

  it("makes one inventory page per place with every item, A to Z", () => {
    const pages = printPages(h, "inventory", all);
    expect(pages.map((p) => [p.place, p.rows.length])).toEqual([
      ["Chest freezer", 18],
      ["Kitchen freezer", 42],
      ["Fridge", 91],
      ["Cupboards", 63],
    ]);
    const names = pages[0].rows.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(pages[0].frozen).toBe(true);
    expect(pages[0].rows.find((r) => r.name === "Angus chuck roast")?.date).toBe("Sep 30, 2026"); // frozen-on
  });

  it("puts only low and out items on the shopping list, and skips empty places", () => {
    const pages = printPages(h, "shopping", all);
    expect(pages.reduce((n, p) => n + p.rows.length, 0)).toBe(25);
    expect(pages.every((p) => p.rows.every((r) => r.level === "low" || r.level === "out"))).toBe(true);
    expect(printPages(h, "shopping", ["chest"])).toEqual([]); // nothing low in the chest freezer
  });
});
