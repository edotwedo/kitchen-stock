import type { Household, Item } from "./types";

/**
 * Food recall alerts: compares the kitchen's items with ongoing FDA food recalls (openFDA, free,
 * no key) and flags the ones that may match. It never says "this is recalled", only "check the
 * label": recall notices name products, not the jar on your shelf.
 *
 * Matching looks only at the product's name and brand, never at its ingredient list, and only at
 * recalls that reach the kitchen's state (or the whole country).
 */

export interface Recall {
  id: string; // FDA recall number, e.g. "F-1234-2026"
  date: string; // YYYY-MM-DD the recall was reported
  firm: string;
  product: string; // the product's name part (ingredients and packaging details cut off)
  reason: string;
  classification: string; // "Class I" is the most serious
  distribution: string;
}

export interface RecallMatch {
  item: Item;
  recall: Recall;
  /** "likely": brand or two specific words match. "possible": one common word, check the brand. */
  strength: "likely" | "possible";
}

export const RECALL_URL = "https://api.fda.gov/food/enforcement.json";
const DAYS_BACK = 120;

/** The openFDA query for ongoing recalls reported in the last few months. */
export function recallQuery(today: Date): string {
  const from = new Date(today.getTime() - DAYS_BACK * 864e5);
  const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const search = `status:"Ongoing" AND report_date:[${ymd(from)} TO ${ymd(today)}]`;
  return `${RECALL_URL}?search=${encodeURIComponent(search)}&limit=1000&sort=report_date:desc`;
}

interface FdaRow {
  recall_number?: string;
  report_date?: string;
  recalling_firm?: string;
  product_description?: string;
  reason_for_recall?: string;
  classification?: string;
  distribution_pattern?: string;
}

/** The product's name: what comes before the ingredient list, weights, codes and packaging details. */
export function productName(description: string): string {
  const cut = description.search(/\b(ingredients?|contains|containing|net\s*w(?:t|eight)|upc|lot\s*(?:#|no|code)|best\s*by|sell\s*by|use\s*by|exp(?:iration)?\.?\s*date|packaged\s+in|item\s*#|sku)\b|[;:]/i);
  return (cut > 0 ? description.slice(0, cut) : description).replace(/[,.\s]+$/, "").trim();
}

export function fromFda(rows: FdaRow[]): Recall[] {
  return rows
    .filter((r) => r.recall_number && r.product_description)
    .map((r) => ({
      id: r.recall_number!,
      date: (r.report_date ?? "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"),
      firm: (r.recalling_firm ?? "").trim(),
      product: productName(r.product_description!),
      reason: (r.reason_for_recall ?? "").trim(),
      classification: (r.classification ?? "").trim(),
      distribution: (r.distribution_pattern ?? "").trim(),
    }));
}

const STATE_NAMES: Record<string, string> = { WA: "washington", OR: "oregon", ID: "idaho", CA: "california" };

/** Does the recall reach this state? Nationwide counts; a list of other states doesn't. */
export function reachesState(distribution: string, state: string): boolean {
  const d = distribution.toLowerCase();
  if (/nation\s*wide|nationally|all\s+(?:50\s+)?states|throughout\s+the\s+(?:u\.?s\.?|united states)|\bus\s*wide\b|across\s+the\s+(?:u\.?s|country)/.test(d)) return true;
  const st = state.toUpperCase();
  if (new RegExp(`\\b${st}\\b`).test(distribution)) return true;
  const name = STATE_NAMES[st];
  if (name && d.includes(name)) return true;
  // No states named at all ("distributed to retail stores"): can't rule it out.
  return !/\b[A-Z]{2}\b/.test(distribution) && !/(alabama|alaska|arizona|arkansas|california|colorado|florida|georgia|illinois|indiana|iowa|kansas|kentucky|louisiana|maryland|michigan|minnesota|missouri|nevada|new york|ohio|oklahoma|oregon|pennsylvania|texas|utah|virginia|wisconsin)/.test(d);
}

// Words that say nothing about which product it is.
const NOISE = new Set(
  "a an and the of with in on for to by from fresh frozen organic natural original classic brand style homestyle family size pack packs value great gourmet premium select choice pure real old fashioned new lb lbs oz ct count gallon gal jar can bag box bottle whole half large small medium mini my our".split(" "),
);
// Common foods: one of these alone is too broad to call a likely match.
const COMMON = new Set(
  "beef pork chicken turkey fish salmon shrimp ham bacon sausage milk cheese butter yogurt cream eggs egg bread rice pasta flour sugar salt oil sauce soup salsa chips cookies crackers cereal juice water coffee tea nuts peanut peanuts almonds lettuce spinach salad onion onions tomato tomatoes apples apple berries fruit vegetables beans corn peas mix spice spices seasoning candy chocolate ice".split(" "),
);

const stem = (w: string) => (w.length > 4 && w.endsWith("es") && !w.endsWith("ses") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
export const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !/^\d+$/.test(w) && !NOISE.has(w))
    .map(stem);

/** Which of the kitchen's items may be part of a recall. Out-of-stock items are skipped. */
export function findRecallMatches(h: Pick<Household, "items">, recalls: Recall[], state = "WA"): RecallMatch[] {
  const local = recalls.filter((r) => reachesState(r.distribution, state));
  const out: RecallMatch[] = [];
  for (const item of h.items) {
    if (item.level === "out") continue;
    const mine = [...new Set(words(item.name))];
    if (!mine.length) continue;
    const specific = mine.filter((w) => !COMMON.has(w));
    for (const recall of local) {
      const productWords = words(recall.product);
      const theirs = new Set([...productWords, ...words(recall.firm)]);
      if (!mine.every((w) => theirs.has(w))) continue;
      // One word ("Potatoes") must be what the product is (its last words, "Sourdough Bread"),
      // not just something it's named after ("Potato Sourdough Bread").
      if (mine.length === 1 && !productWords.slice(-2).includes(mine[0]) && !words(recall.firm).includes(mine[0])) continue;
      const strength = specific.length >= 1 || mine.length >= 2 ? "likely" : "possible";
      out.push({ item, recall, strength });
    }
  }
  // Most serious and most likely first.
  const cls = (r: Recall) => (/class i\b/i.test(r.classification) && !/class ii/i.test(r.classification) ? 0 : 1);
  return out.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "likely" ? -1 : 1) || cls(a.recall) - cls(b.recall) || b.recall.date.localeCompare(a.recall.date));
}

/** A key for "I checked this one", so a dismissed match stays dismissed. */
export const matchKey = (m: RecallMatch) => `${m.recall.id}|${m.item.id}`;
