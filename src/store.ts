import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { diff, fromRow, householdFrom, settingsOf, supabase, toRow, type HouseholdRow, type ItemRow } from "./cloud";
import { importHousehold } from "./importData";
import { emptyOutbox, isEmpty, isOffline, record, settle, size, type Outbox } from "./outbox";
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
  userId: string | null;
  kitchens: Kitchen[];
  kitchenId: string | null;
  household: Household | null;
  /** Something went wrong talking to the database; shown once, then cleared. */
  problem: string | null;
  /** Changes on this phone that haven't reached the shared list yet. */
  pending: number;
  /** The last send failed for lack of signal. */
  offline: boolean;
}

const LOCAL_KEY = "ks-household-v1";
const KITCHEN_KEY = "ks-kitchen";
const KITCHENS_KEY = "ks-kitchens";
const cacheKey = (id: string) => "ks-cache-v1-" + id;
const outboxKey = (id: string) => "ks-outbox-v1-" + id;

const listeners = new Set<() => void>();
let app: AppState = {
  cloud: !!supabase,
  status: supabase ? "loading" : "ready",
  email: null,
  userId: null,
  kitchens: [],
  kitchenId: null,
  household: supabase ? null : readJson(LOCAL_KEY),
  problem: null,
  pending: 0,
  offline: false,
};
let channel: RealtimeChannel | null = null;
let outbox: Outbox = emptyOutbox();
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

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

/** The current state, outside React (tests, debugging). */
export function snapshot(): AppState {
  return app;
}

export function clearProblem() {
  set({ problem: null });
}

// ---------- changes ----------

/** Show a change now, queue it, and send it shortly (quick taps go out together). */
function apply(next: Household) {
  const before = app.household;
  set({ household: next });
  if (!supabase || !app.kitchenId || !before) return;
  const { settingsChanged, upserts, deletes } = diff(before, next);
  const id = app.kitchenId;
  setOutbox(
    record(outbox, {
      settings: settingsChanged ? { name: next.name, settings: settingsOf(next) } : undefined,
      upserts: upserts.map((i) => toRow(id, i)),
      deletes,
    }),
  );
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), 400);
}

function setOutbox(o: Outbox) {
  outbox = o;
  if (app.kitchenId) {
    try {
      if (isEmpty(o)) localStorage.removeItem(outboxKey(app.kitchenId));
      else localStorage.setItem(outboxKey(app.kitchenId), JSON.stringify(o));
    } catch {
      /* the in-memory copy still gets sent */
    }
  }
  set({ pending: size(o) });
}

function loadOutbox(id: string): Outbox {
  try {
    const s = localStorage.getItem(outboxKey(id));
    return s ? (JSON.parse(s) as Outbox) : emptyOutbox();
  } catch {
    return emptyOutbox();
  }
}

/** Send what's waiting. Returns true when nothing is left waiting. */
async function flush(): Promise<boolean> {
  const kitchenId = app.kitchenId;
  if (!supabase || !kitchenId || isEmpty(outbox)) return isEmpty(outbox);
  if (flushing) return false;
  flushing = true;
  const sent = outbox;
  const jobs: PromiseLike<{ error: unknown; status?: number }>[] = [];
  if (sent.settings) jobs.push(supabase.from("households").update(sent.settings).eq("id", kitchenId));
  const rows = Object.values(sent.upserts);
  if (rows.length) jobs.push(supabase.from("items").upsert(rows));
  if (sent.deletes.length) jobs.push(supabase.from("items").delete().eq("household_id", kitchenId).in("id", sent.deletes));
  let results: { error: unknown; status?: number }[];
  try {
    results = await Promise.all(jobs);
  } catch (e) {
    results = [{ error: e, status: 0 }];
  }
  flushing = false;
  if (app.kitchenId !== kitchenId) return false;

  const failed = results.filter((r) => r.error);
  if (failed.some(isOffline)) {
    // No signal: keep everything and try again when the phone is back online.
    set({ offline: true });
    return false;
  }
  setOutbox(settle(outbox, sent));
  set({ offline: false });
  if (failed.length) {
    console.error("[KitchenStock] save refused", failed.map((r) => r.error));
    set({ problem: "That change didn't save. Reloading the shared list." });
    await openKitchen(kitchenId);
    return false;
  }
  if (!isEmpty(outbox)) return flush();
  return true;
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
  set({ email: session.user.email ?? null, userId: session.user.id });
  const remembered = readString(KITCHEN_KEY);
  const { data, error } = await supabase.from("members").select("role, households(id, name)").eq("user_id", session.user.id);
  if (error) {
    // No signal at start-up: open the kitchen this phone used last, from its saved copy.
    const saved = readKitchens();
    if (remembered && readJson(cacheKey(remembered))) {
      set({ kitchens: saved });
      await openKitchen(remembered);
    } else {
      // Stay on "loading" rather than offering to set up a new kitchen; back online retries.
      set({ problem: "No signal. Your kitchen will load when you're back online.", status: app.household ? "ready" : "loading" });
    }
    return;
  }
  const kitchens: Kitchen[] = (data ?? [])
    .map((r) => {
      const hh = r.households as unknown as { id: string; name: string } | null;
      return hh ? { id: hh.id, name: hh.name, role: r.role as Kitchen["role"] } : null;
    })
    .filter((k): k is Kitchen => !!k)
    .sort((a, b) => a.name.localeCompare(b.name));
  set({ kitchens });
  try {
    localStorage.setItem(KITCHENS_KEY, JSON.stringify(kitchens));
  } catch {
    /* not essential */
  }

  const pick = kitchens.find((k) => k.id === remembered) ?? kitchens[0] ?? null;
  if (pick) await openKitchen(pick.id);
  else set({ status: "no-kitchen", kitchenId: null, household: null });
}

function readString(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function readKitchens(): Kitchen[] {
  try {
    return JSON.parse(localStorage.getItem(KITCHENS_KEY) ?? "[]") as Kitchen[];
  } catch {
    return [];
  }
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
  if (app.kitchenId !== id) outbox = loadOutbox(id);
  set({ kitchenId: id, household: cached, status: cached ? "ready" : "loading", pending: size(outbox) });

  // Changes made here while offline go up before the shared copy comes down.
  if (!(await flush()) && !isEmpty(outbox)) {
    set({ problem: "No signal. Your changes are saved on this phone and will sync when you're back online." });
    listen(id);
    return;
  }

  const [hh, items] = await Promise.all([
    supabase.from("households").select("id, name, settings").eq("id", id).single(),
    supabase.from("items").select("*").eq("household_id", id).range(0, 4999),
  ]);
  if (hh.error || items.error) {
    // With no copy on this phone, keep "loading" (not "set up a kitchen", which could
    // lead to a duplicate kitchen); coming back online retries.
    set({ problem: cached ? "Couldn't load the shared list. Showing the last copy on this phone." : "No signal. Your kitchen will load when you're back online." });
    return;
  }
  if (app.kitchenId !== id) return; // switched kitchens while loading
  if (!isEmpty(outbox)) {
    // Something was changed while loading: keep this phone's copy and send it first.
    void flush();
    listen(id);
    return;
  }
  set({ household: householdFrom(hh.data as HouseholdRow, items.data as ItemRow[]), status: "ready", offline: false });
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
      const touched = ((p.new as Partial<ItemRow>)?.id ?? (p.old as Partial<ItemRow>)?.id) as string | undefined;
      // A change still waiting to be sent from this phone wins over the echo.
      if (touched && (touched in outbox.upserts || outbox.deletes.includes(touched))) return;
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
      // A settings change still waiting to be sent from this phone wins over the echo.
      if (outbox.settings) return;
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

// ---------- people in a kitchen (database update 0002) ----------

export interface Member {
  userId: string;
  email: string;
  role: "owner" | "member";
}

const NEEDS_UPDATE = "Run database update 0002 in Supabase to manage who's in a kitchen.";

/** The database doesn't have update 0002 yet (a missing function or column). */
function missingUpdate(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "PGRST202" || error.code === "PGRST204" || error.code === "42703" || /could not find the (function|.*column)/i.test(error.message ?? ""));
}

/** A one-time code someone else can use to join this kitchen, as a member or as an owner. */
export async function createInvite(role: Member["role"] = "member"): Promise<{ code?: string; error?: string }> {
  if (!supabase || !app.kitchenId) return { error: "Sign in first." };
  // Member invites leave the role out, so they still work before database update 0002.
  const row: { household_id: string; role?: Member["role"] } = { household_id: app.kitchenId };
  if (role === "owner") row.role = "owner";
  const { data, error } = await supabase.from("invites").insert(row).select("code").single();
  if (missingUpdate(error)) return { error: NEEDS_UPDATE };
  if (error || !data) return { error: "Only the kitchen's owner can make invite codes." };
  return { code: (data as { code: string }).code };
}

export async function listMembers(): Promise<{ members?: Member[]; error?: string }> {
  if (!supabase || !app.kitchenId) return { error: "Sign in first." };
  const { data, error } = await supabase.rpc("household_members", { h: app.kitchenId });
  if (missingUpdate(error)) return { error: NEEDS_UPDATE };
  if (error) return { error: "Couldn't load who's in this kitchen." };
  return { members: (data as { user_id: string; email: string; role: Member["role"] }[]).map((r) => ({ userId: r.user_id, email: r.email, role: r.role })) };
}

export async function setMemberRole(userId: string, role: Member["role"]): Promise<string | null> {
  if (!supabase || !app.kitchenId) return "Sign in first.";
  const { error } = await supabase.rpc("set_member_role", { h: app.kitchenId, member: userId, new_role: role });
  if (missingUpdate(error)) return NEEDS_UPDATE;
  if (error) return /at least one owner/i.test(error.message) ? "A kitchen needs at least one owner." : "Only an owner can change that.";
  if (userId === app.userId) await refreshKitchens();
  return null;
}

/** Remove someone (owners only), or leave the kitchen yourself when no one is given. */
export async function removeMember(userId?: string): Promise<string | null> {
  if (!supabase || !app.kitchenId) return "Sign in first.";
  const { error } = await supabase.rpc("leave_household", { h: app.kitchenId, member: userId ?? null });
  if (missingUpdate(error)) return NEEDS_UPDATE;
  if (error) return /at least one owner/i.test(error.message) ? "Make someone else an owner before you leave." : "Couldn't do that. Try again.";
  if (!userId || userId === app.userId) {
    try {
      localStorage.removeItem(KITCHEN_KEY);
    } catch {
      /* not essential */
    }
    await refreshKitchens();
  }
  return null;
}

async function refreshKitchens() {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (session) await loadKitchens(session);
}

// ---------- start up ----------

if (supabase && typeof window !== "undefined") {
  // Back online: send what's waiting, then pick up anything others changed.
  window.addEventListener("online", () => {
    if (app.kitchenId) void openKitchen(app.kitchenId);
    else if (app.email) void refreshKitchens();
  });
  // A slow retry in case the browser never says it's back online.
  setInterval(() => {
    if (!isEmpty(outbox) && !flushing) void flush();
  }, 30_000);
}

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session) {
      if (channel) void supabase!.removeChannel(channel);
      set({ status: "signed-out", email: null, userId: null, kitchens: [], kitchenId: null, household: null });
      return;
    }
    // Token refreshes, and the "signed in" event some browsers repeat when the tab
    // comes back into focus, don't need a reload.
    if (event === "SIGNED_IN" && app.status === "ready" && app.email === session.user.email) return;
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") setTimeout(() => void loadKitchens(session), 0);
  });
}
