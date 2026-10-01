import { useEffect, useState } from "react";
import {
  addFlag,
  addLocation,
  addPerson,
  moveLocation,
  removeFlag,
  removeLocation,
  removePerson,
  renameFlag,
  renameHousehold,
  setFreezerDays,
  SUGGESTED_FLAGS,
  updateLocation,
  updatePerson,
} from "./household";
import { updateHousehold } from "./store";
import { WRAP_LABELS, WRAPS, type Household, type LocationKind } from "./types";

const KINDS: { value: LocationKind; label: string }[] = [
  { value: "freezer", label: "Freezer" },
  { value: "fridge", label: "Fridge" },
  { value: "pantry", label: "Pantry" },
  { value: "other", label: "Other" },
];

/** A text box that saves when you leave it or press Enter, not on every keystroke. */
function SavedText({ value, onSave, label, placeholder, numeric }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string; numeric?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => {
    const v = draft.trim();
    if (v && v !== value) onSave(v);
    // If the save was accepted the new value flows back in; if not, put the old one back.
    setDraft(value);
  };
  return (
    <input
      aria-label={label}
      inputMode={numeric ? "numeric" : undefined}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLInputElement).blur())}
    />
  );
}

/** A text box plus Add button for creating something new. */
function AddRow({ placeholder, onAdd, children }: { placeholder: string; onAdd: (v: string) => void; children?: React.ReactNode }) {
  const [v, setV] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.trim()) return;
    onAdd(v.trim());
    setV("");
  };
  return (
    <form className="addrow" onSubmit={submit}>
      <input aria-label={placeholder} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} />
      {children}
      <button className="btn" type="submit" disabled={!v.trim()}>
        Add
      </button>
    </form>
  );
}

/** Remove button that asks for a second tap. */
function RemoveButton({ label, onRemove, disabledReason }: { label: string; onRemove: () => void; disabledReason?: string }) {
  const [armed, setArmed] = useState(false);
  if (disabledReason) return <span className="hint small">{disabledReason}</span>;
  return (
    <button
      className={"btn danger small" + (armed ? " armed" : "")}
      type="button"
      aria-label={armed ? "Tap again to remove " + label : "Remove " + label}
      onClick={() => (armed ? onRemove() : setArmed(true))}
      onBlur={() => setArmed(false)}
    >
      {armed ? "Tap again" : "Remove"}
    </button>
  );
}

export function Settings({ h, onClose, backup }: { h: Household; onClose: () => void; backup: React.ReactNode }) {
  const [kind, setKind] = useState<LocationKind>("pantry");
  const used = (flagId: string) => h.items.filter((i) => i.flags.includes(flagId)).length;
  const suggestions = SUGGESTED_FLAGS.filter((s) => !h.flags.some((f) => f.label.toLowerCase() === s.toLowerCase()));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="shade" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet tall" role="dialog" aria-modal="true" aria-label="Kitchen settings">
        <div className="sheet-top">
          <h3>Kitchen settings</h3>
          <button className="btn" type="button" onClick={onClose}>
            Done
          </button>
        </div>

        <section className="set">
          <label className="field">
            Kitchen name
            <SavedText label="Kitchen name" value={h.name} onSave={(v) => updateHousehold(renameHousehold(v))} />
          </label>
        </section>

        <section className="set">
          <h4>People</h4>
          <p className="hint">Everyone who eats from this kitchen. Items with something a person avoids get a "Not for" tag.</p>
          {h.people.map((p) => (
            <div className="card" key={p.id}>
              <div className="card-head">
                <SavedText label="Name" value={p.name} onSave={(v) => updateHousehold(updatePerson(p.id, { name: v }))} />
                <RemoveButton label={p.name} onRemove={() => updateHousehold(removePerson(p.id))} />
              </div>
              {h.flags.length ? (
                <div className="checks" role="group" aria-label={`What ${p.name} avoids`}>
                  <span className="hint small">Avoids</span>
                  {h.flags.map((f) => (
                    <label key={f.id} className="check">
                      <input
                        type="checkbox"
                        checked={p.avoids.includes(f.id)}
                        onChange={(e) => updateHousehold(updatePerson(p.id, { avoids: e.target.checked ? [...p.avoids, f.id] : p.avoids.filter((a) => a !== f.id) }))}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="hint small">Add dietary flags below to set what {p.name} avoids.</p>
              )}
            </div>
          ))}
          <AddRow placeholder="Add a person" onAdd={(v) => updateHousehold(addPerson(v))} />
        </section>

        <section className="set">
          <h4>Dietary flags</h4>
          <p className="hint">Things an item can contain. Tick them on each item, and each flag gets its own list.</p>
          {h.flags.map((f) => (
            <div className="line" key={f.id}>
              <SavedText label="Flag name" value={f.label} onSave={(v) => updateHousehold(renameFlag(f.id, v))} />
              <span className="hint small nowrap">{used(f.id)} items</span>
              <RemoveButton label={f.label} onRemove={() => updateHousehold(removeFlag(f.id))} />
            </div>
          ))}
          {suggestions.length > 0 && (
            <div className="suggest" aria-label="Common flags">
              {suggestions.map((s) => (
                <button key={s} className="chip" type="button" onClick={() => updateHousehold(addFlag(s))}>
                  + {s}
                </button>
              ))}
            </div>
          )}
          <AddRow placeholder="Add another flag" onAdd={(v) => updateHousehold(addFlag(v))} />
        </section>

        <section className="set">
          <h4>Places</h4>
          <p className="hint">Where food is kept. Freezers use the quality clock instead of use-by dates.</p>
          {h.locations.map((l, n) => {
            const count = h.items.filter((i) => i.loc === l.key).length;
            return (
              <div className="line" key={l.key}>
                <SavedText label="Place name" value={l.label} onSave={(v) => updateHousehold(updateLocation(l.key, { label: v }))} />
                <select aria-label={`What kind of place ${l.label} is`} value={l.kind} onChange={(e) => updateHousehold(updateLocation(l.key, { kind: e.target.value as LocationKind }))}>
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <div className="updown">
                  <button type="button" aria-label={`Move ${l.label} up`} disabled={n === 0} onClick={() => updateHousehold(moveLocation(l.key, -1))}>
                    ↑
                  </button>
                  <button type="button" aria-label={`Move ${l.label} down`} disabled={n === h.locations.length - 1} onClick={() => updateHousehold(moveLocation(l.key, 1))}>
                    ↓
                  </button>
                </div>
                <RemoveButton label={l.label} onRemove={() => updateHousehold(removeLocation(l.key))} disabledReason={count ? `${count} items` : undefined} />
              </div>
            );
          })}
          <AddRow placeholder="Add a place" onAdd={(v) => updateHousehold(addLocation(v, kind))}>
            <select aria-label="Kind of place" value={kind} onChange={(e) => setKind(e.target.value as LocationKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </AddRow>
        </section>

        <section className="set">
          <h4>Freezer clock</h4>
          <p className="hint">How long frozen food keeps its best quality, by how it's wrapped.</p>
          <div className="days">
            {WRAPS.map((w) => (
              <label className="field" key={w}>
                {WRAP_LABELS[w]}
                <span className="suffix">
                  <SavedText label={`${WRAP_LABELS[w]} days`} numeric value={String(h.freezerDays[w])} onSave={(v) => updateHousehold(setFreezerDays(w, Number(v)))} />
                  <span>days</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="set">
          <h4>Backup</h4>
          {backup}
        </section>
      </div>
    </div>
  );
}
