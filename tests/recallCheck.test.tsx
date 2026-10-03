import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadRecalls } from "../src/recallCheck";
import { RecallSheet } from "../src/RecallSheet";
import { findRecallMatches, fromFda } from "../src/recalls";
import type { Item } from "../src/types";

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("loading recalls", () => {
  it("reads FDA results", async () => {
    const r = await loadRecalls(new Date(2026, 9, 2), reply(200, { results: [{ recall_number: "F-9", report_date: "20260901", product_description: "Tillamook Cheddar, Net Wt 2 lb", distribution_pattern: "WA" }] }));
    expect(r.map((x) => [x.id, x.product])).toEqual([["F-9", "Tillamook Cheddar"]]);
  });
  it("no results (FDA answers 404) means no recalls, and no signal never breaks the app", async () => {
    expect(await loadRecalls(new Date(), reply(404, { error: "No matches found" }))).toEqual([]);
    expect(await loadRecalls(new Date(), (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toEqual([]);
  });
});

describe("the recall sheet", () => {
  it("lists likely matches first, with what to check and how to dismiss", () => {
    const item = (name: string): Item => ({ id: name, name, loc: "fridge", qty: "", level: "full", useBy: "", remindOn: "", frozenOn: "", wrap: "regular", note: "", flags: [], updated: "" });
    const recalls = fromFda([
      { recall_number: "F-1", report_date: "20260920", recalling_firm: "Tillamook", product_description: "Tillamook Sharp Cheddar, Net Wt 2 lb", reason_for_recall: "Undeclared egg", classification: "Class II", distribution_pattern: "WA" },
      { recall_number: "F-2", report_date: "20260921", recalling_firm: "Bakery", product_description: "Bread 24 oz", reason_for_recall: "Mold", classification: "Class II", distribution_pattern: "Nationwide" },
    ]);
    const matches = findRecallMatches({ items: [item("Bread"), item("Tillamook sharp cheddar")] }, recalls);
    const html = renderToStaticMarkup(<RecallSheet matches={matches} onCheck={() => {}} onClose={() => {}} />);
    expect(html.indexOf("Tillamook sharp cheddar")).toBeLessThan(html.indexOf("Also check"));
    expect(html).toContain("Undeclared egg");
    expect(html).toContain("I checked, it&#x27;s not mine");
  });
});
