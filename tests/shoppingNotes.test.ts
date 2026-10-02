import { describe, expect, it } from "vitest";
import { fromRow, toRow } from "../src/cloud";
import { sampleKitchen } from "../src/demo";
import { importHousehold } from "../src/importData";
import { printPages } from "../src/PrintView";

describe("shopping notes", () => {
  const h = sampleKitchen(new Date("2026-10-01T12:00:00"));
  const milk = { ...h.items.find((i) => i.name === "Milk")!, buy: "oat milk, not regular" };
  const k = { ...h, items: h.items.map((i) => (i.id === milk.id ? milk : i)) };

  it("syncs only once an item has had one, and clears with null", () => {
    const plain = h.items.find((i) => !i.buy)!;
    expect("buy" in toRow("k", plain)).toBe(false);
    expect(toRow("k", milk).buy).toBe("oat milk, not regular");
    expect(toRow("k", { ...milk, buy: "" }).buy).toBeNull();
    expect(fromRow(toRow("k", milk)).buy).toBe("oat milk, not regular");
  });

  it("prints under the item on the shopping list and survives a backup file", () => {
    const rows = printPages(k, "shopping", ["fridge"])[0].rows;
    expect(rows.find((r) => r.name === "Milk")!.buy).toBe("oat milk, not regular");
    expect(importHousehold(JSON.parse(JSON.stringify(k))).items.find((i) => i.name === "Milk")!.buy).toBe("oat milk, not regular");
  });

  it("is cleared when the item is restocked (it was bought)", async () => {
    const store = await import("../src/store");
    store.replaceHousehold(k);
    store.restockItems([milk.id]);
    const after = store.snapshot().household!.items.find((i) => i.id === milk.id)!;
    expect(after.level).toBe("full");
    expect(after.buy).toBe("");
  });
});
