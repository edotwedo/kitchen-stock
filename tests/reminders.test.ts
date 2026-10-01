import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localClock, localDate, morningNotice, shoppingNotice, type ReminderItem, type ReminderKitchen } from "../supabase/functions/_shared/reminders";
import { toRow } from "../src/cloud";
import { importHousehold } from "../src/importData";

const kitchen: ReminderKitchen = {
  name: "Test kitchen",
  settings: { locations: [{ key: "fridge", label: "Fridge", kind: "fridge" }, { key: "chest", label: "Chest freezer", kind: "freezer" }] },
};
const item = (name: string, extra: Partial<ReminderItem> = {}): ReminderItem => ({ name, loc: "fridge", level: "full", use_by: null, remind_on: null, frozen_on: null, wrap: "regular", ...extra });

describe("morning notification", () => {
  it("rolls everything into one notice", () => {
    const n = morningNotice(
      kitchen,
      [
        item("Milk", { use_by: "2026-10-03" }), // 2 days
        item("Yogurt", { use_by: "2026-10-01" }), // today
        item("Sour cream", { use_by: "2026-09-30" }), // yesterday
        item("Old salsa", { use_by: "2026-09-01" }), // long past: stop nagging
        item("Cheese", { use_by: "2026-10-10" }), // not yet
        item("Ground beef", { loc: "chest", frozen_on: "2026-07-10" }), // 90-day clock: 7 days left today
        item("Steak", { loc: "chest", frozen_on: "2026-07-10", wrap: "vacuum" }), // a year: fine
        item("Call butcher", { remind_on: "2026-10-01" }),
        item("Empty jar", { use_by: "2026-10-02", level: "out" }),
      ],
      "2026-10-01",
    )!;
    expect(n.title).toBe("Test kitchen: 5 things to check");
    expect(n.body).toBe(["Past date: Sour cream", "Use soon: Milk, Yogurt", "Freezer, best within a week: Ground beef", "Reminder: Call butcher"].join("\n"));
    expect(n.tab).toBe("first");
  });

  it("stays quiet when nothing needs attention", () => {
    expect(morningNotice(kitchen, [item("Cheese", { use_by: "2026-10-20" })], "2026-10-01")).toBe(null);
  });

  it("shortens long lists", () => {
    const many = ["A", "B", "C", "D", "E", "F"].map((n) => item(n, { use_by: "2026-10-02" }));
    expect(morningNotice(kitchen, many, "2026-10-01")!.body).toBe("Use soon: A, B, C, D and 2 more");
  });
});

describe("clock", () => {
  it("works out Tacoma's date, hour and weekday from a UTC instant", () => {
    const at = new Date("2026-10-03T16:00:00Z"); // 9am Saturday in Tacoma (PDT)
    expect(localDate(at, "America/Los_Angeles")).toBe("2026-10-03");
    expect(localClock(at, "America/Los_Angeles")).toEqual({ hour: 9, weekday: 6 });
    expect(localDate(new Date("2026-10-03T05:30:00Z"), "America/Los_Angeles")).toBe("2026-10-02"); // still Friday night
  });
});

const SEED = `${process.cwd()}/kitchen-seed-data.json`;
describe.skipIf(!existsSync(SEED))("on the real list", () => {
  const h = importHousehold(JSON.parse(readFileSync(SEED, "utf8")));
  const rows = h.items.map((i) => toRow("hh", i));
  const k: ReminderKitchen = { name: h.name, settings: { locations: h.locations, freezerDays: h.freezerDays } };

  it("Saturday's shopping list has the 25 low items", () => {
    const n = shoppingNotice(k, rows)!;
    expect(n.count).toBe(25);
    expect(n.title).toBe(`${h.name}: shopping list (25)`);
    expect(n.body).toMatch(/and 17 more$/);
  });

  it("the freezer clock speaks up once, a week before Dec 29", () => {
    const say = (d: string) => morningNotice(k, rows, d)?.body ?? "";
    expect(say("2026-12-22")).toContain("Freezer, best within a week: ");
    expect(say("2026-12-21")).not.toContain("Freezer");
    expect(say("2026-12-23")).not.toContain("Freezer");
  });
});

describe("recount nudge", () => {
  const items: ReminderItem[] = [{ name: "Milk", loc: "fridge", level: "low", use_by: null, remind_on: null, frozen_on: null, wrap: "regular" }];
  const k = (counted: Record<string, string>): ReminderKitchen => ({
    name: "Home",
    settings: { locations: [{ key: "fridge", label: "Fridge", kind: "fridge", counted: counted.fridge }, { key: "freezer", label: "Chest freezer", kind: "freezer", counted: counted.freezer }] },
  });

  it("adds one line on Saturday for places counted before but not in two weeks", () => {
    const body = shoppingNotice(k({ fridge: "2026-10-01", freezer: "2026-09-10" }), items, "2026-10-10")!.body;
    expect(body).toBe("Milk\nNot counted in a while: Chest freezer");
    expect(shoppingNotice(k({ fridge: "2026-09-26" }), items, "2026-10-10")!.body).toContain("Not counted in a while: Fridge");
  });

  it("never nags about places that were never counted", () => {
    expect(shoppingNotice(k({}), items, "2026-10-10")!.body).toBe("Milk");
  });
});
