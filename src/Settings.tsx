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
  ruleFor,
  setFreezerDays,
  setRule,
  tagItems,
  updateLocation,
  updatePerson,
} from "./household";
import { FLAG_LIBRARY, findCandidates, type FlagGroup } from "./flagLibrary";
import { updateHousehold } from "./store";
import { WRAP_LABELS, WRAPS, type Flag, type Household, type LocationKind, type Rule } from "./types";

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

const RULE_NEXT: Record<string, Rule | null> = { none: "avoid", avoid: "limit", limit: null };

/** One flag on a person: tap to cycle no rule → avoid → limit → no rule. */
function RuleChip({ flag, rule, onChange }: { flag: Flag; rule: Rule | null; onChange: (r: Rule | null) => void }) {
  return (
    <button type="button" className={"rule " + (rule ?? "none")} aria-label={`${flag.label}: ${rule ?? "no rule"}. Tap to change`} onClick={() => onChange(RULE_NEXT[rule ?? "none"])}>
      {flag.label}
      {rule && <small>{rule}</small>}
    </button>
  );
}

/** A household flag: rename, remove, and review likely matches before tagging them. */
function FlagRow({ flag, h }: { flag: Flag; h: Household }) {
  const [review, setReview] = useState<string[] | null>(null);
  const tagged = h.items.filter((i) => i.flags.includes(flag.id)).length;
  const candidates = findCandidates(h.items, flag);
  const lower = flag.label.toLowerCase();
  return (
    <div className="flagrow">
      <div className="line">
        <SavedText label="Flag name" value={flag.label} onSave={(v) => updateHousehold(renameFlag(flag.id, v))} />
        <span className="hint small nowrap">{tagged} items</span>
        <RemoveButton label={flag.label} onRemove={() => updateHousehold(removeFlag(flag.id))} />
      </div>
      {review === null ? (
        candidates.length > 0 && (
          <button className="linkbtn" type="button" onClick={() => setReview(candidates.map((c) => c.id))}>
            Find items: {candidates.length} might contain {lower}
          </button>
        )
      ) : (
        <div className="review">
          <p className="hint small">Untick anything without {lower} in it.</p>
          {candidates.map((c) => (
            <label key={c.id} className="reviewitem">
              <input type="checkbox" checked={review.includes(c.id)} onChange={(e) => setReview(e.target.checked ? [...review, c.id] : review.filter((x) => x !== c.id))} />
              <span>
                {c.name}
                {c.note && <small>{c.note}</small>}
              </span>
            </label>
          ))}
          <div className="actions">
            <button className="btn" type="button" onClick={() => setReview(null)}>
              Cancel
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={!review.length}
              onClick={() => {
                updateHousehold(tagItems(flag.id, review));
                setReview(null);
              }}
            >
              Tag {review.length} {review.length === 1 ? "item" : "items"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const GROUPS: FlagGroup[] = ["Allergens", "Religious & ethical", "Health & diet"];

/** Ready-made flags this household doesn't have yet, one tap to add. */
function Library({ h }: { h: Household }) {
  const have = new Set(h.flags.map((f) => f.label.toLowerCase()));
  const groups = GROUPS.map((g) => ({ g, flags: FLAG_LIBRARY.filter((f) => f.group === g && !have.has(f.label.toLowerCase())) })).filter((x) => x.flags.length);
  if (!groups.length) return null;
  return (
    <div className="library">
      {groups.map(({ g, flags }) => (
        <div key={g} className="libgroup">
          <span className="hint small">{g}</span>
          <div className="suggest">
            {flags.map((f) => (
              <button key={f.label} className="chip" type="button" onClick={() => updateHousehold(addFlag(f.label))}>
                + {f.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Settings({ h, onClose, backup, sharing, onPrint }: { h: Household; onClose: () => void; backup: React.ReactNode; sharing: React.ReactNode; onPrint: () => void }) {
  const [kind, setKind] = useState<LocationKind>("pantry");

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
          <p className="hint">Everyone who eats from this kitchen. Tap a flag once for avoid (can't have it), again for limit (go easy), and again to clear.</p>
          {h.people.map((p) => (
            <div className="card" key={p.id}>
              <div className="card-head">
                <SavedText label="Name" value={p.name} onSave={(v) => updateHousehold(updatePerson(p.id, { name: v }))} />
                <RemoveButton label={p.name} onRemove={() => updateHousehold(removePerson(p.id))} />
              </div>
              {h.flags.length ? (
                <div className="checks" role="group" aria-label={`${p.name}'s rules`}>
                  {h.flags.map((f) => (
                    <RuleChip key={f.id} flag={f} rule={ruleFor(p, f.id)} onChange={(r) => updateHousehold(setRule(p.id, f.id, r))} />
                  ))}
                </div>
              ) : (
                <p className="hint small">Add dietary flags below, then set what {p.name} avoids or limits.</p>
              )}
            </div>
          ))}
          <AddRow placeholder="Add a person" onAdd={(v) => updateHousehold(addPerson(v))} />
        </section>

        <section className="set">
          <h4>Dietary flags</h4>
          <p className="hint">Anything an item can contain that someone needs to know about. Each flag gets its own list, and Find items checks names and notes for likely matches.</p>
          {h.flags.map((f) => (
            <FlagRow key={f.id} flag={f} h={h} />
          ))}
          <Library h={h} />
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

        {sharing && (
          <section className="set">
            <h4>Sharing</h4>
            {sharing}
          </section>
        )}

        <section className="set">
          <h4>Print</h4>
          <p className="hint">Inventory sheets for each place, or the shopping list, in blue ink.</p>
          <div className="menu">
            <button className="btn" type="button" onClick={onPrint}>
              Print sheets <small>Opens a preview</small>
            </button>
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
