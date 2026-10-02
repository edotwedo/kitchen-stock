import { useEffect } from "react";
import { createPortal } from "react-dom";
import { fmtDate } from "./format";
import { isShopping, toIso } from "./logic";
import { LEVELS, type Household, type Item, type Level } from "./types";

export interface CountChange {
  name: string;
  qty: string;
  was: Level;
  now: Level;
}

export interface CountSummary {
  place: string;
  counted: number;
  ranOut: CountChange[];
  gotLow: CountChange[];
  wentUp: CountChange[];
  other: CountChange[];
  shopping: number;
}

const rank = (l: Level) => LEVELS.indexOf(l); // full 0 ... out 3

/** What a count changed, grouped the way a client reads it: what ran out, what's low, what went back up. */
export function countSummary(h: Household, loc: string, before: Item[], counted: number): CountSummary {
  const changes: CountChange[] = before
    .map((b) => {
      const now = h.items.find((i) => i.id === b.id);
      return now && now.level !== b.level ? { name: now.name, qty: now.qty, was: b.level, now: now.level } : null;
    })
    .filter((c): c is CountChange => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    place: h.locations.find((l) => l.key === loc)?.label ?? "",
    counted,
    ranOut: changes.filter((c) => c.now === "out"),
    gotLow: changes.filter((c) => c.now === "low" && rank(c.was) < rank(c.now)),
    wentUp: changes.filter((c) => rank(c.now) < rank(c.was)),
    other: changes.filter((c) => c.now === "half" && rank(c.was) < rank(c.now)),
    shopping: h.items.filter(isShopping).length,
  };
}

const GROUPS: { key: "ranOut" | "gotLow" | "other" | "wentUp"; title: string }[] = [
  { key: "ranOut", title: "Ran out" },
  { key: "gotLow", title: "Running low" },
  { key: "other", title: "Used some" },
  { key: "wentUp", title: "Restocked" },
];

/** A one-page count summary, in print blue, that an organizer can print or save as a PDF for the client. */
export function CountReport({ h, s, onClose }: { h: Household; s: CountSummary; onClose: () => void }) {
  const today = fmtDate(toIso(new Date()), true);
  const changed = s.ranOut.length + s.gotLow.length + s.wentUp.length + s.other.length;

  useEffect(() => {
    document.documentElement.classList.add("printing");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => {
      document.documentElement.classList.remove("printing");
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return createPortal(
    <main className="printview">
      <div className="print-controls">
        <div className="print-bar">
          <h3>Count summary</h3>
          <div className="right">
            <button className="btn" type="button" onClick={onClose}>
              Close
            </button>
            <button className="btn primary" type="button" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </div>
        <p className="hint">Prints in blue ink. To send it instead, choose "Save as PDF" in the print window.</p>
      </div>
      <div className="paper-stack">
        <section className="paper count-report">
          <header className="paper-head">
            <h1>{s.place}: what changed</h1>
            <span>
              {h.name}. Counted {today}.
            </span>
          </header>
          <p className="count-line">
            {s.counted} {s.counted === 1 ? "item" : "items"} counted, {changed ? `${changed} changed` : "nothing changed"}.{" "}
            {s.shopping ? `${s.shopping} ${s.shopping === 1 ? "thing is" : "things are"} on the shopping list.` : "Nothing is on the shopping list."}
          </p>
          {GROUPS.filter((g) => s[g.key].length).map((g) => (
            <div key={g.key} className="shop-group">
              <h2>{g.title}</h2>
              <ul>
                {s[g.key].map((c, n) => (
                  <li key={n}>
                    <span className="what">
                      {c.name}
                      {c.qty && <small> {c.qty}</small>}
                    </span>
                    <span className="lvl">
                      {c.was} to {c.now}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </main>,
    document.body,
  );
}
