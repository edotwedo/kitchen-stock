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
    session: null as null | { user: { id: string; email: string } },
    updated: false, // has database update 0002 been run?
    members: [] as { user_id: string; email: string; role: string }[],
  };
  const missing = (what: string) => ({ error: { code: "PGRST202", message: `Could not find the function ${what}` }, data: null, status: 404 });
  const answer = (table: string, op: string, payload: unknown) => {
    state.sent.push({ table, op, payload });
    if (state.mode === "offline") return Promise.resolve({ error: { message: "TypeError: Failed to fetch" }, status: 0, data: null });
    if (state.mode === "refuse") return Promise.resolve({ error: { message: "row-level security", code: "42501" }, status: 403, data: null });
    return Promise.resolve({ error: null, status: 200, data: null });
  };
  const offlineRead = { error: { message: "Failed to fetch" }, status: 0, data: null };
  const from = (table: string) => ({
    select: () => ({
      eq: () => ({
        // members list: awaited straight after .eq()
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          Promise.resolve(state.mode === "offline" ? offlineRead : { error: null, data: [{ role: "owner", households: { id: "hh", name: state.household.name } }] }).then(ok, bad),
        single: () => Promise.resolve(state.mode === "offline" ? { error: { message: "Failed to fetch" }, status: 0, data: null } : { error: null, data: state.household }),
        range: () => Promise.resolve(state.mode === "offline" ? { error: { message: "Failed to fetch" }, status: 0, data: null } : { error: null, data: state.items }),
      }),
    }),
    upsert: (rows: unknown) => answer(table, "upsert", rows),
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: () => {
          state.sent.push({ table, op: "insert", payload: row });
          if (!state.updated && "role" in row) return Promise.resolve({ error: { code: "PGRST204", message: "Could not find the 'role' column of 'invites'" }, data: null });
          return Promise.resolve({ error: null, data: { code: "a1b2c3d4e5f6" } });
        },
      }),
    }),
    update: (v: unknown) => ({ eq: () => answer(table, "update", v) }),
    delete: () => ({ eq: () => ({ in: (_c: string, ids: unknown) => answer(table, "delete", ids) }) }),
  });
  const channel = { on: () => channel, subscribe: () => channel };
  const client = {
    from,
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.sent.push({ table: "rpc", op: fn, payload: args });
      if (!state.updated) return Promise.resolve(missing(fn));
      if (fn === "household_members") return Promise.resolve({ error: null, data: state.members });
      return Promise.resolve({ error: null, data: null });
    },
    channel: () => channel,
    removeChannel: () => Promise.resolve(),
    auth: {
      getSession: () => Promise.resolve({ data: { session: state.session }, error: null }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        if (state.session) cb("INITIAL_SESSION", state.session);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
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
  db.state.session = null;
  db.state.updated = false;
  db.state.members = [];
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

  it("opens the last kitchen from the phone's copy when started with no signal", async () => {
    db.state.session = { user: { id: "u1", email: "cook@example.com" } };
    let s = await freshStore();
    await vi.runOnlyPendingTimersAsync(); // signed in: kitchens load
    expect(s.snapshot().status).toBe("ready");
    expect(s.snapshot().household?.items).toHaveLength(2);

    // Next morning, in the garage, no signal.
    db.state.mode = "offline";
    s = await freshStore();
    await vi.runOnlyPendingTimersAsync();
    expect(s.snapshot().status).toBe("ready");
    expect(s.snapshot().household?.name).toBe("Test kitchen");
    expect(s.snapshot().kitchens.map((k) => k.name)).toEqual(["Test kitchen"]);
  });

  it("explains what to run when database update 0002 is missing, without breaking member invites", async () => {
    const s = await freshStore();
    await s.openKitchen("hh");
    expect(await s.listMembers()).toEqual({ error: "Run database update 0002 in Supabase to manage who's in a kitchen." });
    expect((await s.createInvite("owner")).error).toContain("database update 0002");
    expect(await s.createInvite("member")).toEqual({ code: "a1b2c3d4e5f6" });
    expect(db.state.sent.filter((x) => x.op === "insert").map((x) => x.payload)).toEqual([{ household_id: "hh", role: "owner" }, { household_id: "hh" }]);
  });

  it("lists members and hands a kitchen over once the update is in", async () => {
    db.state.updated = true;
    db.state.members = [
      { user_id: "u1", email: "organizer@example.com", role: "owner" },
      { user_id: "u2", email: "client@example.com", role: "member" },
    ];
    const s = await freshStore();
    await s.openKitchen("hh");
    expect((await s.listMembers()).members?.map((m) => `${m.email}:${m.role}`)).toEqual(["organizer@example.com:owner", "client@example.com:member"]);
    expect(await s.setMemberRole("u2", "owner")).toBe(null);
    expect(db.state.sent.at(-1)).toEqual({ table: "rpc", op: "set_member_role", payload: { h: "hh", member: "u2", new_role: "owner" } });
  });

  it("on a new phone with no signal, waits instead of offering to set up a new kitchen", async () => {
    db.state.session = { user: { id: "u1", email: "cook@example.com" } };
    db.state.mode = "offline";
    const s = await freshStore();
    await vi.runOnlyPendingTimersAsync();
    expect(s.snapshot().status).toBe("loading");
    expect(s.snapshot().problem).toContain("No signal");

    db.state.mode = "ok";
    window.dispatchEvent(new Event("online"));
    await vi.runOnlyPendingTimersAsync();
    expect(s.snapshot().status).toBe("ready");
    expect(s.snapshot().household?.items).toHaveLength(2);
  });

  it("demo mode sends nothing, keeps the real kitchen untouched, and exits back to it", async () => {
    const s = await freshStore();
    await s.openKitchen("hh");
    db.state.sent = [];
    s.startDemo();
    expect(s.snapshot().demo).toBe(true);
    expect(s.snapshot().household?.name).toBe("Sample kitchen");
    const first = s.snapshot().household!.items[0];
    s.saveItem(first.id, { level: "out" });
    s.deleteItem(s.snapshot().household!.items[1].id);
    await settle();
    expect(db.state.sent).toEqual([]); // nothing reached the database
    expect(localStorage.getItem("ks-cache-v1-hh")).not.toContain("Sample kitchen");
    s.endDemo();
    expect(s.snapshot().demo).toBe(false);
    expect(s.snapshot().household?.name).toBe("Test kitchen");
    expect(s.snapshot().kitchenId).toBe("hh");
  });
});
