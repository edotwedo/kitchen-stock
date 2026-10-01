import { useCallback, useEffect, useRef, useState } from "react";
import { NoKitchen, Sharing, SignIn } from "./Account";
import { CookSheet } from "./CookSheet";
import { PrintView } from "./PrintView";
import { Reminders } from "./Reminders";
import { EditSheet, type SheetTarget } from "./EditSheet";
import { Settings } from "./Settings";
import { DayDot } from "./DayDot";
import { dayOf, dueTag } from "./format";
import { MenuIcon, PlusIcon, SearchIcon } from "./icons";
import { ImportError, importHousehold } from "./importData";
import { byDue, bySpot, byLevelThenName, daysUntil, isFrozen, isReminderDue, isShopping, isUseFirst, matchesQuery, nextLevel, toIso } from "./logic";
import { mergeList } from "./merge";
import { clearProblem, endDemo, exportJson, replaceHousehold, restockItems, restoreItem, restoreItems, saveItem, snapshot, startDemo, useApp } from "./store";
import { StoreRun } from "./StoreRun";
import { DEFAULT_FREEZER_DAYS, type Household, type Item, type Level } from "./types";

type Tab = { key: string; label: string; count: number; filter: (i: Item) => boolean; sort?: (a: Item, b: Item) => number; byLocation?: boolean };

const BARS: Record<Level, number> = { full: 3, half: 2, low: 1, out: 0 };

function readTab(): string {
  // A tapped reminder opens /?tab=first or /?tab=shop.
  const fromLink = new URLSearchParams(location.search).get("tab");
  if (fromLink === "first" || fromLink === "shop") {
    history.replaceState(null, "", location.pathname);
    return fromLink;
  }
  try {
    return localStorage.getItem("ks-tab") || "first";
  } catch {
    return "first";
  }
}

type Toast = { msg: string; undo?: () => void; n: number };
let toastCount = 0;

/** A short message at the top, with an Undo button when the change can be taken back. */
function useToast() {
  const [t, setT] = useState<Toast | null>(null);
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => setT(null), t.undo ? 5000 : 2000);
    return () => clearTimeout(timer);
  }, [t]);
  const show = useCallback((msg: string, undo?: () => void) => setT(msg ? { msg, undo, n: ++toastCount } : null), []);
  const el = t ? (
    <div className={"toast" + (t.undo ? " has-undo" : "")} role="status" key={t.n}>
      <span>{t.msg}</span>
      {t.undo && (
        <button
          type="button"
          onClick={() => {
            t.undo?.();
            setT({ msg: "Undone", n: ++toastCount });
          }}
        >
          Undo
        </button>
      )}
    </div>
  ) : null;
  return [el, show] as const;
}

export default function App() {
  const app = useApp();
  const h = app.household;
  const [tab, setTab] = useState(readTab);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [menu, setMenu] = useState(false);
  const [cook, setCook] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [storeRun, setStoreRun] = useState(false);
  const useFirstCount = h ? h.items.filter((i) => isUseFirst(i, h, new Date())).length : 0;

  // The installed app's icon shows how many things need using first (where the phone supports badges).
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge) return;
    (useFirstCount ? nav.setAppBadge(useFirstCount) : (nav.clearAppBadge?.() ?? Promise.resolve())).catch(() => {});
  }, [useFirstCount]);
  const [toastEl, toast] = useToast();
  const today = new Date();

  // Database problems surface as a toast, once.
  useEffect(() => {
    if (!app.problem) return;
    toast(app.problem);
    clearProblem();
  }, [app.problem, toast]);

  // The landing page's "Try the sample kitchen" opens /?demo. Only for visitors with
  // no kitchen of their own, and only once the sign-in check has settled.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("demo")) return;
    if (app.status === "loading") return;
    history.replaceState(null, "", location.pathname);
    if (app.status === "signed-out" || (app.status === "ready" && !h)) startDemo();
  }, [app.status, h]);

  if (app.status === "loading" && !h)
    return (
      <div className="wrap">
        <main className="welcome">
          <h1>Kitchen Stock</h1>
          <p>Loading your kitchen…</p>
        </main>
      </div>
    );
  if (app.status === "signed-out") return <SignIn />;
  if (app.status === "no-kitchen")
    return (
      <>
        <NoKitchen email={app.email} />
        {toastEl}
      </>
    );
  if (!h)
    return (
      <>
        <Welcome onDone={toast} />
        {toastEl}
      </>
    );

  const pickTab = (k: string) => {
    setTab(k);
    try {
      localStorage.setItem("ks-tab", k);
    } catch {
      /* not essential */
    }
  };

  const items = h.items;
  const baseTabs: Omit<Tab, "count">[] = [
    { key: "first", label: "Use first", filter: (i) => isUseFirst(i, h, today), sort: byDue(h) },
    { key: "shop", label: "Shopping", filter: isShopping, byLocation: true },
    ...h.locations.map((l) => ({ key: "loc:" + l.key, label: l.label, filter: (i: Item) => i.loc === l.key })),
    ...h.flags.map((f) => ({ key: "flag:" + f.id, label: f.label, filter: (i: Item) => i.flags.includes(f.id) })),
    { key: "all", label: "All", filter: () => true, byLocation: true },
  ];
  // A flag only earns a tab once something is tagged with it.
  const tabs: Tab[] = baseTabs.map((t) => ({ ...t, count: items.filter(t.filter).length })).filter((t) => !t.key.startsWith("flag:") || t.count > 0);
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const searching = query.trim() !== "";

  const step = (i: Item) => {
    const nx = nextLevel(i.level);
    saveItem(i.id, { level: nx });
    toast(`${i.name}: ${nx}`, () => restoreItem(i));
  };
  const restock = (i: Item) => {
    // A restocked freezer item is a new package, so its quality clock starts today.
    saveItem(i.id, { level: "full", remindOn: "", ...(isFrozen(i, h) ? { frozenOn: toIso(today) } : {}) });
    toast("Restocked " + i.name, () => restoreItem(i));
  };

  const visible = items.filter((i) => matchesQuery(i, query, h));
  const groups: { title: string; list: Item[]; showLoc: boolean }[] = [];
  if (searching) groups.push({ title: "Search results", list: visible, showLoc: true });
  else if (current.byLocation)
    for (const l of h.locations) groups.push({ title: l.label, list: visible.filter((i) => i.loc === l.key && current.filter(i)), showLoc: false });
  else groups.push({ title: current.key === "first" ? "Use these first" : current.label, list: visible.filter(current.filter), showLoc: !current.key.startsWith("loc:") });
  // A place's list reads in shelf order: grouped by spot, then the usual order.
  const inPlace = !searching && (current.byLocation || current.key.startsWith("loc:"));
  for (const g of groups) {
    const order = current.sort && !searching ? current.sort : byLevelThenName;
    g.list.sort(inPlace ? bySpot(order, h) : order);
  }
  const shown = groups.length > 1 ? groups.filter((g) => g.list.length) : groups;

  const due = items.filter((i) => isReminderDue(i, today)).sort((a, b) => a.remindOn.localeCompare(b.remindOn));
  const addLoc = current.key.startsWith("loc:") ? current.key.slice(4) : undefined;

  return (
    <div className="wrap">
      {app.demo && (
        <div className="demobar" role="status">
          <span>
            <strong>Demo kitchen.</strong> Try anything; nothing is saved.
          </span>
          <button className="btn" type="button" onClick={endDemo}>
            Exit demo
          </button>
        </div>
      )}
      <header className="head">
        <div className="titlebar">
          <h1 className="title">{app.cloud ? h.name : "Kitchen Stock"}</h1>
          {app.cloud && app.pending > 0 && (
            <span className={"sync" + (app.offline ? " off" : "")} role="status">
              {app.offline ? `Offline, ${app.pending} to sync` : "Saving…"}
            </span>
          )}
          <button className="iconbtn" type="button" aria-label="Kitchen settings" onClick={() => setMenu(true)}>
            <MenuIcon />
          </button>
        </div>
        <label className="search">
          <SearchIcon />
          <input type="search" placeholder={`Search ${items.length} items`} aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <nav className="chips" aria-label="Lists">
          {tabs.map((t) => (
            <button key={t.key} className="chip" type="button" aria-pressed={!searching && t.key === current.key} onClick={() => (setQuery(""), pickTab(t.key))}>
              {t.label}
              <span className="n">{t.count}</span>
            </button>
          ))}
        </nav>
      </header>

      {due.length > 0 && !searching && (
        <section className="remind" aria-label="Reminders">
          <h2>Reminders for today</h2>
          <ul>
            {due.map((i) => (
              <li key={i.id}>
                <button className="linkish" type="button" onClick={() => setSheet({ item: i })}>
                  {i.name}
                </button>
                <span>{[i.qty, i.level].filter(Boolean).join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <main>
        {current.key === "shop" && !searching && current.count > 0 && (
          <div className="cookbar">
            <p>
              <strong>Back from the store?</strong>
              Tick what you bought and restock it all at once.
            </p>
            <button className="btn" type="button" onClick={() => setStoreRun(true)}>
              Restock
            </button>
          </div>
        )}
        {current.key === "first" && !searching && (
          <div className="cookbar">
            <p>
              <strong>What can I cook?</strong>
              Meal ideas from what needs using first.
            </p>
            <button className="btn" type="button" onClick={() => setCook(true)}>
              Get ideas
            </button>
          </div>
        )}

        {shown.map((g) => (
          <section className="group" key={g.title}>
            <h2>
              <span>{g.title}</span>
              <span className="n">{g.list.length}</span>
            </h2>
            <div className="list">
              {g.list.length ? (
                g.list.map((i) => (
                  <Row key={i.id} item={i} h={h} today={today} showLoc={g.showLoc} shopping={current.key === "shop" && !searching} onStep={step} onRestock={restock} onOpen={() => setSheet({ item: i })} />
                ))
              ) : (
                <div className="empty">{emptyCopy(current.key, searching)}</div>
              )}
            </div>
          </section>
        ))}
      </main>

      <button className="fab" type="button" onClick={() => setSheet({ item: null, loc: addLoc })}>
        <PlusIcon />
        Add item
      </button>

      {storeRun && (
        <StoreRun
          h={h}
          onClose={() => setStoreRun(false)}
          onRestock={(picked) => {
            restockItems(picked.map((i) => i.id));
            setStoreRun(false);
            toast(`Restocked ${picked.length} ${picked.length === 1 ? "item" : "items"}`, () => restoreItems(picked));
          }}
        />
      )}
      {printing && <PrintView h={h} onClose={() => setPrinting(false)} />}
      {cook && <CookSheet h={h} onClose={() => setCook(false)} onDone={toast} />}
      {sheet && <EditSheet h={h} target={sheet} onClose={() => setSheet(null)} onSaved={toast} />}
      {menu && (
        <Settings
          h={h}
          onClose={() => setMenu(false)}
          sharing={app.cloud ? <Sharing app={app} /> : null}
          onPrint={() => (setMenu(false), setPrinting(true))}
          reminders={app.cloud ? <Reminders h={h} kitchenId={app.kitchenId} /> : null}
          backup={<BackupButtons onDone={toast} onLoaded={() => setMenu(false)} />}
        />
      )}
      {toastEl}
    </div>
  );
}

function emptyCopy(tab: string, searching: boolean): string {
  if (searching) return "Nothing matches that search.";
  if (tab === "first") return "Nothing needs using this week.";
  if (tab === "shop") return "Nothing is running low. Tap a gauge down to low and it shows up here.";
  return "Nothing here yet. Tap Add item to log the first one.";
}

function Gauge({ item, onStep }: { item: Item; onStep: (i: Item) => void }) {
  const lit = BARS[item.level];
  return (
    <button className={"gauge " + item.level} type="button" aria-label={`${item.name}: ${item.level}. Tap to step down`} onClick={() => onStep(item)}>
      <span className="bars">
        {[0, 1, 2].map((n) => (
          <i key={n} className={n < lit ? "on" : ""} />
        ))}
      </span>
      <small>{item.level}</small>
    </button>
  );
}

function Row(props: { item: Item; h: Household; today: Date; showLoc: boolean; shopping: boolean; onStep: (i: Item) => void; onRestock: (i: Item) => void; onOpen: () => void }) {
  const { item: i, h, today } = props;
  const tag = dueTag(i, h, today);
  // Like a kitchen's rotation stickers, the day dot is for this week's stock: it shows for 7 days after freezing.
  const frozenAgo = isFrozen(i, h) ? daysUntil(i.frozenOn, today) : null;
  const dot = frozenAgo !== null && frozenAgo <= 0 && frozenAgo > -7 ? dayOf(i.frozenOn) : null;
  const loc = h.locations.find((l) => l.key === i.loc);
  const flags = h.flags.filter((f) => i.flags.includes(f.id));
  const avoiders = h.people.filter((p) => p.avoids.some((a) => i.flags.includes(a)));
  const limiters = h.people.filter((p) => !avoiders.includes(p) && p.limits.some((a) => i.flags.includes(a)));
  const spot = i.spot?.trim();
  const hasMeta = (props.showLoc && loc) || spot || dot || tag || flags.length || i.note;
  return (
    <div className={"row " + i.level}>
      <Gauge item={i} onStep={props.onStep} />
      <div style={{ minWidth: 0 }}>
        <button className="linkish" type="button" onClick={props.onOpen}>
          {i.name}
        </button>
        {hasMeta && (
          <div className="meta">
            {dot && <DayDot day={dot} />}
            {props.showLoc && loc && <span className="tag">{spot ? `${loc.label}, ${spot}` : loc.label}</span>}
            {!props.showLoc && spot && <span className="tag spot">{spot}</span>}
            {tag && <span className={"tag " + tag.tone}>{tag.text}</span>}
            {flags.map((f) => (
              <span key={f.id} className="tag flag">
                {f.label}
              </span>
            ))}
            {avoiders.length > 0 && <span className="tag avoid">Not for {avoiders.map((p) => p.name).join(" or ")}</span>}
            {limiters.length > 0 && <span className="tag limit">Limit for {limiters.map((p) => p.name).join(" and ")}</span>}
            {i.note && <span>{i.note}</span>}
          </div>
        )}
      </div>
      {props.shopping ? (
        <button className="restock" type="button" onClick={() => props.onRestock(i)}>
          Restocked
        </button>
      ) : (
        <div className="qty">{i.qty}</div>
      )}
    </div>
  );
}

/** A hidden file picker that loads a list file: replacing the whole list, or adding to it. */
function useFilePicker(onDone: (msg: string) => void, mode: "replace" | "add" = "replace") {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept="application/json,.json"
      className="vh"
      tabIndex={-1}
      aria-label={mode === "add" ? "Choose a list file to add" : "Choose a list file to load"}
      onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        try {
          const raw = JSON.parse(await f.text());
          const current = snapshot().household;
          if (mode === "add" && current) {
            const { household, added, updated } = mergeList(current, raw);
            replaceHousehold(household);
            onDone(`Added ${added} and updated ${updated}`);
          } else {
            const h = importHousehold(raw);
            replaceHousehold(h);
            onDone(`Loaded ${h.items.length} items`);
          }
        } catch (err) {
          onDone(err instanceof ImportError ? err.message : "That file couldn't be read. Pick a .json list file.");
        }
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

function Welcome({ onDone }: { onDone: (msg: string) => void }) {
  const picker = useFilePicker(onDone);
  const startEmpty = () =>
    replaceHousehold({
      name: "My kitchen",
      locations: [
        { key: "fridge", label: "Fridge", kind: "fridge" },
        { key: "freezer", label: "Freezer", kind: "freezer" },
        { key: "pantry", label: "Pantry", kind: "pantry" },
      ],
      freezerDays: { ...DEFAULT_FREEZER_DAYS },
      flags: [],
      people: [],
      items: [],
    });
  return (
    <div className="wrap">
      <main className="welcome">
        <h1>Kitchen Stock</h1>
        <p>Know what's in the freezer, fridge and cupboards, what to use first, and what to buy.</p>
        <div className="stack">
          <button className="btn primary" type="button" onClick={picker.open}>
            Load a list file
          </button>
          <button className="btn" type="button" onClick={startEmpty}>
            Start with an empty kitchen
          </button>
          <button className="linkbtn try" type="button" onClick={startDemo}>
            Just looking? Try it with a sample kitchen
          </button>
        </div>
        {picker.input}
      </main>
    </div>
  );
}

function BackupButtons({ onDone, onLoaded }: { onDone: (msg: string) => void; onLoaded: () => void }) {
  const finish = (msg: string) => {
    onDone(msg);
    onLoaded();
  };
  const picker = useFilePicker(finish);
  const adder = useFilePicker(finish, "add");
  const [armed, setArmed] = useState(false);

  const backup = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([exportJson()], { type: "application/json" }));
    a.download = `kitchen-stock-${toIso(new Date())}.export.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    onDone("Backup saved to your downloads");
  };

  return (
    <div className="menu">
      <button className="btn" type="button" onClick={adder.open}>
        Add items from a file <small>Updates matches, adds the rest</small>
      </button>
      {adder.input}
      <button className="btn" type="button" onClick={backup}>
        Save a backup <small>Downloads a file</small>
      </button>
      <button
        className={"btn" + (armed ? " armed" : "")}
        type="button"
        onBlur={() => setArmed(false)}
        onClick={() => {
          if (!armed) return setArmed(true);
          setArmed(false);
          picker.open();
        }}
      >
        {armed ? "Tap again to replace your whole list" : "Load a list file"} <small>{armed ? "" : "Replaces this list"}</small>
      </button>
      {picker.input}
    </div>
  );
}
