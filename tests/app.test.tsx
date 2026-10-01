// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { importHousehold } from "../src/importData";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const SEED = `${process.cwd()}/kitchen-seed-data.json`;

describe.skipIf(!existsSync(SEED))("app screens with the seed", () => {
  it("renders tabs, steps a gauge, and restocks from Shopping", async () => {
    const h = importHousehold(JSON.parse(readFileSync(SEED, "utf8")));
    h.people = [{ id: "p1", name: "Sam", avoids: ["pork"] }, { id: "p2", name: "Alex", avoids: [] }];
    localStorage.setItem("ks-household-v1", JSON.stringify(h));
    localStorage.setItem("ks-tab", "flag:pork");
    const { default: App } = await import("../src/App");
    const root = document.createElement("div");
    document.body.append(root);
    await act(async () => createRoot(root).render(<App />));

    const tabs = [...root.querySelectorAll(".chip")].map((t) => t.textContent);
    expect(tabs).toContain("Pork6");
    expect(tabs).toContain("Shopping25");
    expect(tabs).toContain("All214");
    expect(root.querySelectorAll(".row")).toHaveLength(6);
    expect(root.querySelectorAll(".tag.avoid")).toHaveLength(6);
    expect(root.querySelector(".tag.avoid")!.textContent).toBe("Not for Sam");

    // Step the first pork item's gauge down one level.
    const first = root.querySelector(".row")!;
    const before = first.querySelector(".gauge small")!.textContent;
    await act(async () => (first.querySelector(".gauge") as HTMLButtonElement).click());
    const saved = JSON.parse(localStorage.getItem("ks-household-v1")!);
    const changed = saved.items.filter((i: { level: string }, n: number) => i.level !== h.items[n].level);
    expect(changed).toHaveLength(1);
    expect(before).not.toBe(changed[0].level);

    // Shopping tab: Restocked resets to full.
    const shop = [...root.querySelectorAll(".chip")].find((t) => t.textContent!.startsWith("Shopping")) as HTMLButtonElement;
    await act(async () => shop.click());
    const n = root.querySelectorAll(".restock").length;
    await act(async () => (root.querySelector(".restock") as HTMLButtonElement).click());
    expect(root.querySelectorAll(".restock").length).toBe(n - 1);
  });
});
