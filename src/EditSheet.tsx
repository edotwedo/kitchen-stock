import { useEffect, useRef, useState } from "react";
import { deleteItem, saveItem } from "./store";
import { LEVELS, type Household, type Item, type Level } from "./types";

export type SheetTarget = { item: Item | null; loc?: string };

export function EditSheet({ h, target, onClose, onSaved }: { h: Household; target: SheetTarget; onClose: () => void; onSaved: (msg: string) => void }) {
  const it = target.item;
  const [name, setName] = useState(it?.name ?? "");
  const [loc, setLoc] = useState(it?.loc ?? target.loc ?? h.locations[0]?.key ?? "");
  const [qty, setQty] = useState(it?.qty ?? "");
  const [level, setLevel] = useState<Level>(it?.level ?? "full");
  const [useBy, setUseBy] = useState(it?.useBy ?? "");
  const [remindOn, setRemindOn] = useState(it?.remindOn ?? "");
  const [note, setNote] = useState(it?.note ?? "");
  const [flags, setFlags] = useState<string[]>(it?.flags ?? []);
  const [confirmDel, setConfirmDel] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!it) nameRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [it, onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return nameRef.current?.focus();
    saveItem(it?.id ?? null, { name: n, loc, qty: qty.trim(), level, useBy, remindOn, note: note.trim(), flags });
    onSaved((it ? "Saved " : "Added ") + n);
    onClose();
  };

  const remove = () => {
    if (!it) return;
    if (!confirmDel) return setConfirmDel(true);
    deleteItem(it.id);
    onSaved("Deleted " + it.name);
    onClose();
  };

  const changed = it?.updated ? new Date(it.updated) : null;

  return (
    <div className="shade" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={it ? "Edit item" : "Add item"}>
        <h3>{it ? "Edit item" : "Add item"}</h3>
        <form onSubmit={submit}>
          {changed && !isNaN(changed.getTime()) && <p className="status">Last changed {changed.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>}
          <div className="form">
            <label className="full">
              Item
              <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
            </label>
            <label>
              Where
              <select value={loc} onChange={(e) => setLoc(e.target.value)}>
                {h.locations.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 2 lb, 3 cans" />
            </label>
            <div className="full">
              <label>How much is left</label>
              <div className="seg" role="group" aria-label="How much is left">
                {LEVELS.map((l) => (
                  <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)}>
                    {l[0].toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <label>
              Use by
              <input type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} />
            </label>
            <label>
              Remind me on
              <input type="date" value={remindOn} onChange={(e) => setRemindOn(e.target.value)} />
            </label>
            <label className="full">
              Note
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to remember" />
            </label>
            {h.flags.map((f) => (
              <label key={f.id} className="check full">
                <input type="checkbox" checked={flags.includes(f.id)} onChange={(e) => setFlags(e.target.checked ? [...flags, f.id] : flags.filter((x) => x !== f.id))} />
                {f.label}
              </label>
            ))}
          </div>
          <div className="sheet-actions">
            {it ? (
              <button className="btn ghost danger" type="button" onClick={remove}>
                {confirmDel ? "Tap again to delete" : "Delete"}
              </button>
            ) : (
              <span />
            )}
            <div className="right">
              <button className="btn ghost" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="btn primary" type="submit">
                {it ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
