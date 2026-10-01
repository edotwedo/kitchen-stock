import { describe, expect, it } from "vitest";
import { diff, fromRow, toRow } from "../src/cloud";
import { importHousehold } from "../src/importData";

const h = importHousehold({
  counted: "2026-09-30",
  items: [
    { id: "a", name: "Ground beef", loc: "chest", qty: "2 lb", level: "full" },
    { id: "b", name: "Milk", loc: "fridge", level: "half", useBy: "2026-10-05" },
  ],
});

describe("database rows", () => {
  it("round-trips an item, turning empty dates into nulls and back", () => {
    const row = toRow("hh1", h.items[1]);
    expect(row).toMatchObject({ household_id: "hh1", id: "b", use_by: "2026-10-05", remind_on: null, frozen_on: null });
    const back = importHousehold({ items: [fromRow({ ...row, updated_at: "2026-10-01T00:00:00Z" })] }).items[0];
    expect(back).toMatchObject({ id: "b", useBy: "2026-10-05", remindOn: "", frozenOn: "", level: "half" });
  });

  it("sends only what changed", () => {
    const after = { ...h, items: [{ ...h.items[0], level: "low" as const }, h.items[1]] };
    const d = diff(h, after);
    expect(d.upserts.map((i) => i.id)).toEqual(["a"]);
    expect(d.deletes).toEqual([]);
    expect(d.settingsChanged).toBe(false);
  });

  it("notices deletes and settings changes", () => {
    const after = { ...h, name: "New name", items: [h.items[0]] };
    const d = diff(h, after);
    expect(d.deletes).toEqual(["b"]);
    expect(d.upserts).toEqual([]);
    expect(d.settingsChanged).toBe(true);
  });
});
