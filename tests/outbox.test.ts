import { describe, expect, it } from "vitest";
import type { ItemRow } from "../src/cloud";
import { emptyOutbox, isEmpty, isOffline, record, settle, size } from "../src/outbox";

const row = (id: string, level = "full"): ItemRow => ({
  household_id: "hh", id, name: id, loc: "fridge", qty: "", level, use_by: null, remind_on: null, frozen_on: null, wrap: "regular", note: "", flags: [],
});

describe("outbox", () => {
  it("keeps only the newest version of each item", () => {
    let o = record(emptyOutbox(), { upserts: [row("a", "half")] });
    o = record(o, { upserts: [row("a", "low"), row("b")] });
    expect(Object.keys(o.upserts)).toEqual(["a", "b"]);
    expect(o.upserts.a.level).toBe("low");
    expect(size(o)).toBe(2);
  });

  it("a delete cancels a waiting save, and a save after a delete brings it back", () => {
    let o = record(emptyOutbox(), { upserts: [row("a")] });
    o = record(o, { deletes: ["a"] });
    expect(o.upserts).toEqual({});
    expect(o.deletes).toEqual(["a"]);
    o = record(o, { upserts: [row("a")] });
    expect(o.deletes).toEqual([]);
    expect(Object.keys(o.upserts)).toEqual(["a"]);
  });

  it("settling keeps changes made while a send was in flight", () => {
    const sent = record(emptyOutbox(), { upserts: [row("a", "half"), row("b")], settings: { name: "K", settings: {} } });
    const during = record(sent, { upserts: [row("a", "low")] }); // tapped again mid-send
    const left = settle(during, sent);
    expect(Object.keys(left.upserts)).toEqual(["a"]);
    expect(left.upserts.a.level).toBe("low");
    expect(left.settings).toBe(null);
    expect(isEmpty(settle(sent, sent))).toBe(true);
  });

  it("tells no-signal failures from refusals", () => {
    expect(isOffline({ error: { message: "TypeError: Failed to fetch" }, status: 0 })).toBe(true);
    expect(isOffline({ error: { message: "Load failed" } })).toBe(true);
    expect(isOffline({ error: { message: "new row violates row-level security policy", code: "42501" }, status: 403 })).toBe(false);
    expect(isOffline({ error: null, status: 201 })).toBe(false);
  });
});
