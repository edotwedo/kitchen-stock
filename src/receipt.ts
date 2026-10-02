import { nameKey } from "./merge";
import type { Household, Item, LocationKind } from "./types";

/**
 * Turns the text read off a grocery receipt into a list of food lines, each matched to
 * something already in the kitchen (restock it) or proposed as a new item (add it).
 * Receipts are written in shorthand ("GV 2% MLK GAL"), so words are expanded first.
 */

export interface ReceiptLine {
  raw: string; // the line as printed
  name: string; // the cleaned-up name to show and save
  match: Item | null; // something already in the kitchen
  kind: LocationKind; // where a new item probably goes
}

// Receipt shorthand -> words. Store brands are dropped (""), since they aren't part of the food's name.
const WORDS: Record<string, string> = {
  gv: "", ks: "", kirk: "", kirkland: "", grt: "", val: "", hny: "honey", mkt: "", mrkt: "", sig: "", slct: "", ss: "", tj: "", tjs: "",
  org: "organic", orgnc: "organic", nat: "natural", frz: "frozen", frzn: "frozen", fz: "frozen", frsh: "fresh",
  mlk: "milk", mk: "milk", whl: "whole", wh: "whole", gal: "", hg: "", hlf: "half", hf: "half", hnh: "half and half",
  chs: "cheese", chse: "cheese", chd: "cheddar", chdr: "cheddar", cheddr: "cheddar", mozz: "mozzarella", mzrla: "mozzarella", shrd: "shredded", shred: "shredded",
  ygrt: "yogurt", yog: "yogurt", ygt: "yogurt", grk: "greek", btr: "butter", bttr: "butter", crm: "cream", sr: "sour", srcrm: "sour cream", ccrm: "cream cheese",
  egg: "eggs", eggs: "eggs", lrg: "large", lg: "large", dz: "", doz: "", ct: "",
  chkn: "chicken", chk: "chicken", ckn: "chicken", brst: "breast", brs: "breast", thgh: "thighs", thg: "thighs", bnls: "boneless", sknls: "skinless", bls: "boneless", skl: "skinless",
  grd: "ground", gr: "ground", grnd: "ground", bf: "beef", bef: "beef", pk: "pork", prk: "pork", chp: "chops", chps: "chips", stk: "steak", stks: "steaks",
  bcn: "bacon", sau: "sausage", ssg: "sausage", saus: "sausage", hm: "ham", trky: "turkey", tky: "turkey", dli: "deli", slmn: "salmon", salm: "salmon", shrmp: "shrimp", tlpa: "tilapia",
  brd: "bread", bred: "bread", whwt: "whole wheat", wht: "wheat", bgl: "bagels", bgls: "bagels", trtla: "tortillas", tort: "tortillas", trt: "tortillas",
  bnna: "bananas", ban: "bananas", bnn: "bananas", appl: "apples", app: "apples", aple: "apples", grp: "grapes", grps: "grapes", strwb: "strawberries", strw: "strawberries", blub: "blueberries", blbry: "blueberries",
  avo: "avocados", avoc: "avocado", lmn: "lemons", lim: "limes", orng: "oranges", ornge: "oranges", pot: "potatoes", pots: "potatoes", russ: "russet",
  tom: "tomatoes", toms: "tomatoes", onn: "onions", oni: "onions", onion: "onions", ltc: "lettuce", lttc: "lettuce", rom: "romaine", spn: "spinach", spin: "spinach", bby: "baby",
  brcl: "broccoli", broc: "broccoli", crt: "carrots", crts: "carrots", cuke: "cucumber", cuc: "cucumber", pepr: "peppers", ppr: "peppers", grlc: "garlic", cel: "celery", mshrm: "mushrooms", mush: "mushrooms",
  pea: "peas", peas: "peas", crn: "corn", veg: "vegetables", vgtbl: "vegetables", mxd: "mixed", mx: "mixed",
  oj: "orange juice", jce: "juice", jc: "juice", cf: "coffee", cof: "coffee", cff: "coffee", grnd2: "", crl: "cereal", cer: "cereal", oat: "oats", oatml: "oatmeal",
  psta: "pasta", spag: "spaghetti", spgti: "spaghetti", rce: "rice", rc: "rice", bns: "beans", blk: "black", pnt: "pinto", pb: "peanut butter", jly: "jelly",
  flr: "flour", sgr: "sugar", oil: "oil", olv: "olive", evoo: "olive oil", vin: "vinegar", sp: "soup", brth: "broth", stck: "stock", sce: "sauce", sauc: "sauce", tom2: "",
  ktchp: "ketchup", ktch: "ketchup", myo: "mayo", mayo: "mayo", mstrd: "mustard", mus: "mustard", rnch: "ranch", drsg: "dressing", drs: "dressing", sls: "salsa",
  cky: "cookies", ckys: "cookies", crk: "crackers", crkr: "crackers", ice: "ice", icecrm: "ice cream", pza: "pizza", piz: "pizza", wtr: "water", sda: "soda",
};

// Lines that are never food: totals, payment, store info, dates, loyalty, deposits.
const NOT_FOOD =
  /\b(sub ?total|total|tax|balance|change|cash|credit|debit|visa|mastercard|amex|discover|card|tend(er)?|payment|approv|auth|ref|account|acct|member|savings|you saved|coupon|discount|reward|points|bottle dep|crv|bag fee|bags?\b|thank|receipt|store|manager|phone|tel|www|\.com|survey|items? sold|qty|price|regular price|cashier|register|lane|trans|invoice|st#|op#|te#|tr#)\b/i;

const MONEY = /-?\$?\d+\.\d{2}\s*[A-Z]{0,2}\s*$/; // trailing price, often with a tax flag ("3.98 F", "4.29 N")
const LOOKS_LIKE_DATE = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}:\d{2}\b/;

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9%\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** "GV 2% MLK GAL" -> "2% milk"; "KS ORG BBY SPN" -> "organic baby spinach". */
export function expand(raw: string): string {
  const out: string[] = [];
  for (const w of words(raw)) {
    if (/\d{5,}/.test(w)) continue; // product codes, sometimes with a flag stuck on ("000000004011KF")
    if (/^\d+(oz|lb|ct|pk|g|kg|ml|l)$/.test(w) || /^(oz|lb|lbs|ct|pk|ea|each)$/.test(w)) continue; // sizes
    if (/^\d+$/.test(w)) continue; // stray numbers (quantities, codes)
    const e = w in WORDS ? WORDS[w] : w;
    if (e) out.push(...e.split(" "));
  }
  // Drop repeats ("milk milk") and keep it readable.
  return out.filter((w, i) => out.indexOf(w) === i).join(" ");
}

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(And|Of|With)\b/g, (m) => m.toLowerCase());

const FROZEN = /\b(frozen|ice cream|pizza|peas)\b/;
const COLD = /\b(milk|cheese|cheddar|mozzarella|yogurt|butter|cream|eggs|chicken|beef|pork|steak|bacon|sausage|ham|turkey|deli|salmon|shrimp|tilapia|lettuce|romaine|spinach|broccoli|carrots|celery|cucumber|peppers|mushrooms|grapes|strawberries|blueberries|juice|salsa|tortillas|ranch|dressing|hot dogs)\b/;

/** Where a new item probably goes. */
export function guessPlace(name: string): LocationKind {
  if (FROZEN.test(name)) return "freezer";
  if (COLD.test(name)) return "fridge";
  return "pantry";
}

/** How well two names match, 0 to 1: the share of the shorter name's words found in the other. */
function similarity(a: string, b: string): number {
  const x = nameKey(a).split(" ").filter((w) => w.length > 1);
  const y = nameKey(b).split(" ").filter((w) => w.length > 1);
  if (!x.length || !y.length) return 0;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const hit = short.filter((w) => long.some((v) => v === w || (w.length > 3 && v.startsWith(w)) || (v.length > 3 && w.startsWith(v)))).length;
  return hit / short.length;
}

/** The kitchen item this receipt line most likely is, if any. */
export function bestMatch(h: Household, name: string): Item | null {
  let best: Item | null = null;
  let score = 0;
  for (const i of h.items) {
    const s = similarity(name, i.name);
    // Prefer an item that's low or out (that's what was being bought) when two match equally.
    const tie = s === score && best && (i.level === "low" || i.level === "out") && !(best.level === "low" || best.level === "out");
    if (s > score || tie) {
      best = i;
      score = s;
    }
  }
  return score >= 0.6 ? best : null;
}

/** Read receipt text into food lines, merging repeats ("MILK" twice is one line). */
export function parseReceipt(text: string, h: Household): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length < 3) continue;
    if (NOT_FOOD.test(line) || LOOKS_LIKE_DATE.test(line)) continue;
    const body = line.replace(MONEY, "").trim();
    if (!/[a-z]{2}/i.test(body)) continue; // only numbers or symbols left
    // A food line almost always has a price on it; without one it's a heading or a wrapped description.
    if (!MONEY.test(line)) continue;
    const name = expand(body);
    if (name.replace(/[^a-z]/g, "").length < 3) continue;
    if (out.some((o) => nameKey(o.name) === nameKey(name))) continue;
    const match = bestMatch(h, name);
    out.push({ raw: line, name: match ? match.name : title(name), match, kind: guessPlace(name) });
  }
  return out;
}
