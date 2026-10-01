import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLAG_LIBRARY, findCandidates, mightContain } from "../src/flagLibrary";
import { addFlag, setRule, addPerson, ruleFor, tagItems } from "../src/household";
import { importHousehold } from "../src/importData";

const flag = (label: string) => ({ id: label.toLowerCase(), label });
const item = (name: string, note = "") => ({ name, note });

describe("flag library hints", () => {
  it("catches the less obvious ones", () => {
    expect(mightContain(item("Kikkoman soy sauce jug"), flag("Gluten"))).toBe(true);
    expect(mightContain(item("Keto Pint PB caramel bars"), flag("Peanuts"))).toBe(true);
    expect(mightContain(item("Reser's hot buttered rum"), flag("Alcohol"))).toBe(true);
    expect(mightContain(item("Jumbo star marshmallows"), flag("Gelatin"))).toBe(true);
  });

  it("skips look-alikes", () => {
    expect(mightContain(item("Bread & butter chips"), flag("Milk"))).toBe(false);
    expect(mightContain(item("Bread & butter chips"), flag("Gluten"))).toBe(false);
    expect(mightContain(item("Hillshire turkey smoked sausage"), flag("Pork"))).toBe(false);
    expect(mightContain(item("Smucker's SF strawberry preserves"), flag("Added sugar"))).toBe(false);
    expect(mightContain(item("Marshmallow root tea"), flag("Caffeine"))).toBe(false);
    expect(mightContain(item("Marshmallow root tea"), flag("Gelatin"))).toBe(false);
    expect(mightContain(item("Almond milk"), flag("Milk"))).toBe(false);
    expect(mightContain(item("Hamburger buns"), flag("Pork"))).toBe(false);
  });

  it("uses the name of a custom flag as its search word", () => {
    expect(mightContain(item("Fresh cilantro bunch"), flag("Cilantro"))).toBe(true);
    expect(mightContain(item("Parsley"), flag("Cilantro"))).toBe(false);
  });

  it("has no duplicate labels", () => {
    const labels = FLAG_LIBRARY.map((f) => f.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });
});

const SEED = `${process.cwd()}/kitchen-seed-data.json`;
describe.skipIf(!existsSync(SEED))("flag review on the seed", () => {
  it("finds pork candidates beyond the 6 already tagged, and tagging them sticks", () => {
    let h = importHousehold(JSON.parse(readFileSync(SEED, "utf8")));
    const pork = h.flags.find((f) => f.id === "pork")!;
    const found = findCandidates(h.items, pork).map((i) => i.name);
    expect(found).toContain("Meatballs, vacuum-sealed"); // note says "check for pork"
    expect(found).not.toContain("Hillshire turkey smoked sausage");
    h = tagItems("pork", findCandidates(h.items, pork).map((i) => i.id))(h);
    expect(findCandidates(h.items, pork)).toHaveLength(0);
  });
});

describe("avoid vs limit", () => {
  it("cycles a person's rule for a flag", () => {
    let h = importHousehold({ items: [{ name: "x" }] });
    h = addFlag("Added sugar")(addPerson("Sam")(h));
    const sam = () => h.people[0];
    h = setRule(sam().id, "added-sugar", "avoid")(h);
    expect(ruleFor(sam(), "added-sugar")).toBe("avoid");
    h = setRule(sam().id, "added-sugar", "limit")(h);
    expect([sam().avoids, sam().limits]).toEqual([[], ["added-sugar"]]);
    h = setRule(sam().id, "added-sugar", null)(h);
    expect(ruleFor(sam(), "added-sugar")).toBe(null);
  });
});
