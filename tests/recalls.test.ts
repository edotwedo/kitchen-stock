import { describe, expect, it } from "vitest";
import { expandUpcE, findRecallMatches, fromFda, productName, reachesState, recallQuery, sameUpc, upcKey, upcsIn } from "../src/recalls";
import type { Item } from "../src/types";

const item = (name: string, o: Partial<Item> = {}): Item => ({ id: name, name, loc: "fridge", qty: "", level: "full", useBy: "", remindOn: "", frozenOn: "", wrap: "regular", note: "", flags: [], updated: "", ...o });

const rows = [
  { recall_number: "F-1", report_date: "20260923", recalling_firm: "Fresh Salsa Co", product_description: "Tomato Salsa Fresca. Ingredients: Tomatoes, Yellow Onion, Red Onion, Cilantro", reason_for_recall: "Listeria", classification: "Class I", distribution_pattern: "Nationwide" },
  { recall_number: "F-2", report_date: "20260920", recalling_firm: "Everything Sprouts, LLC", product_description: "Everything Sprouts Crunchy Protein Sprout Mix, containing Alfalfa, Mung", reason_for_recall: "E. coli", classification: "Class I", distribution_pattern: "MN, WI" },
  { recall_number: "F-3", report_date: "20260915", recalling_firm: "Tillamook County Creamery", product_description: "Tillamook Sharp Cheddar Cheese, Net Wt 2 lb, UPC 0 72830", reason_for_recall: "Undeclared egg", classification: "Class II", distribution_pattern: "WA, OR, ID" },
  { recall_number: "F-4", report_date: "20260910", recalling_firm: "Bakery Inc", product_description: "Sourdough Bread 24 oz", reason_for_recall: "Mold", classification: "Class II", distribution_pattern: "Distributed in Washington and Oregon" },
];
const recalls = fromFda(rows);

describe("recall alerts", () => {
  it("keeps only the product's name, not its ingredients or packaging", () => {
    expect(productName("Tomato Salsa Fresca. Ingredients: Tomatoes, Onion")).toBe("Tomato Salsa Fresca");
    expect(productName("Tillamook Sharp Cheddar Cheese, Net Wt 2 lb")).toBe("Tillamook Sharp Cheddar Cheese");
    expect(productName("Sprout Mix, containing Alfalfa")).toBe("Sprout Mix");
    expect(recalls[0].date).toBe("2026-09-23");
  });

  it("an onion in the fridge doesn't match a salsa whose ingredients include onion", () => {
    expect(findRecallMatches({ items: [item("Yellow onion")] }, recalls)).toEqual([]);
  });

  it("brand and product words match as likely; a single common word is only possible", () => {
    const m = findRecallMatches({ items: [item("Tillamook sharp cheddar"), item("Salsa"), item("Bread")] }, recalls);
    const by = Object.fromEntries(m.map((x) => [x.item.name, x.strength]));
    expect(by["Tillamook sharp cheddar"]).toBe("likely");
    expect(by["Salsa"]).toBe("possible");
    expect(by["Bread"]).toBe("possible");
    expect(m[0].item.name).toBe("Tillamook sharp cheddar"); // likely first
  });

  it("only recalls that reach the kitchen's state", () => {
    expect(findRecallMatches({ items: [item("Sprout mix (Everything Sprouts)")] }, recalls)).toEqual([]);
    expect(findRecallMatches({ items: [item("Sprout mix (Everything Sprouts)")] }, recalls, "MN")).toHaveLength(1);
    expect(reachesState("Nationwide", "WA")).toBe(true);
    expect(reachesState("WA, OR, ID", "WA")).toBe(true);
    expect(reachesState("Domestic: AL, AR, FL, GA", "WA")).toBe(false);
    expect(reachesState("Distributed in Washington and Oregon", "WA")).toBe(true);
    expect(reachesState("Texas and Louisiana", "WA")).toBe(false);
    expect(reachesState("Distributed to retail stores", "WA")).toBe(true);
  });

  it("one word has to be what the product is, not just part of its name", () => {
    const potatoBread = fromFda([{ recall_number: "F-5", report_date: "20260901", product_description: "Product is Potato Sourdough Bread and sold under three names", distribution_pattern: "Distributed in WA only." }]);
    expect(findRecallMatches({ items: [item("Whole potatoes")] }, potatoBread)).toEqual([]);
    expect(findRecallMatches({ items: [item("Sourdough bread")] }, potatoBread)).toHaveLength(1);
  });

  it("skips items that are out, and plurals still match", () => {
    expect(findRecallMatches({ items: [item("Tillamook cheddar", { level: "out" })] }, recalls)).toEqual([]);
    expect(findRecallMatches({ items: [item("Sourdough breads")] }, recalls)).toHaveLength(1);
  });

  it("asks openFDA for ongoing recalls from the last few months", () => {
    const q = decodeURIComponent(recallQuery(new Date(2026, 9, 2)));
    expect(q).toContain('status:"Ongoing"');
    expect(q).toContain("report_date:[20260604 TO 20261002]");
  });
});

describe("recall alerts by barcode", () => {
  it("reads the barcodes a notice lists, however they're written, and stops at the lot codes", () => {
    expect(upcsIn("Tillamook Sharp Cheddar, Net Wt 2 lb, UPC 0 72830 12345 6, Lot 123456789012")).toEqual(expect.arrayContaining(["72830123456"]));
    expect(upcsIn("Tillamook Sharp Cheddar, Net Wt 2 lb, UPC 0 72830 12345 6, Lot 123456789012")).not.toContain("123456789012");
    expect(upcsIn("UPC Codes: 041220-123456 and 041220-654321; Best By 12/01/2026")).toEqual(expect.arrayContaining(["41220123456", "41220654321"]));
    expect(upcsIn("UPC: 0-12345-67890-5 Net Wt. 16 oz")).toContain("12345678905");
    expect(upcsIn("Sourdough Bread 24 oz, lot 20260901")).toEqual([]);
  });

  it("writes every barcode the same way: EAN with a leading 0, UPC-E, dashes", () => {
    expect(upcKey("0072830123456")).toBe(upcKey("072830123456"));
    expect(upcKey("0-72830-12345-6")).toBe("72830123456");
    expect(expandUpcE("04252614")).toBe("042100005264"); // a textbook UPC-E and its UPC-A
    expect(sameUpc("72830123456", "7283012345")).toBe(true); // notice left off the check digit
    expect(sameUpc("72830123456", "72830123457")).toBe(false);
    expect(sameUpc("", "")).toBe(false);
  });

  const withUpc = fromFda([
    { recall_number: "F-9", report_date: "20260925", recalling_firm: "Sunny Foods Inc", product_description: "Sunny Hummus Classic 10 oz, UPC 0 41220 12345 6", code_info: "Best by 11/15/2026", reason_for_recall: "Listeria", classification: "Class I", distribution_pattern: "Nationwide" },
  ]);

  it("a scanned barcode on the recall is a match even when the names don't agree", () => {
    const m = findRecallMatches({ items: [item("Chickpea dip", { upc: "0041220123456" }), item("Tillamook sharp cheddar")] }, [...recalls, ...withUpc]);
    expect(m[0]).toMatchObject({ barcode: "match", strength: "likely" });
    expect(m[0].item.name).toBe("Chickpea dip"); // barcode matches come first
  });

  it("a name match whose scanned barcode isn't on the recall's list says so", () => {
    const m = findRecallMatches({ items: [item("Sunny hummus", { upc: "041220999999" })] }, withUpc);
    expect(m).toHaveLength(1);
    expect(m[0].barcode).toBe("differs");
    // Without a scanned barcode, or when the notice lists none, nothing is said about barcodes.
    expect(findRecallMatches({ items: [item("Sunny hummus")] }, withUpc)[0].barcode).toBeUndefined();
    expect(findRecallMatches({ items: [item("Tillamook cheddar", { upc: "041220999999" })] }, fromFda([{ ...rows[2], product_description: "Tillamook Sharp Cheddar Cheese" }]))[0].barcode).toBeUndefined();
  });

  it("a barcode match still has to reach the kitchen's state, and out items are skipped", () => {
    const far = fromFda([{ recall_number: "F-10", report_date: "20260925", product_description: "Dip, UPC 041220123456", distribution_pattern: "TX, LA" }]);
    expect(findRecallMatches({ items: [item("Chickpea dip", { upc: "041220123456" })] }, far)).toEqual([]);
    expect(findRecallMatches({ items: [item("Chickpea dip", { upc: "041220123456", level: "out" })] }, withUpc)).toEqual([]);
  });
});
