import { describe, expect, it } from "vitest";
import { buildCookPrompt } from "../src/cook";
import { importHousehold } from "../src/importData";

const today = new Date("2026-10-01T12:00:00");
const h = importHousehold({
  counted: "2026-09-30",
  flags: [{ id: "pork", label: "Pork" }, { id: "added-sugar", label: "Added sugar" }],
  people: [
    { id: "a", name: "Sam", avoids: ["pork"], limits: [] },
    { id: "b", name: "Alex", avoids: [], limits: ["added-sugar"] },
  ],
  items: [
    { id: "1", name: "Sour cream", loc: "fridge", qty: "16 oz", useBy: "2026-10-03" },
    { id: "2", name: "Breakfast burritos", loc: "kitchen", flags: ["pork"] },
    { id: "3", name: "Ground beef", loc: "chest", qty: "2 lb" },
    { id: "4", name: "Ketchup", loc: "fridge", level: "low", flags: ["added-sugar"] },
    { id: "5", name: "Rice", loc: "pantry", level: "out" },
    { id: "6", name: "Blue cheese", loc: "fridge", useBy: "2026-08-16", note: "Expired, toss" },
    { id: "7", name: "Fried rice bags", loc: "kitchen", note: "A year past best-by" },
  ],
});

describe("what can I cook", () => {
  it("leads with use-first items, leaves out what an eater avoids, and states the rules", () => {
    const p = buildCookPrompt(h, ["a", "b"], "dinner", today);
    expect(p).toContain("Suggest 3 dinners I can make for 2 people (Sam, Alex)");
    expect(p).toMatch(/Use these first:\n- Sour cream \(16 oz, Fridge, use by Oct 3, 2026\)/);
    expect(p).toContain("- No pork at all (Sam can't have it).");
    expect(p).toContain("- Go easy on added sugar (Alex is limiting it).");
    expect(p).not.toContain("Breakfast burritos");
    expect(p).not.toContain("Rice"); // out of stock
    expect(p).toContain("- Ketchup (low left, Fridge)");
    expect(p).toContain("- Ground beef (2 lb, Chest freezer, frozen, best by Dec 29, 2026)");
  });

  it("never suggests food past its use-by date, but keeps frozen food past its quality date", () => {
    const later = new Date("2027-01-15T12:00:00"); // freezer clock (Dec 29) has run out
    const p = buildCookPrompt(h, ["a", "b"], "any", later);
    expect(p).not.toContain("Blue cheese");
    expect(p).not.toContain("Sour cream"); // its date passed too by then
    expect(p).toContain("(I've left out 2 items past their use-by date.)");
    expect(p).toContain("Ground beef (2 lb, Chest freezer, frozen, best by Dec 29, 2026)");
    expect(p).toContain("Fried rice bags");
  });

  it("keeps pork items when nobody eating avoids it", () => {
    const p = buildCookPrompt(h, ["b"], "any", today);
    expect(p).toContain("Breakfast burritos");
    expect(p).not.toContain("No pork");
    expect(p).toContain("for 1 person (Alex)");
  });
});
