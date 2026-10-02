import { byLevelThenName, isShopping } from "./logic";
import type { Household } from "./types";

/** The shopping list as plain text, grouped by place, for sending to whoever's going to the store. */
export function shoppingText(h: Household): string {
  const need = h.items.filter(isShopping).sort(byLevelThenName);
  if (!need.length) return "";
  const line = (i: (typeof need)[number]) => `- ${i.name}${i.level === "low" ? " (low)" : ""}${i.buy?.trim() ? `: ${i.buy.trim()}` : ""}`;
  const out = [`${h.name}: shopping list (${need.length})`];
  for (const l of h.locations) {
    const here = need.filter((i) => i.loc === l.key);
    if (!here.length) continue;
    out.push("", l.label);
    for (const i of here) out.push(line(i));
  }
  const placeless = need.filter((i) => !h.locations.some((l) => l.key === i.loc));
  if (placeless.length) out.push("", "Other", ...placeless.map(line));
  return out.join("\n");
}

