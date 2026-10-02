import { addDays, toIso } from "./logic";
import { DEFAULT_FREEZER_DAYS, type Household, type Item, type Level, type Wrap } from "./types";

/**
 * A made-up sample kitchen for trying the app before signing in. It's clearly labelled
 * as a demo, never saved, and dated relative to today so Use first always has something in it.
 */
export function sampleKitchen(today = new Date()): Household {
  const t = toIso(today);
  const d = (n: number) => addDays(t, n);
  let n = 0;
  const item = (name: string, loc: string, qty: string, level: Level, extra: Partial<Item> = {}): Item => ({
    id: "demo-" + ++n,
    name,
    loc,
    qty,
    level,
    useBy: "",
    remindOn: "",
    frozenOn: "",
    wrap: "regular" as Wrap,
    note: "",
    flags: [],
    updated: today.toISOString(),
    ...extra,
  });

  return {
    name: "Sample kitchen",
    locations: [
      { key: "fridge", label: "Fridge", kind: "fridge" },
      { key: "freezer", label: "Freezer", kind: "freezer" },
      { key: "pantry", label: "Pantry", kind: "pantry" },
    ],
    freezerDays: { ...DEFAULT_FREEZER_DAYS },
    flags: [
      { id: "pork", label: "Pork" },
      { id: "added-sugar", label: "Added sugar" },
      { id: "peanuts", label: "Peanuts" },
    ],
    people: [
      { id: "demo-sam", name: "Sam", avoids: ["pork"], limits: [] },
      { id: "demo-alex", name: "Alex", avoids: ["peanuts"], limits: ["added-sugar"] },
      { id: "demo-jo", name: "Jo", avoids: [], limits: [] },
    ],
    items: [
      // Fridge
      item("Greek yogurt", "fridge", "32 oz", "half", { useBy: d(1), spot: "Top shelf" }),
      item("Baby spinach", "fridge", "1 bag", "full", { useBy: d(2), spot: "Crisper" }),
      item("Leftover chili", "fridge", "1 container", "half", { useBy: d(0), note: "Made Sunday", spot: "Top shelf" }),
      item("Shredded cheddar", "fridge", "8 oz", "low", { useBy: d(9) }),
      item("Eggs", "fridge", "1 dozen", "half", { useBy: d(18) }),
      item("Milk", "fridge", "1 gallon", "low", { useBy: d(4), spot: "Door" }),
      item("Bacon", "fridge", "1 lb", "full", { useBy: d(6), flags: ["pork"] }),
      item("Ketchup", "fridge", "bottle", "low", { flags: ["added-sugar"], spot: "Door" }),
      item("Sour cream", "fridge", "16 oz", "full", { useBy: d(-2) }),
      // Freezer
      item("Ground beef", "freezer", "2 lb", "full", { frozenOn: d(-2), wrap: "vacuum" }),
      item("Chicken thighs", "freezer", "3 lb", "full", { frozenOn: d(-40) }),
      item("Pork chops", "freezer", "4 chops", "half", { frozenOn: d(-85), flags: ["pork"] }),
      item("Salmon fillets", "freezer", "2 fillets", "full", { frozenOn: d(-20), wrap: "vacuum" }),
      item("Frozen peas", "freezer", "1 bag", "low", { frozenOn: d(-60) }),
      item("Vanilla ice cream", "freezer", "1 tub", "half", { frozenOn: d(-15), flags: ["added-sugar"] }),
      // Pantry
      item("Basmati rice", "pantry", "5 lb bag", "half"),
      item("Spaghetti", "pantry", "2 boxes", "full"),
      item("Peanut butter", "pantry", "1 jar", "low", { flags: ["peanuts"] }),
      item("Black beans", "pantry", "4 cans", "full"),
      item("Olive oil", "pantry", "1 bottle", "half"),
      item("Coffee", "pantry", "12 oz", "out", { buy: "whole bean, the big bag" }),
      item("Maple syrup", "pantry", "bottle", "full", { flags: ["added-sugar"] }),
    ],
  };
}
