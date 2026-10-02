import { describe, expect, it } from "vitest";
import { lookUp } from "../src/barcode";
import type { Household } from "../src/types";

const h = {
  name: "Home",
  locations: [],
  freezerDays: { regular: 90, vacuum: 365, chamber: 730 },
  flags: [
    { id: "f1", label: "Milk" },
    { id: "f2", label: "Peanuts" },
    { id: "f3", label: "Pork" },
  ],
  people: [],
  items: [],
} as unknown as Household;

const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

describe("barcode lookup (Open Food Facts)", () => {
  it("fills name with brand, size, place and this kitchen's allergy flags", async () => {
    const p = await lookUp("3017620422003", h, reply({
      status: 1,
      product: { product_name: "Hazelnut spread", brands: "Nutella, Ferrero", quantity: "400 g", allergens_tags: ["en:milk", "en:nuts", "en:soybeans"], categories_tags: ["en:spreads", "en:condiments"] },
    }) as typeof fetch);
    expect(p).toEqual({ code: "3017620422003", name: "Hazelnut spread (Nutella)", qty: "400 g", kind: "pantry", flagIds: ["f1"] });
  });

  it("doesn't repeat the brand when the name already has it", async () => {
    const p = await lookUp("123456789012", h, reply({ status: 1, product: { product_name: "Tillamook Cheddar", brands: "Tillamook", categories_tags: ["en:cheeses"] } }) as typeof fetch);
    expect(p?.name).toBe("Tillamook Cheddar");
    expect(p?.kind).toBe("fridge");
  });

  it("drops the European estimated-size mark from the amount", async () => {
    for (const q of ["400 g e", "400 g ℮", "400g℮"]) {
      const p = await lookUp("123456789012", h, reply({ status: 1, product: { product_name: "Spread", quantity: q } }) as typeof fetch);
      expect(p?.qty).toMatch(/^400 ?g$/);
    }
    const pie = await lookUp("123456789012", h, reply({ status: 1, product: { product_name: "Pie", quantity: "1 pie" } }) as typeof fetch);
    expect(pie?.qty).toBe("1 pie");
  });

  it("frozen beats everything else", async () => {
    const p = await lookUp("123456789012", h, reply({ status: 1, product: { product_name: "Peas", categories_tags: ["en:frozen-foods", "en:vegetables"] } }) as typeof fetch);
    expect(p?.kind).toBe("freezer");
  });

  it("unknown products and errors come back empty", async () => {
    expect(await lookUp("123456789012", h, reply({ status: 0 }) as typeof fetch)).toBeNull();
    expect(await lookUp("123456789012", h, reply({}, 500) as typeof fetch)).toBeNull();
  });

  it("never sends anything that isn't a barcode number", async () => {
    let called = false;
    const f = (async () => ((called = true), new Response("{}"))) as unknown as typeof fetch;
    expect(await lookUp("hello", h, f)).toBeNull();
    expect(await lookUp("12/../x", h, f)).toBeNull();
    expect(called).toBe(false);
  });
});
