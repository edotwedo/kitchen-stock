import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { diff, fromRow, householdFrom, settingsOf, supabase, toRow, type HouseholdRow, type ItemRow } from "./cloud";
import { importHousehold } from "./importData";
import type { Household, Item } from "./types";

/**
 * The app's single source of truth. Every change goes through apply(): the screen
 * updates right away, and when signed in, just the changed rows are sent to the
 * shared database. Changes from other phones arrive over live sync.
 *
 * Without Supabase settings (tests, or a build with no database) the household
 * lives only in this browser, exactly as before.
 */

export type Status = "loading" | "signed-out" | "no-kitchen" | "ready";

export interface Kitchen {
  id: string;
  name: string;
  role: "owner" | "member";
}

export interface AppState {
  cloud: boolean;
  status: Status;
  email: string | null;
  kitchens: Kitchen[];
  kitchenId: string | null;
  household: Household | null;
  /** Something went wrong talking to the database; shown once, then cleared. */
  problem: string | null;
}

const LOCAL_KEY = "ks-household-v1";
const KITCHEN_KEY = "ks-kitchen";
const cacheKey = (id: string) => "ks-cache-v1-" + id;

const listeners = new Set<() => void>();
let app: AppState = {
  cloud: !!supabase,
  status: supabase ? "loading" : "ready",
  email: null,
  kitchens: [],
  kitchenId: null,
  household: supabase ? null : readJson(LOCAL_KEY),
  problem: null,
};
let channel: RealtimeChannel | null = null;

function readJson(k: string): Household | null {
  try {
    const s = localStorage.getItem(k);
    // Re-read through the importer so lists saved by older versions pick up new fields.
    return s ? importHousehold(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

function writeJson(k: string, h: Household | null) {
  try {
    if (h) localStorage.setItem(k, JSON.stringify(h));
    else localStorage.removeItem(k);
  } catch {
    // Storage full or blocked: keep working in memory.
  }
}

function set(patch: Partial<AppState>) {
  app = { ...app, ...patch };
  if ("household" in patch) {
    if (!app.cloud) writeJson(LOCAL_KEY, app.household);
    else if (app.kitchenId && app.household) writeJson(cacheKey(app.kitchenId), app.household);
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, () => app);
}

export function useHousehold(): Household | null {
  return useSyncExternalStore(subscribe, () => app.household);
}

export function clearProblem() {
  set({ problem: null });
}

// ---------- changes ----------

/** Show a change now, then save it. */
function apply(next: Household) {
  const before = app.household;
  set({ household: next });
  if (supabase && app.kitchenId && before) void push(app.kitchenId, before, next);
}

async function push(kitchenId: string, before: Household, after: Household) {
  if (!supabase) return;
  const { settingsChanged, upserts, deletes } = diff(before, after);
  const jobs: PromiseLike<{ error: unknown }>[] = [];
  if (settingsChanged) jobs.push(supabase.from("households").update({ name: after.name, settings: settingsOf(after) }).eq("id", kitchenId));
  if (upserts.length) jobs.push(supabase.from("items").upsert(upserts.map((i) => toRow(kitchenId, i))));
  if (deletes.length) jobs.push(supabase.from("items").delete().eq("household_id", kitchenId).in("id", deletes));
  const results = await Promise.all(jobs);
  if (results.some((r) => r.error)) {
    console.error("[KitchenStock] save failed", results.map((r) => r.error).filter(Boolean));
    set({ problem: "That change didn't save. Reloading the shared list." });
    await openKitchen(kitchenId);
  }
}

export function replaceHousehold(h: Household) {
  if (app.household) apply(h);
  else set({ household: h });
}

/** Apply a change from household.ts (people, flags, places, freezer days). */
export function updateHousehold(change: (h: Household) => Household) {
  if (app.household) apply(change(app.household));
}

export type ItemFields = Omit<Item, "id" | "updated" | "by">;

export function saveItem(id: string | null, patch: Partial<ItemFields>) {
  const h = app.household;
  if (!h) return;
  const updated = new Date().toISOString();
  const items = id
    ? h.items.map((i) => (i.id === id ? { ...i, ...patch, updated } : i))
    : [
        ...h.items,
        { name: "", loc: h.locations[0]?.key ?? "pantry", qty: "", level: "full", useBy: "", remindOn: "", frozenOn: "", wrap: "regular", note: "", flags: [], ...patch, id: crypto.randomUUID(), updated } as Item,
      ];
  apply({ ...h, items });
}

export function deleteItem(id: string) {
  const h = app.household;
  if (h) apply({ ...h, items: h.items.filter((i) => i.id !== id) });
}

/** The whole household as a downloadable JSON string (backup / move to another device). */
export function exportJson(): string {
  return JSON.stringify(app.household, null, 1);
}

/** A list saved on this device before signing in, if there is one. */
export function deviceList(): Household | null {
  return readJson(LOCAL_KEY);
}

// ---------- signing in ----------

export async function sendCode(email: string): Promise<string | null> {
  if (!supabase) return "No database is set up for this app.";
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  return error ? friendly(error.message) : null;
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  if (!supabase) return "No database is set up for this app.";
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ""), type: "email" });
  return error ? friendly(error.message) : null;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

function friendly(msg: string): string {
  if (/rate limit|too many/i.test(msg)) return "Too many emails sent. Wait a few minutes, then try again.";
  if (/expired|invalid/i.test(msg)) return "That code is wrong or expired. Check the newest email, or send a new code.";
  return msg;
}

// ---------- kitchens ----------

async function loadKitchens(session: Session) {
  if (!supabase) return;
  const { data, error } = await supabase.from("members").select("role, households(id, name)").eq("user_id", session.user.id);
  if (error) {
    set({ problem: "Couldn't reach the shared list. Check your connection.", status: app.household ? "ready" : "no-kitchen" });
    return;
  }
  const kitchens: Kitchen[] = (data ?? [])
    .map((r) => {
      const hh = r.households as unknown as { id: string; name: string } | null;
      return hh ? { id: hh.id, name: hh.name, role: r.role as Kitchen["role"] } : null;
    })
    .filter((k): k is Kitchen => !!k)
    .sort((a, b) => a.name.localeCompare(b.name));
  set({ kitchens, email: session.user.email ?? null });

  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(KITCHEN_KEY);
  } catch {
    /* not essential */
  }
  const pick = kitchens.find((k) => k.id === remembered) ?? (kitchens.length === 1 ? kitchens[0] : null) ?? kitchens[0] ?? null;
  if (pick) await openKitchen(pick.id);
  else set({ status: "no-kitchen", kitchenId: null, household: null });
}

export async function openKitchen(id: string) {
  if (!supabase) return;
  try {
    localStorage.setItem(KITCHEN_KEY, id);
  } catch {
    /* not essential */
  }
  // Show the last copy on this device right away, then load the real one.
  const cached = app.kitchenId === id ? app.household : readJson(cacheKey(id));
  set({ kitchenId: id, household: cached, status: cached ? "ready" : "loading" });

  const [hh, items] = await Promise.all([
    supabase.from("households").select("id, name, settings").eq("id", id).single(),
    supabase.from("items").select("*").eq("household_id", id).range(0, 4999),
  ]);
  if (hh.error || items.error) {
    set({ problem: "Couldn't load the shared list. Showing the last copy on this phone.", status: cached ? "ready" : "no-kitchen" });
    return;
  }
  if (app.kitchenId !== id) return; // switched kitchens while loading
  set({ household: householdFrom(hh.data as HouseholdRow, items.data as ItemRow[]), status: "ready" });
  listen(id);
}

/** Live sync: changes made on other phones show up here. */
function listen(id: string) {
  if (!supabase) return;
  if (channel) void supabase.removeChannel(channel);
  channel = supabase
    .channel("kitchen-" + id)
    .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `household_id=eq.${id}` }, (p) => {
      const h = app.household;
      if (!h || app.kitchenId !== id) return;
      if (p.eventType === "DELETE") {
        const gone = (p.old as Partial<ItemRow>).id;
        set({ household: { ...h, items: h.items.filter((i) => i.id !== gone) } });
        return;
      }
      const incoming = importHousehold({ items: [fromRow(p.new as ItemRow)] }).items[0];
      if (!incoming) return;
      const exists = h.items.some((i) => i.id === incoming.id);
      set({ household: { ...h, items: exists ? h.items.map((i) => (i.id === incoming.id ? incoming : i)) : [...h.items, incoming] } });
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "households", filter: `id=eq.${id}` }, (p) => {
      const h = app.household;
      if (!h || app.kitchenId !== id) return;
      const row = p.new as HouseholdRow;
      // Settings only: keep the same item objects so the next change doesn't resend every item.
      const settings = householdFrom(row, []);
      set({ household: { ...settings, items: h.items }, kitchens: app.kitchens.map((k) => (k.id === id ? { ...k, name: row.name } : k)) });
    })
    .subscribe();
}

/** Make a new shared kitchen, optionally starting from an existing list. */
export async function createKitchen(name: string, from: Household): Promise<string | null> {
  if (!supabase) return "No database is set up for this app.";
  const { data, error } = await supabase.from("households").insert({ name: name.trim() || from.name, settings: settingsOf(from) }).select("id").single();
  if (error || !data) return "Couldn't create the kitchen. Try again.";
  const id = (data as { id: string }).id;
  if (from.items.length) {
    const { error: e2 } = await supabase.from("items").upsert(from.items.map((i) => toRow(id, i)));
    if (e2) return "The kitchen was made, but the items didn't upload. Try loading the list file again from settings.";
  }
  const session = (await supabase.auth.getSession()).data.session;
  if (session) await loadKitchensThenOpen(session, id);
  return null;
}

export async function joinKitchen(code: string): Promise<string | null> {
  if (!supabase) return "No database is set up for this app.";
  const { data, error } = await supabase.rpc("join_household", { invite_code: code.trim() });
  if (error) return /wrong|used|expired/i.test(error.message) ? "That code is wrong, already used, or expired. Ask for a new one." : "Couldn't join. Try again.";
  const session = (await supabase.auth.getSession()).data.session;
  if (session) await loadKitchensThenOpen(session, data as string);
  return null;
}

async function loadKitchensThenOpen(session: Session, id: string) {
  try {
    localStorage.setItem(KITCHEN_KEY, id);
  } catch {
    /* not essential */
  }
  await loadKitchens(session);
}

/** A one-time code someone else can use to join this kitchen. */
export async function createInvite(): Promise<{ code?: string; error?: string }> {
  if (!supabase || !app.kitchenId) return { error: "Sign in first." };
  const { data, error } = await supabase.from("invites").insert({ household_id: app.kitchenId }).select("code").single();
  if (error || !data) return { error: "Only the kitchen's owner can make invite codes." };
  return { code: (data as { code: string }).code };
}

// ---------- start up ----------

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session) {
      if (channel) void supabase!.removeChannel(channel);
      set({ status: "signed-out", email: null, kitchens: [], kitchenId: null, household: null });
      return;
    }
    // Token refreshes, and the "signed in" event some browsers repeat when the tab
    // comes back into focus, don't need a reload.
    if (event === "SIGNED_IN" && app.status === "ready" && app.email === session.user.email) return;
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") setTimeout(() => void loadKitchens(session), 0);
  });
}
