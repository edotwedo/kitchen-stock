import type { Household, Item } from "./types";

/**
 * Food recall alerts: compares the kitchen's items with ongoing FDA food recalls (openFDA, free,
 * no key) and flags the ones that may match. It never says "this is recalled", only "check the
 * label": recall notices name products, not the jar on your shelf.
 *
 * Matching looks only at the product's name and brand, never at its ingredient list, and only at
 * recalls that reach the kitchen's state (or the whole country). An item that was scanned also
 * carries its barcode, and a recall that lists that barcode is a match whatever the names say.
 */

export interface Recall {
  id: string; // FDA recall number, e.g. "F-1234-2026"
  date: string; // YYYY-MM-DD the recall was reported
  firm: string;
  product: string; // the product's name part (ingredients and packaging details cut off)
  reason: string;
  classification: string; // "Class I" is the most serious
  distribution: string;
  upcs?: string[]; // barcode numbers the notice lists, leading zeros dropped (see upcKey)
}

export interface RecallMatch {
  item: Item;
  recall: Recall;
  /** "likely": brand or two specific words match. "possible": one common word, check the brand. */
  strength: "likely" | "possible";
  /** "match": the item's scanned barcode is on the recall. "differs": the recall lists barcodes and the item's isn't one. */
  barcode?: "match" | "differs";
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
  code_info?: string;
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
      upcs: upcsIn(`${r.product_description} ${r.code_info ?? ""}`),
    }));
}

/** A UPC-E (the short 8-digit barcode on small packages) written out as the full 12-digit UPC-A. */
export function expandUpcE(code: string): string {
  if (!/^[01]\d{7}$/.test(code)) return code;
  const [n, d1, d2, d3, d4, d5, d6, check] = code;
  const body =
    d6 <= "2" ? `${d1}${d2}${d6}0000${d3}${d4}${d5}` : d6 === "3" ? `${d1}${d2}${d3}00000${d4}${d5}` : d6 === "4" ? `${d1}${d2}${d3}${d4}00000${d5}` : `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return n + body + check;
}

/**
 * One way of writing a barcode, so the same product compares equal however it's written: digits
 * only, a short UPC-E written out in full, and the leading zeros dropped (a 12-digit UPC and the
 * 13-digit EAN a scanner reports for it differ only by a leading 0).
 */
export function upcKey(code: string): string {
  const d = code.replace(/\D/g, "");
  return (d.length === 8 ? expandUpcE(d) : d).replace(/^0+/, "");
}

/** Do two barcodes name the same product? Notices sometimes leave off the last (check) digit. */
export function sameUpc(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 10 && long.length === short.length + 1 && long.startsWith(short);
}

const UPC_LABEL = /\b(?:upcs?|gtins?|eans?|barcodes?|bar\s+codes?)\b/gi;
// Where the barcode list ends and the lot numbers and dates begin.
const AFTER_UPCS = /\b(?:lot|lots|batch|best|sell|use|exp|expir\w*|code\s*dates?|pack(?:ed)?\s*dates?|production|sku|item|case|plu)\b/i;

/**
 * The barcode numbers a recall notice lists: digit groups after "UPC" (or "GTIN", "EAN",
 * "barcode"), up to where the lot numbers and dates start. "0 72830 12345 6" and "072830-123456"
 * both count.
 */
export function upcsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(UPC_LABEL)) {
    let rest = text.slice(m.index! + m[0].length, m.index! + m[0].length + 600);
    const end = rest.search(AFTER_UPCS);
    if (end >= 0) rest = rest.slice(0, end);
    // Codes are listed with commas, semicolons, slashes or "and" between them.
    // Inside one, a code may be split into groups ("0 72830 12345 6") and sit next to a size ("16 oz"),
    // so every run of neighboring groups that adds up to a barcode's length is kept. A wrong extra run
    // can't match a real package's barcode by chance.
    for (const chunk of rest.split(/[,;/&()]|\band\b|\bor\b|\n/i)) {
      const groups = chunk.match(/\d+/g) ?? [];
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].length > 14 && groups[i].length % 12 === 0) for (let k = 0; k < groups[i].length; k += 12) out.add(groups[i].slice(k, k + 12));
        let run = "";
        for (let j = i; j < groups.length && run.length < 14; j++) {
          run += groups[j];
          if (run.length >= 11 && run.length <= 14) out.add(run);
        }
      }
    }
  }
  return [...out].map(upcKey).filter((k) => k.length >= 10);
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
    const code = item.upc ? upcKey(item.upc) : "";
    const specific = mine.filter((w) => !COMMON.has(w));
    for (const recall of local) {
      const listed = recall.upcs ?? [];
      // The barcode on the recall is the barcode on the package: no need for the names to agree.
      if (code && listed.some((u) => sameUpc(u, code))) {
        out.push({ item, recall, strength: "likely", barcode: "match" });
        continue;
      }
      if (!mine.length) continue;
      const productWords = words(recall.product);
      const theirs = new Set([...productWords, ...words(recall.firm)]);
      if (!mine.every((w) => theirs.has(w))) continue;
      // One word ("Potatoes") must be what the product is (its last words, "Sourdough Bread"),
      // not just something it's named after ("Potato Sourdough Bread").
      if (mine.length === 1 && !productWords.slice(-2).includes(mine[0]) && !words(recall.firm).includes(mine[0])) continue;
      const strength = specific.length >= 1 || mine.length >= 2 ? "likely" : "possible";
      out.push({ item, recall, strength, ...(code && listed.length ? { barcode: "differs" as const } : {}) });
    }
  }
  // Barcode matches first, then most likely, then most serious; a different barcode goes last in its group.
  const cls = (r: Recall) => (/class i\b/i.test(r.classification) && !/class ii/i.test(r.classification) ? 0 : 1);
  const bar = (m: RecallMatch) => (m.barcode === "match" ? 0 : m.barcode === "differs" ? 2 : 1);
  return out.sort(
    (a, b) =>
      (a.barcode === "match" ? 0 : 1) - (b.barcode === "match" ? 0 : 1) ||
      (a.strength === b.strength ? 0 : a.strength === "likely" ? -1 : 1) ||
      bar(a) - bar(b) ||
      cls(a.recall) - cls(b.recall) ||
      b.recall.date.localeCompare(a.recall.date),
  );
}

/** A key for "I checked this one", so a dismissed match stays dismissed. */
export const matchKey = (m: RecallMatch) => `${m.recall.id}|${m.item.id}`;
