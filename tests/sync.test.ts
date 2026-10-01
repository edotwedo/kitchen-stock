// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared-list sync, against a fake database that can lose signal, come back,
 * or refuse a change. (The real database can't be reached from tests.)
 */
const db = vi.hoisted(() => {
  const state = {
    mode: "ok" as "ok" | "offline" | "refuse",
    sent: [] as { table: string; op: string; payload: unknown }[],
    household: { id: "hh", name: "Test kitchen", settings: { locations: [{ key: "fridge", label: "Fridge", kind: "fridge" }] } },
    items: [] as Record<string, unknown>[],
  };
  const answer = (table: string, op: string, payload: unknown) => {
    state.sent.push({ table, op, payload });
    if (state.mode === "offline") return Promise.resolve({ error: { message: "TypeError: Failed to fetch" }, status: 0, data: null });
    if (state.mode === "refuse") return Promise.resolve({ error: { message: "row-level security", code: "42501" }, status: 403, data: null });
    return Promise.resolve({ error: null, status: 200, data: null });
  };
  const from = (table: string) => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve(state.mode === "offline" ? { error: { message: "Failed to fetch" }, status: 0, data: null } : { error: null, data: state.household }),
        range: () => Promise.resolve(state.mode === "offline" ? { error: { message: "Failed to fetch" }, status: 0, data: null } : { error: null, data: state.items }),
      }),
    }),
    upsert: (rows: unknown) => answer(table, "upsert", rows),
    update: (v: unknown) => ({ eq: () => answer(table, "update", v) }),
    delete: () => ({ eq: () => ({ in: (_c: string, ids: unknown) => answer(table, "delete", ids) }) }),
  });
  const channel = { on: () => channel, subscribe: () => channel };
  const client = {
    from,
    channel: () => channel,
    removeChannel: () => Promise.resolve(),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  };
  return { state, client };
});

vi.mock("../src/cloud", async (orig) => ({ ...(await orig<typeof import("../src/cloud")>()), supabase: db.client }));

const row = (id: string, level = "full") => ({
  household_id: "hh", id, name: id, loc: "fridge", qty: "", level, use_by: null, remind_on: null, frozen_on: null, wrap: "regular", note: "", flags: [], updated_at: "2026-10-01T00:00:00Z",
});

async function freshStore() {
  vi.resetModules();
  return import("../src/store");
}

beforeEach(() => {
  localStorage.clear();
  db.state.mode = "ok";
  db.state.sent = [];
  db.state.items = [row("milk"), row("eggs")];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const settle = async () => {
  await vi.advanceTimersByTimeAsync(500);
};

describe("syncing the shared list", () => {
  it("sends a change after a short pause, batching quick taps", async () => {
    const s = await freshStore();
    await s.openKitchen("hh");
    expect(s.snapshot().household?.items).toHaveLength(2);
    s.saveItem("milk", { level: "half" });
    s.saveItem("milk", { level: "low" });
    s.saveItem("eggs", { level: "out" });
    expect(s.snapshot().pending).toBe(2);
    await settle();
    const ups = db.state.sent.filter((x) => x.op === "upsert");
    expect(ups).toHaveLength(1);
    expect((ups[0].payload as { id: string; level: string }[]).map((r) => `${r.id}:${r.level}`).sort()).toEqual(["eggs:out", "milk:low"]);
    expect(s.snapshot().pending).toBe(0);
  });

  it("keeps changes made with no signal and sends them when back online", async () => {
    const s = await freshStore();
    await s.openKitchen("hh");
    db.state.mode = "offline";
    s.saveItem("milk", { level: "low" });
    await settle();
    expect(s.snapshot().offline).toBe(true);
    expect(s.snapshot().pending).toBe(1);
    expect(s.snapshot().household?.items.find((i) => i.id === "milk")?.level).toBe("low");
    expect(localStorage.getItem("ks-outbox-v1-hh")).toContain('"low"');

    // Signal returns: the waiting change goes up before the shared copy comes down.
    db.state.mode = "ok";
    db.state.sent = [];
    db.state.items = [row("milk", "low"), row("eggs")];
    await s.openKitchen("hh");
    expect(db.state.sent[0]).toMatchObject({ op: "upsert" });
    expect(s.snapshot().pending).toBe(0);
    expect(s.snapshot().offline).toBe(false);
  });

  it("survives the app being closed while offline", async () => {
    let s = await freshStore();
    await s.openKitchen("hh");
    db.state.mode = "offline";
    s.deleteItem("eggs");
    await settle();
    expect(s.snapshot().pending).toBe(1);

    // Reopen the app later, back online.
    db.state.mode = "ok";
    db.state.sent = [];
    s = await freshStore();
    await s.openKitchen("hh");
    expect(db.state.sent).toEqual([{ table: "items", op: "delete", payload: ["eggs"] }]);
    expect(s.snapshot().pending).toBe(0);
  });

  it("drops a change the database refuses and reloads the true list", async () => {
    const s = await freshStore();
    await s.openKitchen("hh");
    db.state.mode = "refuse";
    s.saveItem("milk", { level: "out" });
    await settle();
    db.state.mode = "ok";
    await vi.runOnlyPendingTimersAsync();
    expect(s.snapshot().pending).toBe(0);
    expect(s.snapshot().household?.items.find((i) => i.id === "milk")?.level).toBe("full");
  });
});
