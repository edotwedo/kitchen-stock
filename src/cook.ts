import { fmtDate } from "./format";
import { byDue, daysUntil, dueDate, isUseFirst, toIso } from "./logic";
import type { Household, Item } from "./types";

/**
 * "What can I cook?": a question to paste into any AI chat app, built from what
 * needs using first, what else is on hand, and the rules of whoever is eating.
 * No AI runs inside the app, so it costs nothing.
 */

export type Meal = "any" | "breakfast" | "lunch" | "dinner";

const flagLabel = (h: Household, id: string) => h.flags.find((f) => f.id === id)?.label.toLowerCase() ?? id;

function line(i: Item, h: Household): string {
  const due = dueDate(i, h);
  const loc = h.locations.find((l) => l.key === i.loc)?.label;
  const bits = [i.qty, i.level !== "full" ? `${i.level} left` : "", loc];
  if (due) bits.push(due.kind === "quality" ? `frozen, best by ${fmtDate(due.date, true)}` : `use by ${fmtDate(due.date, true)}`);
  return `- ${i.name}${bits.filter(Boolean).length ? ` (${bits.filter(Boolean).join(", ")})` : ""}`;
}

export function buildCookPrompt(h: Household, eaterIds: string[], meal: Meal, today: Date): string {
  const eaters = h.people.filter((p) => eaterIds.includes(p.id));
  const avoided = new Set(eaters.flatMap((p) => p.avoids));
  // Never suggest cooking with food past its use-by date. (Frozen food past its quality
  // date is still safe, so it stays in.)
  const isPast = (i: Item) => {
    const due = dueDate(i, h);
    const d = due?.kind === "useBy" ? daysUntil(due.date, today) : null;
    return d !== null && d < 0;
  };
  const past = h.items.filter((i) => i.level !== "out" && isPast(i));
  const usable = h.items.filter((i) => i.level !== "out" && !isPast(i) && !i.flags.some((f) => avoided.has(f)));
  const first = usable.filter((i) => isUseFirst(i, h, today)).sort(byDue(h));
  const rest = usable.filter((i) => !first.includes(i)).sort((a, b) => a.loc.localeCompare(b.loc) || a.name.localeCompare(b.name));

  const who = eaters.length ? `${eaters.length === 1 ? "1 person" : `${eaters.length} people`} (${eaters.map((p) => p.name).join(", ")})` : "us";
  const mealWord = { any: "meals", breakfast: "breakfasts", lunch: "lunches", dinner: "dinners" }[meal];
  const out: string[] = [];
  out.push(`Suggest 3 ${mealWord} I can make for ${who} from what's in my kitchen. Today is ${fmtDate(toIso(today), true)}.`);
  out.push("");
  out.push("Build them around the items that need using first. Use what's on hand, and keep extra shopping to a few common items. Only use people food (skip anything like pet food). For each idea give the name, which of my items it uses, and short steps.");

  const rules: string[] = [];
  for (const id of avoided) {
    const who = eaters.filter((p) => p.avoids.includes(id)).map((p) => p.name).join(" and ");
    rules.push(`- No ${flagLabel(h, id)} at all (${who} can't have it). I've left tagged items out, but check the rest too.`);
  }
  const limited = new Set(eaters.flatMap((p) => p.limits).filter((id) => !avoided.has(id)));
  for (const id of limited) {
    const names = eaters.filter((p) => p.limits.includes(id)).map((p) => p.name);
    rules.push(`- Go easy on ${flagLabel(h, id)} (${names.join(" and ")} ${names.length > 1 ? "are" : "is"} limiting it).`);
  }
  if (rules.length) {
    out.push("", "Rules:", ...rules);
  }

  out.push("", "Use these first:", ...(first.length ? first.map((i) => line(i, h)) : ["- Nothing is due this week."]));
  if (past.length) out.push(`(I've left out ${past.length} ${past.length === 1 ? "item" : "items"} past ${past.length === 1 ? "its" : "their"} use-by date.)`);
  out.push("", "Also on hand:", ...rest.map((i) => line(i, h)));
  return out.join("\n");
}
