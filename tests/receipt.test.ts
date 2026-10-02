import { describe, expect, it } from "vitest";
import { sampleKitchen } from "../src/demo";
import { expand, guessPlace, parseReceipt } from "../src/receipt";

const h = sampleKitchen(new Date("2026-10-01T12:00:00"));

// Shaped like real receipts: store header, item lines with codes and tax flags, totals, payment.
const WALMART = `WAL*MART
SAVE MONEY. LIVE BETTER.
( 253 ) 555 - 0100
ST# 02145 OP# 009042 TE# 42 TR# 01811
GV 2% MLK GAL 007874235187 F 3.48 N
KS ORG BBY SPN 007874201457 F 4.27 N
SHRD CHDR CHS 007874213412 F 2.97 N
COFFEE 002550000012 F 9.98 N
BNNA 000000004011KF 1.24 N
GV FRZ PEAS 007874200112 F 1.26 N
CHKN BRST BNLS 029000171234 F 11.42 N
SUBTOTAL 34.62
TAX 1 9.80 % 0.00
TOTAL 34.62
DEBIT TEND 34.62
CHANGE DUE 0.00
10/01/26 18:42:07
# ITEMS SOLD 7
THANK YOU FOR SHOPPING`;

describe("receipt scanning", () => {
  it("expands receipt shorthand and drops store brands, codes and sizes", () => {
    expect(expand("GV 2% MLK GAL 007874235187")).toBe("2% milk");
    expect(expand("KS ORG BBY SPN")).toBe("organic baby spinach");
    expect(expand("CHKN BRST BNLS 3LB")).toBe("chicken breast boneless");
  });

  it("finds the food lines, skips totals, payment, dates and store info", () => {
    const lines = parseReceipt(WALMART, h);
    expect(lines).toHaveLength(7);
    expect(lines.map((l) => l.raw).join("\n")).not.toMatch(/TOTAL|TAX|DEBIT|CHANGE|SOLD|THANK|ST#/);
  });

  it("matches lines to what's already in the kitchen, so they get restocked", () => {
    const lines = parseReceipt(WALMART, h);
    const byRaw = (s: string) => lines.find((l) => l.raw.startsWith(s))!;
    expect(byRaw("GV 2% MLK").match?.name).toBe("Milk");
    expect(byRaw("KS ORG BBY SPN").match?.name).toBe("Baby spinach");
    expect(byRaw("SHRD CHDR").match?.name).toBe("Shredded cheddar");
    expect(byRaw("COFFEE").match?.name).toBe("Coffee");
    expect(byRaw("GV FRZ PEAS").match?.name).toBe("Frozen peas");
  });

  it("proposes new items, with a likely place, for things the kitchen hasn't seen", () => {
    const lines = parseReceipt(WALMART, h);
    const bananas = lines.find((l) => l.raw.startsWith("BNNA"))!;
    expect(bananas.match).toBeNull();
    expect(bananas.name).toBe("Bananas");
    expect(bananas.kind).toBe("pantry");
    const chicken = lines.find((l) => l.raw.startsWith("CHKN"))!;
    expect(chicken.kind).toBe("fridge");
    expect(guessPlace("frozen waffles")).toBe("freezer");
  });

  it("merges a repeated item into one line", () => {
    const twice = "MILK 3.48\nMILK 3.48\nTOTAL 6.96";
    expect(parseReceipt(twice, h)).toHaveLength(1);
  });
});
