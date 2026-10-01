import { useEffect, useMemo, useRef, useState } from "react";
import { buildCookPrompt, type Meal } from "./cook";
import type { Household } from "./types";

const MEALS: { value: Meal; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

/** Builds the "What can I cook?" question and copies it for pasting into any AI chat app. */
export function CookSheet({ h, onClose, onDone }: { h: Household; onClose: () => void; onDone: (msg: string) => void }) {
  const [eaters, setEaters] = useState<string[]>(h.people.map((p) => p.id));
  const [meal, setMeal] = useState<Meal>("dinner");
  const text = useMemo(() => buildCookPrompt(h, eaters, meal, new Date()), [h, eaters, meal]);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      onDone("Copied. Paste it into your AI chat app.");
      onClose();
    } catch {
      // Some browsers block the clipboard: select the text so a long-press copies it.
      box.current?.focus();
      box.current?.select();
      onDone("Select all and copy the text below.");
    }
  };

  return (
    <div className="shade" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="What can I cook?">
        <h3>What can I cook?</h3>
        <p className="sub">This builds a question from what needs using first and everyone's rules. Paste it into any AI chat app, like Claude or ChatGPT.</p>
        <div className="fields">
          {h.people.length > 0 && (
            <div className="field full">
              <span id="eat-label">Who's eating</span>
              <div className="checks" role="group" aria-labelledby="eat-label">
                {h.people.map((p) => (
                  <label key={p.id} className="check">
                    <input type="checkbox" checked={eaters.includes(p.id)} onChange={(e) => setEaters(e.target.checked ? [...eaters, p.id] : eaters.filter((x) => x !== p.id))} />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="field full">
            <span id="meal-label">Meal</span>
            <div className="seg" role="group" aria-labelledby="meal-label">
              {MEALS.map((m) => (
                <button key={m.value} type="button" aria-pressed={meal === m.value} onClick={() => setMeal(m.value)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <label className="field full">
            The question
            <textarea ref={box} className="prompt" readOnly value={text} rows={8} />
          </label>
        </div>
        <div className="actions">
          <div className="right">
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" type="button" onClick={() => void copy()}>
              Copy the question
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
