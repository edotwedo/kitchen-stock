import { useEffect, useState } from "react";
import { byLevelThenName, isShopping } from "./logic";
import type { Household, Item } from "./types";

/** "Back from the store": tick what you bought from the shopping list and restock it all at once. */
export function StoreRun({ h, onClose, onRestock }: { h: Household; onClose: () => void; onRestock: (items: Item[]) => void }) {
  const list = h.items.filter(isShopping).sort(byLevelThenName);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const place = (i: Item) => h.locations.find((l) => l.key === i.loc)?.label ?? "";
  const toggle = (id: string, on: boolean) => setPicked(on ? [...picked, id] : picked.filter((x) => x !== id));

  return (
    <div className="shade" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Back from the store">
        <h3>Back from the store</h3>
        <p className="sub">Tick what you bought. It all goes back to full, and freezer items start a fresh clock.</p>
        {list.length === 0 ? (
          <p className="hint">Nothing is low or out right now.</p>
        ) : (
          <>
            <div className="storerun-tools">
              <button className="linkbtn" type="button" onClick={() => setPicked(picked.length === list.length ? [] : list.map((i) => i.id))}>
                {picked.length === list.length ? "Clear all" : "Tick all"}
              </button>
            </div>
            <div className="storerun">
              {list.map((i) => (
                <label key={i.id} className="reviewitem">
                  <input type="checkbox" checked={picked.includes(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />
                  <span>
                    {i.name}
                    <small>
                      {place(i)}, {i.level}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="actions">
          <div className="right">
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" type="button" disabled={!picked.length} onClick={() => onRestock(list.filter((i) => picked.includes(i.id)))}>
              Restock {picked.length || ""} {picked.length === 1 ? "item" : "items"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
