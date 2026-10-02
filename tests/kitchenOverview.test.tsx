// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, toIso } from "../src/logic";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Settings, Sharing, "Your kitchens": an organizer with several client kitchens sees how each
 * is doing, from one query for the kitchens and one (paged) for their items. Fake database.
 */
const db = vi.hoisted(() => {
  type Q = { table: string; cols: string; filters: Record<string, unknown>; range: [number, number] | null; single: boolean };
  const state = {
    offlineOverview: false,
    queries: [] as Q[],
    households: [] as { id: string; name: string; settings: Record<string, unknown> }[],
    items: [] as Record<string, unknown>[],
    session: { user: { id: "me", email: "phil@example.com" } },
  };
  const fail = { error: { message: "Failed to fetch" }, status: 0, data: null };
  const answer = (q: Q) => {
    state.queries.push(q);
    if (q.table === "members") return { error: null, data: state.households.map((h, n) => ({ role: n === 1 ? "member" : "owner", households: { id: h.id, name: h.name } })) };
    const inList = Object.values(q.filters).find(Array.isArray) as string[] | undefined;
    if (inList && state.offlineOverview) return fail;
    if (q.table === "households") {
      const rows = state.households.filter((h) => (inList ? inList.includes(h.id) : h.id === q.filters.id));
      return { error: null, data: q.single ? rows[0] : rows };
    }
    const rows = state.items.filter((r) => (inList ? inList.includes(r.household_id as string) : r.household_id === q.filters.household_id));
    const [a, z] = q.range ?? [0, rows.length];
    // Like the real database: at most 1000 rows per request, whatever range is asked for.
    return { error: null, data: rows.slice(a, Math.min(z + 1, a + 1000)) };
  };
  const from = (table: string) => {
    const q: Q = { table, cols: "", filters: {}, range: null, single: false };
    const b = {
      select: (c: string) => ((q.cols = c), b),
      eq: (k: string, v: unknown) => ((q.filters[k] = v), b),
      in: (k: string, v: unknown[]) => ((q.filters[k] = v), b),
      order: () => b,
      range: (a: number, z: number) => ((q.range = [a, z]), b),
      single: () => ((q.single = true), b),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer(q)).then(ok, bad),
    };
    return b;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  const client = {
    from,
    rpc: () => Promise.resolve({ error: null, data: [{ user_id: "me", email: "phil@example.com", role: "owner" }] }),
    channel: () => channel,
    removeChannel: () => Promise.resolve(),
    auth: {
      getSession: () => Promise.resolve({ data: { session: state.session }, error: null }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        cb("INITIAL_SESSION", state.session);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  };
  return { state, client };
});

vi.mock("../src/cloud", async (orig) => ({ ...(await orig<typeof import("../src/cloud")>()), supabase: db.client }));

const day = (n: number) => addDays(toIso(new Date()), n);
const places = (counted: Record<string, string>) => ({
  locations: [
    { key: "fridge", label: "Fridge", kind: "fridge", ...(counted.fridge ? { counted: counted.fridge } : {}) },
    { key: "freezer", label: "Freezer", kind: "freezer", ...(counted.freezer ? { counted: counted.freezer } : {}) },
  ],
});
let seq = 0;
const item = (household_id: string, loc: string, level: string, use_by: string | null = null, frozen_on: string | null = null) => ({
  household_id, id: `i${seq++}`, name: "x", loc, qty: "", level, use_by, remind_on: null, frozen_on, wrap: "regular", note: "", flags: [],
});

beforeEach(() => {
  localStorage.clear();
  db.state.offlineOverview = false;
  db.state.queries = [];
  db.state.households = [
    { id: "home", name: "Home", settings: places({ fridge: day(-3), freezer: day(-3) }) },
    { id: "garcia", name: "The Garcias", settings: places({ fridge: day(-14) }) },
    { id: "adams", name: "Adams", settings: places({ fridge: day(-2), freezer: day(-21) }) },
  ];
  db.state.items = [
    item("home", "fridge", "full", day(2)),
    item("garcia", "fridge", "half", day(1)),
    item("garcia", "freezer", "full", day(-30), day(-100)), // freezer clock: 90 days, past
    item("garcia", "fridge", "out", day(0)), // out: shopping, not use first
    item("adams", "fridge", "low"),
    // A big pantry: enough rows to need more than one page.
    ...Array.from({ length: 2300 }, () => item("adams", "freezer", "full", null, day(-1))),
  ];
  localStorage.setItem("ks-kitchen", "home");
});

async function settingsPage() {
  vi.resetModules();
  const store = await import("../src/store");
  const { Sharing } = await import("../src/Account");
  await vi.waitFor(() => expect(store.snapshot().status).toBe("ready"));
  const root = document.createElement("div");
  document.body.append(root);
  await act(async () => createRoot(root).render(<Sharing app={store.snapshot()} />));
  return { root, store };
}

const rowsOf = (root: HTMLElement) => [...root.querySelectorAll(".kitchen")].map((r) => r.textContent ?? "");

describe("your kitchens overview", () => {
  it("shows each kitchen's use first, shopping and oldest count, busiest first", async () => {
    const { root } = await settingsPage();
    await vi.waitFor(() => expect(root.querySelector(".kitchen .glance")?.textContent).not.toContain("Loading"));
    const rows = rowsOf(root);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/^The Garcias.*2 use first · 1 on the shopping list.*Freezer never counted.*member.*Open/);
    expect(rows[1]).toMatch(/^Home \(open now\).*1 use first · 0 on the shopping list.*Fridge last counted 3 days ago.*owner/);
    expect(rows[1]).not.toContain("Open");
    expect(rows[2]).toMatch(/^Adams.*0 use first · 1 on the shopping list.*Freezer last counted 3 weeks ago/);
  });

  it("asks for the kitchens once and the items in pages, only the columns it needs", async () => {
    const { root } = await settingsPage();
    await vi.waitFor(() => expect(rowsOf(root)[0]).toContain("use first"));
    const overview = db.state.queries.filter((q) => Object.values(q.filters).some(Array.isArray));
    const hh = overview.filter((q) => q.table === "households");
    const items = overview.filter((q) => q.table === "items");
    expect(hh).toHaveLength(1);
    expect(items.map((q) => q.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(items[0].cols).toBe("household_id, level, use_by, frozen_on, wrap, loc");
    // The open kitchen comes from this phone's copy, so it isn't asked for again.
    expect(items[0].filters.household_id).toEqual(["adams", "garcia"]);
  });

  it("without signal, shows the names (and this kitchen from the phone's copy) with a note", async () => {
    db.state.offlineOverview = true;
    const { root } = await settingsPage();
    await vi.waitFor(() => expect(root.textContent).toContain("Showing names only"));
    const rows = rowsOf(root);
    expect(rows[0]).toMatch(/^Home \(open now\).*1 use first/);
    expect(rows.slice(1).map((r) => r.replace(/(owner|member)Open$/, ""))).toEqual(["Adams", "The Garcias"]);
  });

  it("Open switches to that kitchen", async () => {
    const { root, store } = await settingsPage();
    const open = root.querySelector<HTMLButtonElement>('button[aria-label="Open The Garcias"]')!;
    await act(async () => open.click());
    await vi.waitFor(() => expect(store.snapshot().kitchenId).toBe("garcia"));
  });

  it("isn't shown with just one kitchen", async () => {
    db.state.households = db.state.households.slice(0, 1);
    const { root } = await settingsPage();
    expect(root.querySelector(".kitchens")).toBeNull();
    expect(root.textContent).not.toContain("Your kitchens");
  });
});
