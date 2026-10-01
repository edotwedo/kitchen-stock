import { useEffect, useMemo, useRef, useState } from "react";
import { EditSheet, type SheetTarget } from "./EditSheet";
import { ImportError, importHousehold } from "./importData";
import {
  byLevelThenName,
  byUseBy,
  daysUntil,
  isReminderDue,
  isShopping,
  isUseFirst,
  matchesQuery,
  nextLevel,
} from "./logic";
import { exportJson, replaceHousehold, saveItem, useHousehold } from "./store";
import type { Household, Item } from "./types";

const FILL = { full: 100, half: 55, low: 22, out: 0 };

type Tab = { key: string; label: string; count: number; filter: (i: Item) => boolean; sort?: (a: Item, b: Item) => number; byLocation?: boolean };

function readTab(): string {
  try {
    return localStorage.getItem("ks-tab") || "first";
  } catch {
    return "first";
  }
}

function fmt(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

export default function App() {
  const h = useHousehold();
  const [tab, setTab] = useState(readTab);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [toast, setToast] = useState("");
  const today = new Date();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const pickTab = (k: string) => {
    setTab(k);
    try {
      localStorage.setItem("ks-tab", k);
    } catch {
      /* not essential */
    }
  };

  if (!h) return <Welcome onLoaded={(msg) => setToast(msg)} toast={toast} />;

  const items = h.items;
  const baseTabs: Omit<Tab, "count">[] = [
    { key: "first", label: "Use first", filter: (i) => isUseFirst(i, today), sort: byUseBy },
    { key: "shop", label: "Shopping", filter: isShopping, byLocation: true },
    ...h.locations.map((l) => ({ key: "loc:" + l.key, label: l.label, filter: (i: Item) => i.loc === l.key })),
    ...h.flags.map((f) => ({ key: "flag:" + f.id, label: f.label, filter: (i: Item) => i.flags.includes(f.id) })),
    { key: "all", label: "All", filter: () => true, byLocation: true },
  ];
  const tabs: Tab[] = baseTabs.map((t) => ({ ...t, count: items.filter(t.filter).length }));
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];

  const step = (i: Item) => {
    const nx = nextLevel(i.level);
    saveItem(i.id, { level: nx });
    setToast(`${i.name} → ${nx}`);
  };
  const restock = (i: Item) => {
    saveItem(i.id, { level: "full", remindOn: "" });
    setToast("Restocked " + i.name);
  };

  const visible = items.filter((i) => matchesQuery(i, query));
  const groups: { title: string; list: Item[]; showLoc: boolean }[] = [];
  if (query.trim()) groups.push({ title: "Search results", list: visible, showLoc: true });
  else if (current.byLocation)
    for (const l of h.locations) groups.push({ title: l.label, list: visible.filter((i) => i.loc === l.key && current.filter(i)), showLoc: false });
  else groups.push({ title: current.key === "first" ? "Use these first" : current.label, list: visible.filter(current.filter), showLoc: !current.key.startsWith("loc:") });
  for (const g of groups) g.list.sort(current.sort && !query.trim() ? current.sort : byLevelThenName);
  const shown = groups.length > 1 ? groups.filter((g) => g.list.length) : groups;

  const due = items.filter((i) => isReminderDue(i, today)).sort((a, b) => a.remindOn.localeCompare(b.remindOn));

  return (
    <div className="wrap">
      <header>
        <div className="top">
          <div>
            <h1>Kitchen Stock</h1>
            <div className="sub">
              {items.length} items · {h.locations.map((l) => l.label.toLowerCase()).join(" · ")}
            </div>
          </div>
          <div className="actions">
            <button className="btn primary" type="button" onClick={() => setSheet({ item: null, loc: current.key.startsWith("loc:") ? current.key.slice(4) : undefined })}>
              Add item
            </button>
          </div>
        </div>
        <nav className="tabs" aria-label="Where">
          {tabs.map((t) => (
            <button key={t.key} className="tab" type="button" aria-pressed={t.key === current.key} onClick={() => pickTab(t.key)}>
              {t.label}
              <span className="n">{t.count}</span>
            </button>
          ))}
        </nav>
        <input className="search" type="search" placeholder="Search everything" aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </header>

      {due.length > 0 && (
        <div className="banner" role="region" aria-label="Reminders">
          <h2>Reminders due</h2>
          <ul>
            {due.map((i) => (
              <li key={i.id}>
                <button className="name" type="button" onClick={() => setSheet({ item: i })}>
                  {i.name}
                </button>
                {" — "}
                {i.qty ? i.qty + ", " : ""}
                {i.level}
              </li>
            ))}
          </ul>
        </div>
      )}

      <main>
        {shown.map((g) => (
          <section className="group" key={g.title}>
            <h2>
              <span>{g.title}</span>
              <span>{g.list.length}</span>
            </h2>
            <div className="list">
              {g.list.length ? (
                g.list.map((i) => (
                  <Row key={i.id} item={i} h={h} today={today} showLoc={g.showLoc} shopping={current.key === "shop" && !query.trim()} onStep={step} onRestock={restock} onOpen={() => setSheet({ item: i })} />
                ))
              ) : (
                <div className="empty">{emptyCopy(current.key, query)}</div>
              )}
            </div>
          </section>
        ))}
      </main>

      <p className="note">Tap the gauge to step an item down (full → half → low → out). Tap a name to edit it. Low and out items land on the Shopping list.</p>
      <BackupTools onDone={setToast} />

      {sheet && <EditSheet h={h} target={sheet} onClose={() => setSheet(null)} onSaved={setToast} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function emptyCopy(tab: string, query: string): string {
  if (query.trim()) return "Nothing matches that search.";
  if (tab === "first") return "Nothing needs using this week.";
  if (tab === "shop") return "Nothing is running low. Tap a gauge down to low to add it here.";
  return "Nothing here yet. Add the first item.";
}

function Row(props: { item: Item; h: Household; today: Date; showLoc: boolean; shopping: boolean; onStep: (i: Item) => void; onRestock: (i: Item) => void; onOpen: () => void }) {
  const { item: i, h, today } = props;
  const d = daysUntil(i.useBy, today);
  const loc = h.locations.find((l) => l.key === i.loc);
  const flags = h.flags.filter((f) => i.flags.includes(f.id));
  const avoiders = h.people.filter((p) => p.avoids.some((a) => i.flags.includes(a)));
  return (
    <div className={"row " + i.level}>
      <button className={"lvl " + i.level} type="button" aria-label={`${i.name}: ${i.level}. Tap to step down`} onClick={() => props.onStep(i)}>
        <span className="gauge">
          <i style={{ width: FILL[i.level] + "%" }} />
        </span>
        <small>{i.level}</small>
      </button>
      <div style={{ minWidth: 0 }}>
        <button className="name" type="button" onClick={props.onOpen}>
          {i.name}
        </button>
        <div className="meta">
          {props.showLoc && loc && <span className="pill loc">{loc.label}</span>}
          {i.useBy && d !== null && (
            <span className={"pill" + (d < 0 ? " past" : d <= 3 ? " soon" : "")}>{d < 0 ? "Past " + fmt(i.useBy) : d === 0 ? "Use today" : "By " + fmt(i.useBy)}</span>
          )}
          {flags.map((f) => (
            <span key={f.id} className="pill flag">
              {f.label}
            </span>
          ))}
          {avoiders.length > 0 && <span className="pill avoid">Not for {avoiders.map((p) => p.name).join(" or ")}</span>}
          {i.note && <span>{i.note}</span>}
        </div>
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

function useImport(onDone: (msg: string) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept="application/json,.json"
      className="vh"
      onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        try {
          const h = importHousehold(JSON.parse(await f.text()));
          replaceHousehold(h);
          onDone(`Loaded ${h.items.length} items`);
        } catch (err) {
          onDone(err instanceof ImportError ? err.message : "Couldn't read that file.");
        }
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

function Welcome({ onLoaded, toast }: { onLoaded: (msg: string) => void; toast: string }) {
  const imp = useImport(onLoaded);
  const blank = useMemo<Household>(
    () => ({
      name: "My kitchen",
      locations: [
        { key: "fridge", label: "Fridge" },
        { key: "freezer", label: "Freezer" },
        { key: "pantry", label: "Pantry" },
      ],
      flags: [],
      people: [],
      items: [],
    }),
    [],
  );
  return (
    <div className="wrap">
      <header>
        <h1>Kitchen Stock</h1>
      </header>
      <div className="welcome">
        <h2>Get started</h2>
        <p>Load a kitchen list you already have, or start from an empty kitchen.</p>
        <div className="actions">
          <button className="btn primary" type="button" onClick={imp.open}>
            Load a list file
          </button>
          <button className="btn ghost" type="button" onClick={() => replaceHousehold(blank)}>
            Start empty
          </button>
        </div>
        {imp.input}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function BackupTools({ onDone }: { onDone: (msg: string) => void }) {
  const imp = useImport(onDone);
  const [armed, setArmed] = useState(false);
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([exportJson()], { type: "application/json" }));
    a.download = `kitchen-stock-${new Date().toISOString().slice(0, 10)}.export.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="toolbar">
      <button className="btn ghost" type="button" onClick={download}>
        Save a backup
      </button>
      <button
        className={"btn ghost" + (armed ? " danger" : "")}
        type="button"
        onClick={() => {
          if (!armed) return setArmed(true);
          setArmed(false);
          imp.open();
        }}
      >
        {armed ? "Tap again — this replaces your whole list" : "Load a list file"}
      </button>
      {imp.input}
    </div>
  );
}
