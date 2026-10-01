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
  });
});
