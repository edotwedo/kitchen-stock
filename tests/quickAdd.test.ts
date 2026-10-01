import { describe, expect, it } from "vitest";
import { alreadyHave, pastMatches } from "../src/quickAdd";
import { sampleKitchen } from "../src/demo";
import type { Item } from "../src/types";

const h = sampleKitchen(new Date("2026-10-01T12:00:00"));
const base = h.items[0];
const item = (name: string, loc: string, updated: string): Item => ({ ...base, id: name + loc, name, loc, updated });
const k = { ...h, items: [item("Ground beef", "freezer", "2026-09-01"), item("Ground Beef", "fridge", "2026-09-20"), item("Beef broth", "pantry", "2026-08-01"), item("Eggs", "fridge", "2026-09-30")] };

describe("quick add", () => {
  it("suggests past items by word starts, one per name, newest first", () => {
    const m = pastMatches(k, "beef");
    expect(m.map((i) => i.name)).toEqual(["Ground Beef", "Beef broth"]);
    expect(pastMatches(k, "gr be")[0].loc).toBe("fridge");
    expect(pastMatches(k, "e")).toEqual([]);
    // Once the name is typed in full, there's nothing left to suggest.
    expect(pastMatches(k, "eggs")).toEqual([]);
  });

  it("catches the same thing in the same place, ignoring case and plurals", () => {
    expect(alreadyHave(k, "ground beefs", "freezer")?.id).toBe("Ground beeffreezer");
    expect(alreadyHave(k, "Eggs", "pantry")).toBeNull();
    expect(alreadyHave(k, "  ", "fridge")).toBeNull();
  });
});
