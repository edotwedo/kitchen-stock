import { describe, expect, it } from "vitest";
import { fromRow, toRow } from "../src/cloud";
import { sampleKitchen } from "../src/demo";
import { importHousehold } from "../src/importData";
import { byLevelThenName, bySpot, matchesQuery, spotsIn } from "../src/logic";

const h = sampleKitchen(new Date("2026-10-01T12:00:00"));
const fridge = h.items.filter((i) => i.loc === "fridge");

describe("shelf spots", () => {
  it("sorts a place by spot, numbers in order, items with no spot last", () => {
    const list = [...fridge, { ...fridge[0], id: "x", name: "Apples", spot: "bin 10" }, { ...fridge[0], id: "y", name: "Pears", spot: "Bin 2" }];
    const order = list.sort(bySpot(byLevelThenName)).map((i) => i.spot ?? "");
    expect(order.slice(0, 2)).toEqual(["Bin 2", "bin 10"]);
    expect(order.indexOf("Door")).toBeLessThan(order.indexOf("Top shelf"));
    expect(order.at(-1)).toBe("");
  });

  it("offers the spots already used in that place", () => {
    expect(spotsIn(h, "fridge")).toEqual(["Crisper", "Door", "Top shelf"]);
    expect(spotsIn(h, "pantry")).toEqual([]);
  });

  it("finds items by spot", () => {
    expect(fridge.filter((i) => matchesQuery(i, "door", h)).map((i) => i.name).sort()).toEqual(["Ketchup", "Milk"]);
  });

  it("only sends a spot to the database once an item has had one, and clears it with null", () => {
    const plain = fridge.find((i) => !i.spot)!;
    expect("spot" in toRow("k", plain)).toBe(false);
    expect(toRow("k", { ...plain, spot: "Door" }).spot).toBe("Door");
    expect(toRow("k", { ...plain, spot: "" }).spot).toBeNull();
    expect(fromRow({ ...toRow("k", { ...plain, spot: "Door" }) }).spot).toBe("Door");
    expect("spot" in fromRow(toRow("k", { ...plain, spot: "" }))).toBe(false);
  });

  it("keeps spots in backup files", () => {
    const back = importHousehold(JSON.parse(JSON.stringify(h)));
    expect(back.items.find((i) => i.name === "Milk")!.spot).toBe("Door");
  });
});

describe("spot order you choose", () => {
  it("reads a place in the chosen order, new spots after it A to Z", async () => {
    const { moveSpot } = await import("../src/household");
    expect(spotsIn(h, "fridge")).toEqual(["Crisper", "Door", "Top shelf"]);
    // Walk the fridge top to bottom: move Top shelf up twice.
    let k = moveSpot("fridge", "Top shelf", -1)(h);
    k = moveSpot("fridge", "top shelf", -1)(k);
    expect(spotsIn(k, "fridge")).toEqual(["Top shelf", "Crisper", "Door"]);
    expect(k.locations.find((l) => l.key === "fridge")!.spots).toEqual(["Top shelf", "Crisper", "Door"]);
    // Can't move past the ends.
    expect(moveSpot("fridge", "Top shelf", -1)(k)).toBe(k);

    const list = k.items.filter((i) => i.loc === "fridge").sort(bySpot(byLevelThenName, k));
    expect([...new Set(list.map((i) => i.spot ?? ""))]).toEqual(["Top shelf", "Crisper", "Door", ""]);

    // A spot added later goes after the chosen ones; the order survives a backup file.
    const more = { ...k, items: [...k.items, { ...k.items[0], id: "z", name: "Butter", loc: "fridge", spot: "Butter tray" }] };
    expect(spotsIn(more, "fridge")).toEqual(["Top shelf", "Crisper", "Door", "Butter tray"]);
    expect(importHousehold(JSON.parse(JSON.stringify(k))).locations.find((l) => l.key === "fridge")!.spots).toEqual(["Top shelf", "Crisper", "Door"]);
  });
});
