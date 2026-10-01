// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { sampleKitchen } from "../src/demo";
import { matchesQuery } from "../src/logic";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const saved = () => JSON.parse(localStorage.getItem("ks-household-v1")!) as ReturnType<typeof sampleKitchen>;

describe("search", () => {
  const h = sampleKitchen(new Date("2026-10-01T12:00:00"));
  const names = (q: string) => h.items.filter((i) => matchesQuery(i, q, h)).map((i) => i.name);
  it("finds items by place and by dietary flag, not just name", () => {
    expect(names("pork")).toEqual(["Bacon", "Pork chops"]); // Bacon is only tagged, not named, pork
    expect(names("freezer")).toHaveLength(6);
    expect(names("peanut")).toEqual(["Peanut butter"]);
    expect(names("made sunday")).toEqual(["Leftover chili"]); // notes still count
  });
});

describe("undo", () => {
  it("takes back a gauge tap and a delete", async () => {
    localStorage.setItem("ks-household-v1", JSON.stringify(sampleKitchen()));
    localStorage.setItem("ks-tab", "all");
    const { default: App } = await import("../src/App");
    const root = document.createElement("div");
    document.body.append(root);
    await act(async () => createRoot(root).render(<App />));
    const undo = async () => act(async () => [...document.querySelectorAll(".toast button")].find((b) => b.textContent === "Undo")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const row = root.querySelector(".row")!;
    const name = row.querySelector(".linkish")!.textContent!;
    const before = saved().items.find((i) => i.name === name)!.level;
    await act(async () => (row.querySelector(".gauge") as HTMLButtonElement).click());
    expect(saved().items.find((i) => i.name === name)!.level).not.toBe(before);
    await undo();
    expect(saved().items.find((i) => i.name === name)!.level).toBe(before);

    // Delete from the edit sheet (two taps), then undo.
    const count = saved().items.length;
    await act(async () => (row.querySelector(".linkish") as HTMLButtonElement).click());
    const del = () => [...document.querySelectorAll(".sheet button")].find((b) => /delete/i.test(b.textContent!)) as HTMLButtonElement;
    await act(async () => del().click());
    await act(async () => del().click());
    expect(saved().items).toHaveLength(count - 1);
    await undo();
    expect(saved().items).toHaveLength(count);
    expect(saved().items.some((i) => i.name === name)).toBe(true);
  });
});

describe("back from the store", () => {
  it("restocks the ticked items at once, restarts the freezer clock, and undoes as one", async () => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem("ks-household-v1", JSON.stringify(sampleKitchen()));
    localStorage.setItem("ks-tab", "shop");
    const { default: App } = await import("../src/App");
    const root = document.createElement("div");
    document.body.append(root);
    await act(async () => createRoot(root).render(<App />));
    const before = saved().items;
    const shopping = before.filter((i) => i.level === "low" || i.level === "out");

    await act(async () => ([...root.querySelectorAll(".cookbar .btn")].find((b) => b.textContent === "Restock") as HTMLButtonElement).click());
    const boxes = [...document.querySelectorAll(".storerun input[type=checkbox]")] as HTMLInputElement[];
    expect(boxes).toHaveLength(shopping.length);
    await act(async () => boxes[0].click());
    await act(async () => boxes[1].click());
    await act(async () => ([...document.querySelectorAll(".sheet .btn.primary")].find((b) => /Restock 2/.test(b.textContent!)) as HTMLButtonElement).click());

    const after = saved().items;
    const changed = after.filter((i, n) => i.level !== before[n].level);
    expect(changed).toHaveLength(2);
    expect(changed.every((i) => i.level === "full")).toBe(true);
    const frozen = changed.find((i) => i.loc === "freezer");
    if (frozen) expect(frozen.frozenOn).not.toBe(before.find((b) => b.id === frozen.id)!.frozenOn);

    await act(async () => [...document.querySelectorAll(".toast button")].find((b) => b.textContent === "Undo")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(saved().items.map((i) => i.level)).toEqual(before.map((i) => i.level));
  });
});
