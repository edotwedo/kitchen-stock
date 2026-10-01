import { useEffect, useRef, useState } from "react";
import { suggestFlags } from "./flagLibrary";
import { DayDot } from "./DayDot";
import { dayOf, fmtDate } from "./format";
import { addDays, toIso } from "./logic";
import { deleteItem, restoreItem, saveItem } from "./store";
import { LEVELS, WRAP_LABELS, WRAPS, type Household, type Item, type Level, type Wrap } from "./types";

export type SheetTarget = { item: Item | null; loc?: string };

export function EditSheet({ h, target, onClose, onSaved }: { h: Household; target: SheetTarget; onClose: () => void; onSaved: (msg: string, undo?: () => void) => void }) {
  const it = target.item;
  const today = toIso(new Date());
  const [name, setName] = useState(it?.name ?? "");
  const [loc, setLoc] = useState(it?.loc ?? target.loc ?? h.locations[0]?.key ?? "");
  const [qty, setQty] = useState(it?.qty ?? "");
  const [level, setLevel] = useState<Level>(it?.level ?? "full");
  const [useBy, setUseBy] = useState(it?.useBy ?? "");
  const [remindOn, setRemindOn] = useState(it?.remindOn ?? "");
  const [frozenOn, setFrozenOn] = useState(it?.frozenOn ?? "");
  const [wrap, setWrap] = useState<Wrap>(it?.wrap ?? "regular");
  const [note, setNote] = useState(it?.note ?? "");
  const [flags, setFlags] = useState<string[]>(it?.flags ?? []);
  const [armed, setArmed] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const frozen = h.locations.find((l) => l.key === loc)?.kind === "freezer";
  // Going into the freezer with no date yet: assume it's being frozen today.
  const frozenDate = frozen ? frozenOn || today : frozenOn;
  const bestUntil = frozen ? addDays(frozenDate, h.freezerDays[wrap]) : "";

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
    saveItem(it?.id ?? null, { name: n, loc, qty: qty.trim(), level, useBy, remindOn, frozenOn: frozenDate, wrap, note: note.trim(), flags });
    onSaved((it ? "Saved " : "Added ") + n, it ? () => restoreItem(it) : undefined);
    onClose();
  };

  const remove = () => {
    if (!it) return;
    if (!armed) return setArmed(true);
    deleteItem(it.id);
    onSaved("Deleted " + it.name, () => restoreItem(it));
    onClose();
  };

  const changed = it?.updated ? new Date(it.updated) : null;
  // Flags this item probably has, from its name and note. Shown as dashed chips to confirm.
  const maybe = suggestFlags({ name, note, flags }, h.flags);

  return (
    <div className="shade" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={it ? "Edit " + it.name : "Add item"}>
        <h3>{it ? "Edit item" : "Add item"}</h3>
        <p className="sub">{changed && !isNaN(changed.getTime()) ? "Last changed " + changed.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "It'll show up in the list right away."}</p>
        <form onSubmit={submit}>
          <div className="fields">
            <label className="field full">
              Item
              <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" placeholder="e.g. Ground beef" />
            </label>
            <label className="field">
              Where
              <select value={loc} onChange={(e) => setLoc(e.target.value)}>
                {h.locations.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Amount
              <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="2 lb, 3 cans" />
            </label>
            <div className="field full">
              <span id="lvl-label">How much is left</span>
              <div className="seg" role="group" aria-labelledby="lvl-label">
                {LEVELS.map((l) => (
                  <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)}>
                    {l[0].toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {frozen ? (
              <>
                <label className="field">
                  <span className="withdot">
                    Frozen on {dayOf(frozenDate) && <DayDot day={dayOf(frozenDate)!} />}
                  </span>
                  <input type="date" value={frozenDate} max={today} onChange={(e) => setFrozenOn(e.target.value)} />
                </label>
                <label className="field">
                  Printed date
                  <input type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} />
                </label>
                <div className="field full">
                  <span id="wrap-label">How it's wrapped</span>
                  <div className="seg" role="group" aria-labelledby="wrap-label">
                    {WRAPS.map((w) => (
                      <button key={w} type="button" aria-pressed={wrap === w} onClick={() => setWrap(w)}>
                        {WRAP_LABELS[w]}
                      </button>
                    ))}
                  </div>
                  <p className="hint">
                    Best quality until <strong>{fmtDate(bestUntil, true)}</strong>. Frozen food stays safe longer; this is about taste and texture.
                  </p>
                </div>
              </>
            ) : (
              <label className="field">
                Use by
                <input type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} />
              </label>
            )}

            <label className={"field" + (frozen ? " full" : "")}>
              Remind me on
              <input type="date" value={remindOn} onChange={(e) => setRemindOn(e.target.value)} />
            </label>
            <label className="field full">
              Note
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to remember" />
            </label>
            {h.flags.length > 0 && (
              <div className="field full">
                <span>Dietary flags{maybe.length > 0 && <span className="hint small">. Dashed ones look likely from the name.</span>}</span>
                <div className="checks">
                  {h.flags.map((f) => (
                    <label key={f.id} className={"check" + (maybe.includes(f) ? " maybe" : "")} title={maybe.includes(f) ? "The name suggests this one" : undefined}>
                      <input type="checkbox" checked={flags.includes(f.id)} onChange={(e) => setFlags(e.target.checked ? [...flags, f.id] : flags.filter((x) => x !== f.id))} />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="actions">
            {it && (
              <button className={"btn danger" + (armed ? " armed" : "")} type="button" onClick={remove}>
                {armed ? "Tap again to delete" : "Delete"}
              </button>
            )}
            <div className="right">
              <button className="btn" type="button" onClick={onClose}>
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
