// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { sampleKitchen } from "../src/demo";
import { sendShoppingList } from "../src/sendList";
import { shoppingText } from "../src/shoppingText";
import type { Household, Item } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = (o: Partial<Item>): Item => ({ id: o.name ?? "x", name: "x", loc: "fridge", qty: "", level: "full", useBy: "", remindOn: "", frozenOn: "", wrap: "regular", note: "", flags: [], updated: "", ...o });
const h = (items: Item[]): Household => ({
  name: "Home",
  locations: [{ key: "fridge", label: "Fridge", kind: "fridge" }, { key: "pantry", label: "Pantry", kind: "pantry" }],
  freezerDays: { regular: 90, vacuum: 365, chamber: 730 },
  flags: [], people: [], items,
});

describe("shopping list as text", () => {
  it("groups by place, marks low, includes the shopping note", () => {
    const t = shoppingText(h([
      item({ name: "Milk", level: "out", buy: "oat milk, not regular" }),
      item({ name: "Rice", loc: "pantry", level: "low" }),
      item({ name: "Eggs", level: "full" }),
    ]));
    expect(t).toBe("Home: shopping list (2)\n\nFridge\n- Milk: oat milk, not regular\n\nPantry\n- Rice (low)");
  });

  it("is empty when nothing is low or out", () => {
    expect(shoppingText(h([item({ name: "Eggs" })]))).toBe("");
  });

  it("keeps the low mark and note for items in a place that no longer exists", () => {
    expect(shoppingText(h([item({ name: "Ice", loc: "garage", level: "low", buy: "the big bag" })]))).toBe("Home: shopping list (1)\n\nOther\n- Ice (low): the big bag");
  });
});

describe("sending it", () => {
  const clip = (ok = true) => ({ writeText: vi.fn(() => (ok ? Promise.resolve() : Promise.reject(new Error("blocked")))) }) as unknown as Clipboard;

  it("uses the share sheet when there is one", async () => {
    const share = vi.fn(() => Promise.resolve());
    const clipboard = clip();
    expect(await sendShoppingList("list", { share, clipboard })).toBe("");
    expect(share).toHaveBeenCalledWith({ title: "Shopping list", text: "list" });
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it("says nothing when the person closes the share sheet", async () => {
    const share = vi.fn(() => Promise.reject(Object.assign(new Error("closed"), { name: "AbortError" })));
    const clipboard = clip();
    expect(await sendShoppingList("list", { share, clipboard })).toBe("");
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it("copies instead when sharing is missing or refused", async () => {
    const clipboard = clip();
    expect(await sendShoppingList("list", { share: undefined as unknown as Navigator["share"], clipboard })).toMatch(/copied/);
    const refused = vi.fn(() => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })));
    expect(await sendShoppingList("list", { share: refused, clipboard })).toMatch(/copied/);
    expect(clipboard.writeText).toHaveBeenCalledTimes(2);
  });

  it("points to printing when copying is blocked too", async () => {
    expect(await sendShoppingList("list", { share: undefined as unknown as Navigator["share"], clipboard: clip(false) })).toMatch(/Print sheets/);
  });
});

describe("Send list button", () => {
  it("copies the kitchen's shopping list from the Shopping tab", async () => {
    const start = sampleKitchen();
    localStorage.setItem("ks-household-v1", JSON.stringify(start));
    localStorage.setItem("ks-tab", "shop");
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { default: App } = await import("../src/App");
    const root = document.createElement("div");
    document.body.append(root);
    await act(async () => createRoot(root).render(<App />));

    const btn = [...document.querySelectorAll(".cookbar button")].find((b) => b.textContent === "Send list") as HTMLElement;
    expect(btn).toBeTruthy();
    await act(async () => btn.click());
    expect(writeText).toHaveBeenCalledWith(shoppingText(start));
    expect(shoppingText(start)).toMatch(/shopping list/);
    expect(document.querySelector(".toast")!.textContent).toContain("Shopping list copied");
  });
});
