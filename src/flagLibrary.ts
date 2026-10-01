import type { Flag, Item } from "./types";

/**
 * Ready-made dietary flags, each with words that hint an item contains it.
 * Matches are only ever suggestions: someone confirms before an item is tagged.
 */

export type FlagGroup = "Allergens" | "Religious & ethical" | "Health & diet";

export interface LibraryFlag {
  label: string;
  group: FlagGroup;
  /** Whole-word patterns (regex source) checked against item name and note. */
  words: string[];
  /** Phrases that look like a match but aren't (removed before matching). */
  not?: string[];
  /** Phrases that rule the flag out for the whole item, like "sugar-free". */
  veto?: string[];
}

export const FLAG_LIBRARY: LibraryFlag[] = [
  // The nine major US food allergens.
  { label: "Milk", group: "Allergens", words: ["milk", "cheeses?", "butter", "cream", "yogh?urts?", "whey", "casein", "ice cream", "sour cream", "parmesan", "mozzarella", "cheddar", "ricotta", "ghee", "custard", "latte", "alfredo", "queso"], not: ["peanut butter", "almond butter", "apple butter", "bread & butter", "bread and butter", "butter beans?", "cocoa butter", "(almond|oat|soy|coconut|rice|cashew) milk", "cream of tartar", "dairy-?free", "non-?dairy"] },
  { label: "Eggs", group: "Allergens", words: ["eggs?", "mayo", "mayonnaise", "meringue", "custard", "aioli", "egg noodles?", "quiche", "scramble"], not: ["eggplants?", "egg-?free", "vegan mayo"] },
  { label: "Peanuts", group: "Allergens", words: ["peanuts?", "pb", "peanut butter", "satay"] },
  { label: "Tree nuts", group: "Allergens", words: ["almonds?", "cashews?", "walnuts?", "pecans?", "pistachios?", "hazelnuts?", "macadamias?", "nutella", "pesto", "praline", "marzipan"], not: ["nut-?free"] },
  { label: "Fish", group: "Allergens", words: ["fish", "salmon", "tuna", "cod", "tilapia", "halibut", "anchov(y|ies)", "sardines?", "trout", "catfish", "pollock", "worcestershire", "fish sauce"] },
  { label: "Shellfish", group: "Allergens", words: ["shrimp", "prawns?", "crabs?", "lobsters?", "clams?", "oysters?", "scallops?", "mussels?", "crawfish", "calamari", "squid"] },
  { label: "Wheat", group: "Allergens", words: ["wheat", "flour", "bread", "buns?", "pasta", "noodles?", "spaghetti", "macaroni", "crackers?", "tortillas?", "pitas?", "bagels?", "croutons?", "couscous", "soy sauce", "teriyaki", "breaded", "pancakes?", "waffles?", "muffins?", "biscuits?", "cookies?", "cakes?", "pretzels?", "cereal"], not: ["gluten-?free", "rice noodles?", "rice cakes?", "corn tortillas?", "buckwheat", "bread (&|and) butter"] },
  { label: "Soy", group: "Allergens", words: ["soy", "soya", "tofu", "edamame", "miso", "tempeh", "soy sauce", "teriyaki", "tamari"] },
  { label: "Sesame", group: "Allergens", words: ["sesame", "tahini", "hummus", "everything bagel"] },

  // Religious and ethical.
  { label: "Pork", group: "Religious & ethical", words: ["pork", "bacon", "ham", "sausages?", "pepperoni", "salami", "prosciutto", "pancetta", "chorizo", "lard", "carnitas", "hot dogs?", "bratwurst", "kielbasa", "spam", "ribs", "pulled pork"], not: ["(turkey|chicken|beef) ([a-z]+ )?(bacon|ham|sausages?|pepperoni|chorizo|hot dogs?|links|patties)", "hot dog buns?", "hamburgers?"] },
  { label: "Alcohol", group: "Religious & ethical", words: ["beer", "wine", "vodka", "rum", "whiske?y", "bourbon", "tequila", "gin", "brandy", "liqueur", "sake", "mirin", "vanilla extract", "cooking wine", "sherry", "hard seltzer", "cider"] },
  { label: "Gelatin", group: "Religious & ethical", words: ["gelatin", "jell-?o", "gumm(y|ies)", "marshmallows?", "gummi"], not: ["marshmallow root"] },
  { label: "Beef", group: "Religious & ethical", words: ["beef", "steaks?", "chuck", "brisket", "sirloin", "ribeye", "rib eye", "burgers?", "hamburgers?", "meatballs?", "roast beef", "pot roast", "stew meat", "ground beef", "jerky", "corned beef", "pastrami", "veal", "oxtail"], not: ["steak sauce", "burger chips", "(veggie|plant-based|beyond|impossible) (burgers?|meatballs?)"] },
  { label: "Meat", group: "Religious & ethical", words: ["meat", "beef", "pork", "chicken", "turkey", "lamb", "veal", "bacon", "ham", "sausages?", "steaks?", "roast", "chuck", "brisket", "meatballs?", "jerky", "pepperoni", "salami", "duck", "venison", "goat", "chops?", "wings?", "drumsticks?", "thighs?"], not: ["steak sauce", "burger chips", "(veggie|plant-based|beyond|impossible) (burgers?|meatballs?)"] },

  // Health and diet.
  { label: "Gluten", group: "Health & diet", words: ["wheat", "barley", "rye", "malt", "flour", "bread", "buns?", "pasta", "noodles?", "spaghetti", "macaroni", "crackers?", "tortillas?", "pitas?", "bagels?", "croutons?", "couscous", "soy sauce", "teriyaki", "beer", "breaded", "pancakes?", "waffles?", "muffins?", "biscuits?", "cookies?", "cakes?", "pretzels?", "cereal", "seitan", "stuffing"], not: ["gluten-?free", "rice noodles?", "rice cakes?", "corn tortillas?", "buckwheat", "bread (&|and) butter"] },
  { label: "Added sugar", group: "Health & diet", words: ["sugar", "candy", "candies", "soda", "syrup", "jam", "jelly", "preserves", "cookies?", "cakes?", "brownies?", "donuts?", "doughnuts?", "ice cream", "chocolate", "caramel", "frosting", "sweetened", "honey", "molasses", "pop tarts?", "sweet tea", "juice", "bbq sauce", "ketchup", "popsicles?"], not: ["(lemon|lime) juice"], veto: ["sugar-?free", "zero sugar", "no-?sugar", "no added sugar", "sf", "unsweetened", "keto"] },
  { label: "Sweeteners", group: "Health & diet", words: ["sugar-?free", "diet", "zero sugar", "sucralose", "aspartame", "stevia", "monk fruit", "erythritol", "splenda", "keto", "allulose"] },
  { label: "Caffeine", group: "Health & diet", words: ["coffee", "espresso", "tea", "cola", "energy drinks?", "red bull", "monster", "matcha", "cold brew", "dark chocolate", "mountain dew", "pre-?workout"], not: ["herbal tea", "[a-z]+ root tea", "chamomile", "peppermint tea", "rooibos"], veto: ["decaf\w*", "caffeine-?free"] },
  { label: "High sodium", group: "Health & diet", words: ["soy sauce", "broth", "bouillon", "stock", "chips", "pretzels?", "pickles?", "jerky", "bacon", "ham", "salami", "pepperoni", "canned soup", "ramen", "instant noodles?", "cured", "salted", "brine"], not: ["salted caramel"], veto: ["low sodium", "no salt", "unsalted"] },
  { label: "Nightshades", group: "Health & diet", words: ["tomato(es)?", "potato(es)?", "peppers?", "paprika", "cayenne", "chili", "chile", "eggplant", "salsa", "ketchup", "marinara", "jalapeños?", "jalapenos?", "hash browns?", "fries", "wedges"] },
  { label: "Red meat", group: "Health & diet", words: ["beef", "steaks?", "pork", "lamb", "veal", "venison", "bison", "chuck", "brisket", "burgers?", "meatballs?", "roast", "ham", "bacon", "sausages?"], not: ["steak sauce", "burger chips", "(veggie|plant-based|beyond|impossible) (burgers?|meatballs?)", "(turkey|chicken|beef) ([a-z]+ )?(bacon|ham|sausages?|pepperoni|chorizo|hot dogs?|links|patties)", "hot dog buns?", "hamburgers?"] },
  { label: "Fried food", group: "Health & diet", words: ["fried", "fries", "tempura", "nuggets?", "tots", "crispy", "battered", "breaded"] },
];

export function libraryFor(label: string): LibraryFlag | undefined {
  const l = label.trim().toLowerCase();
  return FLAG_LIBRARY.find((f) => f.label.toLowerCase() === l);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Words to look for: the library's list, or for a custom flag, the flag's own name. */
export function wordsFor(flag: Flag): string[] {
  return libraryFor(flag.label)?.words ?? [escape(flag.label.trim().toLowerCase())];
}

const cache = new Map<string, RegExp>();
function matcher(flag: Flag): RegExp {
  const key = flag.label.toLowerCase();
  let re = cache.get(key);
  if (!re) {
    re = new RegExp(`(^|[^a-z])(${wordsFor(flag).join("|")})($|[^a-z])`, "i");
    cache.set(key, re);
  }
  return re;
}

const notCache = new Map<string, RegExp | null>();
function exclusions(flag: Flag): RegExp | null {
  const key = flag.label.toLowerCase();
  if (!notCache.has(key)) {
    const not = libraryFor(flag.label)?.not;
    notCache.set(key, not?.length ? new RegExp(`(${not.join("|")})`, "gi") : null);
  }
  return notCache.get(key)!;
}

export function mightContain(item: Pick<Item, "name" | "note">, flag: Flag): boolean {
  let text = item.name + " \n " + item.note;
  const not = exclusions(flag);
  if (not) text = text.replace(not, " ");
  const veto = libraryFor(flag.label)?.veto;
  if (veto?.length && new RegExp(`(^|[^a-z])(${veto.join("|")})($|[^a-z])`, "i").test(text)) return false;
  return matcher(flag).test(text);
}

/** Flags an item probably has but isn't tagged with yet. */
export function suggestFlags(item: Pick<Item, "name" | "note" | "flags">, flags: Flag[]): Flag[] {
  return flags.filter((f) => !item.flags.includes(f.id) && mightContain(item, f));
}

/** Items that might contain a flag and aren't tagged with it yet. */
export function findCandidates(items: Item[], flag: Flag): Item[] {
  return items.filter((i) => !i.flags.includes(flag.id) && mightContain(i, flag));
}
