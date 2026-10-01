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
