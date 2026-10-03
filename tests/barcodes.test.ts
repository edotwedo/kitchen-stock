import { describe, expect, it } from "vitest";
import { fromRow, toRow } from "../src/cloud";
import { sampleKitchen } from "../src/demo";
import { importHousehold } from "../src/importData";

describe("barcodes on items", () => {
  const h = sampleKitchen(new Date("2026-10-01T12:00:00"));
  const plain = h.items[0];
  const scanned = { ...plain, upc: "0072830123456" };

  it("syncs only items that were scanned, so a database without update 0007 keeps saving", () => {
    expect("upc" in toRow("k", plain)).toBe(false);
    expect(toRow("k", scanned).upc).toBe("0072830123456");
    expect(fromRow(toRow("k", scanned)).upc).toBe("0072830123456");
    expect("upc" in fromRow(toRow("k", plain))).toBe(false);
  });

  it("survives a list file, and junk in the barcode field is dropped", () => {
    const back = importHousehold(JSON.parse(JSON.stringify({ ...h, items: [scanned, { ...plain, id: "x", upc: "not a code" }] })));
    expect(back.items[0].upc).toBe("0072830123456");
    expect(back.items[1].upc).toBeUndefined();
  });
});
