// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { sampleKitchen } from "../src/demo";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("putting a receipt away", () => {
  it("restocks what you had, adds what's new, and undoes it all at once", async () => {
    const start = sampleKitchen();
    localStorage.setItem("ks-household-v1", JSON.stringify(start));
    localStorage.setItem("ks-tab", "shop");
    const { default: App } = await import("../src/App");
    const root = document.createElement("div");
    document.body.append(root);
    await act(async () => createRoot(root).render(<App />));
    const click = async (el: Element | null | undefined) => act(async () => (el as HTMLElement).click());
    const saved = () => JSON.parse(localStorage.getItem("ks-household-v1")!).items as { name: string; level: string; loc: string }[];
    const set = async (el: HTMLTextAreaElement | HTMLInputElement, v: string) =>
      act(async () => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });

    await click([...document.querySelectorAll(".cookbar button")].find((b) => b.textContent === "Scan receipt"));
    expect(document.querySelector('[aria-label="Scan a receipt"]')).not.toBeNull();
    await set(document.querySelector(".paste textarea")!, "GV 2% MLK GAL 007874235187 F 3.48 N\nBNNA 000000004011KF 1.24 N\nPAPER TOWELS 8.97 N\nTOTAL 13.69");
    await click([...document.querySelectorAll(".paste button")].find((b) => b.textContent === "Read it"));

    const rows = [...document.querySelectorAll(".receipt-row")];
    expect(rows.map((r) => (r.querySelector(".receipt-name") as HTMLInputElement).value)).toEqual(["Milk", "Bananas", "Paper Towels"]);
    expect(rows.map((r) => r.querySelector(".tag")!.textContent)).toEqual(["Restock", "New", "New"]);
    // Paper towels aren't food: untick them.
    await click(rows[2].querySelector('input[type="checkbox"]'));
    await click([...document.querySelectorAll(".sheet .btn.primary")].find((b) => b.textContent!.startsWith("Put away")));

    expect(saved().find((i) => i.name === "Milk")!.level).toBe("full");
    expect(saved().find((i) => i.name === "Bananas")).toMatchObject({ level: "full", loc: "pantry" });
    expect(saved().find((i) => i.name === "Paper Towels")).toBeUndefined();
    const toast = document.querySelector(".toast")!;
    expect(toast.textContent).toContain("Restocked 1, added 1");

    await click(toast.querySelector("button"));
    expect(saved().find((i) => i.name === "Bananas")).toBeUndefined();
    expect(saved().find((i) => i.name === "Milk")!.level).toBe(start.items.find((i) => i.name === "Milk")!.level);
  });
});
