import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fmtDate } from "./format";
import { toIso } from "./logic";
import { printPages, type PrintKind } from "./printPages";
import type { Household } from "./types";

/**
 * Printable sheets in print blue (the owner's printer fades black): an inventory
 * sheet per place with a box to tick when counting, or the shopping list.
 * Rendered outside the app so only the sheets print.
 */

export function PrintView({ h, onClose }: { h: Household; onClose: () => void }) {
  const [kind, setKind] = useState<PrintKind>("inventory");
  const [places, setPlaces] = useState<string[]>(h.locations.map((l) => l.key));
  const pages = printPages(h, kind, places);
  const printed = fmtDate(toIso(new Date()), true);

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
          <h3>Print sheets</h3>
          <div className="right">
            <button className="btn" type="button" onClick={onClose}>
              Close
            </button>
            <button className="btn primary" type="button" onClick={() => window.print()} disabled={!pages.length}>
              Print
            </button>
          </div>
        </div>
        <div className="seg" role="group" aria-label="What to print">
          <button type="button" aria-pressed={kind === "inventory"} onClick={() => setKind("inventory")}>
            Inventory sheets
          </button>
          <button type="button" aria-pressed={kind === "shopping"} onClick={() => setKind("shopping")}>
            Shopping list
          </button>
        </div>
        <div className="checks" role="group" aria-label="Places">
          {h.locations.map((l) => (
            <label key={l.key} className="check">
              <input type="checkbox" checked={places.includes(l.key)} onChange={(e) => setPlaces(e.target.checked ? [...places, l.key] : places.filter((x) => x !== l.key))} />
              {l.label}
            </label>
          ))}
        </div>
        <p className="hint">Prints in blue ink with no dark fills. {kind === "inventory" ? "Each place starts a new page." : "Low and out items, grouped by where they go."}</p>
      </div>

      <div className="paper-stack">
        {!pages.length && <p className="hint">Nothing to print for those places.</p>}
        {kind === "shopping" && pages.length > 0 ? (
          <section className="paper">
            <header className="paper-head">
              <h1>Shopping list</h1>
              <span>
                {h.name}. Printed {printed}.
              </span>
            </header>
            {pages.map((p) => (
              <div key={p.place} className="shop-group">
                <h2>{p.place}</h2>
                <ul>
                  {p.rows.map((r, n) => (
                    <li key={n}>
                      <span className="box" />
                      <span className="what">
                        {r.name}
                        {r.buy && <small>{r.buy}</small>}
                      </span>
                      <span className="lvl">{r.level === "out" ? "out" : "low"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : (
          pages.map((p) => (
            <section key={p.place} className="paper">
              <header className="paper-head">
                <h1>{p.place}</h1>
                <span>
                  {h.name}. {p.rows.length} items. Printed {printed}.
                </span>
              </header>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Amount</th>
                    <th>Left</th>
                    <th>{p.frozen ? "Frozen" : "Use by"}</th>
                    <th className="count">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map((r, n) => (
                    <tr key={n}>
                      <td>
                        {r.name}
                        {r.note && <small>{r.note}</small>}
                      </td>
                      <td>{r.qty}</td>
                      <td>{r.level}</td>
                      <td>{r.date}</td>
                      <td className="count">
                        <span className="box" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}
      </div>
    </main>,
    document.body,
  );
}
