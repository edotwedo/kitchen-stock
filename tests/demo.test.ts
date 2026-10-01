import { describe, expect, it } from "vitest";
import { sampleKitchen } from "../src/demo";
import { isShopping, isUseFirst } from "../src/logic";

describe("sample kitchen", () => {
  const today = new Date("2026-10-01T12:00:00");
  const h = sampleKitchen(today);

  it("always has something to show on Use first and Shopping, whatever the date", () => {
    expect(h.items.filter((i) => isUseFirst(i, h, today)).length).toBeGreaterThanOrEqual(4);
    expect(h.items.filter(isShopping).length).toBeGreaterThanOrEqual(4);
    const later = new Date("2027-06-15T12:00:00");
    const h2 = sampleKitchen(later);
    expect(h2.items.filter((i) => isUseFirst(i, h2, later)).length).toBe(h.items.filter((i) => isUseFirst(i, h, today)).length);
  });

  it("shows off people's rules and the freezer clock", () => {
    expect(h.people.some((p) => p.avoids.length) && h.people.some((p) => p.limits.length)).toBe(true);
    expect(h.items.some((i) => i.loc === "freezer" && i.wrap === "vacuum")).toBe(true);
    expect(new Set(h.items.map((i) => i.id)).size).toBe(h.items.length);
  });
});
