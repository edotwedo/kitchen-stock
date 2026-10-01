import { useEffect, useRef, useState } from "react";
import { bySpot } from "./logic";
import { saveItem } from "./store";
import { LEVELS, type Household, type Item, type Level } from "./types";

const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);
const LABEL: Record<Level, string> = { full: "Full", half: "Half", low: "Low", out: "Out" };

/**
 * Count one place item by item, in walking order (spot by spot), with big buttons.
 * Each tap saves right away, so nothing is lost if the phone locks halfway through.
 */
export function Walkthrough({ h, loc, onClose }: { h: Household; loc: string; onClose: (changed: Item[], finished: boolean) => void }) {
  const place = h.locations.find((l) => l.key === loc);
  // The order is fixed when the count starts, so items don't jump around as levels change.
  const [order] = useState(() => h.items.filter((i) => i.loc === loc).sort(bySpot(byName, h)).map((i) => i.id));
  const [at, setAt] = useState(0);
  const before = useRef(new Map<string, Item>());
  // What each changed item looked like before the count (for one Undo), leaving out any set back to where it was.
  const changedFrom = () => [...before.current.values()].filter((b) => h.items.find((i) => i.id === b.id)?.level !== b.level);
  const finish = () => onClose(changedFrom(), at >= order.length);

  const item = h.items.find((i) => i.id === order[at]);
  const done = at >= order.length;
  const changed = changedFrom().length;

  const pick = (level: Level) => {
    if (!item) return;
    if (level !== item.level) {
      if (!before.current.has(item.id)) before.current.set(item.id, item);
      saveItem(item.id, { level });
    }
    setAt(at + 1);
  };

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (!done && ["1", "2", "3", "4"].includes(e.key)) pick(LEVELS[Number(e.key) - 1]);
    };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  });

  const prevSpot = at > 0 ? h.items.find((i) => i.id === order[at - 1])?.spot?.trim() : undefined;
  const spot = item?.spot?.trim();
  const newSpot = spot && spot.toLowerCase() !== prevSpot?.toLowerCase();

  return (
    <div className="shade">
      <div className="sheet walk" role="dialog" aria-modal="true" aria-label={`Count ${place?.label ?? "this place"}`}>
        <div className="walk-top">
          <h3>Counting {place?.label}</h3>
          <span className="hint">{done ? `${order.length} of ${order.length}` : `${at + 1} of ${order.length}`}</span>
        </div>
        <div className="walk-bar" aria-hidden="true">
          <span style={{ width: `${(Math.min(at, order.length) / Math.max(order.length, 1)) * 100}%` }} />
        </div>

        {done || !item ? (
          <div className="walk-done" role="status">
            <p className="big">All counted.</p>
            <p className="sub">{changed ? `${changed} ${changed === 1 ? "item" : "items"} changed. Anything low or out is on the shopping list.` : "Nothing changed. Everything is where you left it."}</p>
            <div className="actions">
              <div className="right">
                <button className="btn primary" type="button" onClick={finish}>
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className={"walk-spot" + (newSpot ? " new" : "")}>{spot || "No spot"}</p>
            <p className="walk-name" aria-live="polite">
              {item.name}
              {item.qty && <small>{item.qty}</small>}
            </p>
            <div className="walk-levels" role="group" aria-label={`How much ${item.name} is left`}>
              {LEVELS.map((l) => (
                <button key={l} type="button" className={"lvl " + l} aria-pressed={item.level === l} onClick={() => pick(l)}>
                  {LABEL[l]}
                  {item.level === l && <small>As before</small>}
                </button>
              ))}
            </div>
            <div className="actions">
              <button className="btn" type="button" disabled={at === 0} onClick={() => setAt(at - 1)}>
                Back
              </button>
              <div className="right">
                <button className="btn" type="button" onClick={finish}>
                  Stop here
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
