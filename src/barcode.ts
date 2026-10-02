import type { Household, LocationKind } from "./types";

/** What a grocery barcode tells us, from Open Food Facts (a free, public product database). */
export interface Product {
  code: string;
  name: string;
  qty: string;
  kind: LocationKind | null; // where it probably goes, when the category makes it clear
  flagIds: string[]; // this kitchen's flags that the product's allergen list matches
}

// Open Food Facts allergen tags -> the flag names in our library.
const ALLERGENS: Record<string, string> = {
  "en:milk": "Milk", "en:eggs": "Eggs", "en:peanuts": "Peanuts", "en:nuts": "Tree nuts", "en:fish": "Fish",
  "en:crustaceans": "Shellfish", "en:molluscs": "Shellfish", "en:gluten": "Gluten", "en:soybeans": "Soy", "en:sesame-seeds": "Sesame",
};

/** Only the barcode number is sent. Browsers set their own User-Agent, so none is added here. */
export async function lookUp(code: string, h: Household, f: typeof fetch = fetch): Promise<Product | null> {
  if (!/^\d{6,14}$/.test(code)) return null;
  const fields = "product_name,brands,quantity,allergens_tags,categories_tags";
  const res = await f(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
  if (!res.ok) return null;
  const j = (await res.json()) as { status?: number; product?: { product_name?: string; brands?: string; quantity?: string; allergens_tags?: string[]; categories_tags?: string[] } };
  if (j.status !== 1 || !j.product?.product_name) return null;
  const p = j.product;
  const brand = (p.brands ?? "").split(",")[0].trim();
  const name = brand && !p.product_name!.toLowerCase().includes(brand.toLowerCase()) ? `${p.product_name} (${brand})` : p.product_name!;
  const cats = (p.categories_tags ?? []).join(" ");
  const kind: LocationKind | null = /frozen/.test(cats) ? "freezer" : /dairies|dairy|cheeses|yogurts|meats|fresh|eggs|refrigerated/.test(cats) ? "fridge" : /canned|cereals|pastas|rice|snacks|beverages|condiments|spices|flours|sugars/.test(cats) ? "pantry" : null;
  const wanted = new Set((p.allergens_tags ?? []).map((t) => ALLERGENS[t]).filter(Boolean).map((l) => l.toLowerCase()));
  const flagIds = h.flags.filter((f) => wanted.has(f.label.toLowerCase())).map((f) => f.id);
  return { code, name: name.trim(), qty: (p.quantity ?? "").replace(/\s*℮\s*$|\s+e$/u, "").trim(), kind, flagIds };
}
