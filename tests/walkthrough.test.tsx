// @vitest-environment jsdom
import axe from "axe-core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { sampleKitchen } from "../src/demo";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("walk-through count", () => {
  it("goes spot by spot, saves each tap, and undoes the whole count at once", async () => {
    const start = sampleKitchen();
    localStorage.setItem("ks-household-v1", JSON.stringify(start));
    localStorage.setItem("ks-tab", "loc:fridge");
    const { default: App } = await import("../src/App");
    const root = document.createElement("div");
    document.body.append(root);
    await act(async () => createRoot(root).render(<App />));
    const click = async (el: Element | null | undefined) => act(async () => (el as HTMLElement).click());
    const name = () => document.querySelector(".walk-name")!.firstChild!.textContent;
    const level = (n: string) => JSON.parse(localStorage.getItem("ks-household-v1")!).items.find((i: { name: string }) => i.name === n).level;

    const bar = [...document.querySelectorAll(".cookbar")].find((b) => b.textContent!.includes("Counting the fridge"));
    await click(bar!.querySelector("button"));
    // Walking order: Crisper, Door, Door, Top shelf, Top shelf, then items with no spot.
    expect(document.querySelector(".walk-spot")!.textContent).toBe("Crisper");
    expect(name()).toBe("Baby spinach");
    const a11y = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } }, resultTypes: ["violations"] });
    expect(a11y.violations.map((v) => v.id)).toEqual([]);
    await click(document.querySelector('.lvl.low'));
    expect(level("Baby spinach")).toBe("low");
    expect(document.querySelector(".walk-spot")!.textContent).toBe("Door");

    // Same as before moves on without a change.
    const keep = document.querySelector('.walk-levels [aria-pressed="true"]');
    await click(keep);
    await click(document.querySelector('.lvl.out'));
    expect(document.querySelector(".hint")!.textContent).toBe("4 of 9");

    await click([...document.querySelectorAll(".walk .btn")].find((b) => b.textContent === "Stop here"));
    expect(document.querySelector(".walk")).toBeNull();
    const toast = document.querySelector(".toast")!;
    expect(toast.textContent).toContain("2 items changed");
    await click(toast.querySelector("button"));
    expect(level("Baby spinach")).toBe(start.items.find((i) => i.name === "Baby spinach")!.level);

    // Stopping early doesn't count as a full count; going all the way through does.
    expect(bar!.textContent).toContain("Go spot by spot");
    await click(bar!.querySelector("button"));
    for (let n = 0; n < 9; n++) await click(document.querySelector('.walk-levels [aria-pressed="true"]'));
    expect(document.querySelector(".walk-done")!.textContent).toContain("Nothing changed");
    await click([...document.querySelectorAll(".walk .btn")].find((b) => b.textContent === "Print summary"));
    expect(document.querySelector(".count-report h1")!.textContent).toBe("Fridge: what changed");
    expect(document.querySelector(".count-report .count-line")!.textContent).toContain("9 items counted, nothing changed.");
    await click([...document.querySelectorAll(".printview .btn")].find((b) => b.textContent === "Close"));
    expect(document.querySelector(".count-report")).toBeNull();
    await click([...document.querySelectorAll(".walk .btn")].find((b) => b.textContent === "Done"));
    const bar2 = [...document.querySelectorAll(".cookbar")].find((b) => b.textContent!.includes("Counting the fridge"));
    expect(bar2!.textContent).toContain("Last counted today.");
  });
});

describe("last counted", () => {
  it("words the gap plainly", async () => {
    const { agoText } = await import("../src/format");
    const today = new Date("2026-10-20T09:00:00");
    expect(agoText("2026-10-20", today)).toBe("today");
    expect(agoText("2026-10-19", today)).toBe("yesterday");
    expect(agoText("2026-10-15", today)).toBe("5 days ago");
    expect(agoText("2026-09-29", today)).toBe("3 weeks ago");
    expect(agoText("2026-06-20", today)).toBe("4 months ago");
  });

  it("is saved only when a count goes all the way through, and survives a backup file", async () => {
    const { markCounted } = await import("../src/household");
    const { importHousehold } = await import("../src/importData");
    const h = markCounted("freezer", "2026-10-01")(sampleKitchen());
    expect(h.locations.find((l) => l.key === "freezer")!.counted).toBe("2026-10-01");
    expect(importHousehold(JSON.parse(JSON.stringify(h))).locations.find((l) => l.key === "freezer")!.counted).toBe("2026-10-01");
  });
});

describe("count summary", () => {
  it("groups changes the way a client reads them", async () => {
    const { countSummary } = await import("../src/CountReport");
    const h0 = sampleKitchen();
    const by = (n: string) => h0.items.find((i) => i.name === n)!;
    const set = (n: string, level: "full" | "half" | "low" | "out") => ({ ...by(n), level });
    // After the count: milk ran out, eggs got low, ketchup was restocked, spinach used some, yogurt unchanged.
    const after = { ...h0, items: h0.items.map((i) => ({ Milk: set("Milk", "out"), Eggs: set("Eggs", "low"), Ketchup: set("Ketchup", "full"), "Baby spinach": set("Baby spinach", "half") } as Record<string, typeof i>)[i.name] ?? i) };
    const s = countSummary(after, "fridge", [by("Milk"), by("Eggs"), by("Ketchup"), by("Baby spinach"), by("Greek yogurt")], 9);
    expect(s.place).toBe("Fridge");
    expect(s.ranOut.map((c) => c.name)).toEqual(["Milk"]);
    expect(s.gotLow.map((c) => `${c.name}:${c.was}>${c.now}`)).toEqual(["Eggs:half>low"]);
    expect(s.wentUp.map((c) => `${c.name}:${c.was}>${c.now}`)).toEqual(["Ketchup:low>full"]);
    expect(s.other.map((c) => c.name)).toEqual(["Baby spinach"]);
    expect(s.shopping).toBe(after.items.filter((i) => i.level === "low" || i.level === "out").length);
  });
});
