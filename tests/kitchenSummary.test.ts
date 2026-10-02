import { describe, expect, it } from "vitest";
import { byUrgency, countedText, rulesFrom, summarize, summarizeAll, type SummaryRow } from "../src/kitchenSummary";

const today = new Date(2026, 9, 2); // Oct 2, 2026

const settings = {
  locations: [
    { key: "fridge", label: "Fridge", kind: "fridge", counted: "2026-09-20" },
    { key: "freezer", label: "Freezer", kind: "freezer", counted: "2026-09-01" },
    { key: "pantry", label: "Pantry", kind: "pantry", counted: "2026-09-25" },
  ],
  freezerDays: { regular: 90, vacuum: 365, chamber: 730 },
};

const row = (household_id: string, loc: string, level: string, use_by: string | null = null, frozen_on: string | null = null, wrap = "regular"): SummaryRow => ({
  household_id, loc, level, use_by, frozen_on, wrap,
});

describe("kitchen summary", () => {
  it("counts use first and shopping by the app's own rules", () => {
    const rows = [
      row("a", "fridge", "full", "2026-10-05"), // due in 3 days: use first
      row("a", "fridge", "half", "2026-09-28"), // past: use first
      row("a", "fridge", "full", "2026-10-20"), // weeks away
      row("a", "pantry", "low"), // shopping
      row("a", "pantry", "out", "2026-10-03"), // out: shopping, never use first
    ];
    const s = summarizeAll([{ id: "a", settings }], rows, today).get("a")!;
    expect(s).toMatchObject({ items: 5, useFirst: 2, shopping: 2 });
  });

  it("uses the freezer clock for frozen food, not the printed date", () => {
    const rows = [
      row("a", "freezer", "full", "2026-09-01", "2026-07-01"), // printed date long gone, but frozen Jul 1 + 90 = Sep 29: use first
      row("a", "freezer", "full", "2026-09-01", "2026-09-20"), // printed date past, frozen recently: fine
      row("a", "freezer", "full", null, "2025-10-05", "vacuum"), // vacuum: 365 days, due Oct 5: use first
      row("a", "freezer", "full", null, "2025-10-05", "chamber"), // chamber: 730 days: fine
      row("a", "freezer", "full", "2026-09-01", null), // no frozen-on day: no clock
    ];
    expect(summarizeAll([{ id: "a", settings }], rows, today).get("a")!.useFirst).toBe(2);
  });

  it("leaves out-of-stock food out of use first, even in the freezer", () => {
    const rows = [row("a", "freezer", "out", null, "2026-06-01"), row("a", "fridge", "out", "2026-09-30")];
    const s = summarizeAll([{ id: "a", settings }], rows, today).get("a")!;
    expect(s.useFirst).toBe(0);
    expect(s.shopping).toBe(2);
  });

  it("follows each kitchen's own freezer days", () => {
    const longer = { ...settings, freezerDays: { regular: 180, vacuum: 365, chamber: 730 } };
    const rows = [row("a", "freezer", "full", null, "2026-07-01"), row("b", "freezer", "full", null, "2026-07-01")];
    const all = summarizeAll([{ id: "a", settings }, { id: "b", settings: longer }], rows, today);
    expect(all.get("a")!.useFirst).toBe(1);
    expect(all.get("b")!.useFirst).toBe(0);
  });

  it("finds the place counted longest ago, and never counted beats any date", () => {
    const s = summarize(rulesFrom(settings), [], today);
    expect(s.oldestCount).toEqual({ label: "Freezer", date: "2026-09-01" });
    expect(countedText(s, today)).toBe("Freezer last counted 4 weeks ago");

    const withNew = rulesFrom({ ...settings, locations: [...settings.locations, { key: "bar", label: "Bar cart", kind: "other" }] });
    const s2 = summarize(withNew, [], today);
    expect(s2.oldestCount).toEqual({ label: "Bar cart", date: null });
    expect(countedText(s2, today)).toBe("Bar cart never counted");
  });

  it("copes with a kitchen that has no items or no settings yet", () => {
    const all = summarizeAll([{ id: "empty", settings: null }], [row("other", "fridge", "low")], today);
    expect(all.get("empty")).toEqual({ items: 0, useFirst: 0, shopping: 0, oldestCount: null });
    expect(all.has("other")).toBe(false);
    expect(countedText(all.get("empty")!, today)).toBe("No places set up");
  });

  it("sorts the busiest kitchens first, then by name", () => {
    const sum = (useFirst: number) => ({ items: 1, useFirst, shopping: 0, oldestCount: null });
    const list = [
      { name: "Brown", summary: sum(1) },
      { name: "Adams", summary: sum(1) },
      { name: "Cole", summary: null },
      { name: "Diaz", summary: sum(4) },
      { name: "Evans", summary: sum(0) },
    ];
    expect(list.sort(byUrgency).map((k) => k.name)).toEqual(["Diaz", "Adams", "Brown", "Evans", "Cole"]);
  });
});
