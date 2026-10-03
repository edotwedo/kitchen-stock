import { useEffect } from "react";
import type { RecallMatch } from "./recalls";

const FDA_RECALLS = "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts";

/** Items that may be part of a food recall, with what to check on the label. */
export function RecallSheet({ matches, onCheck, onClose }: { matches: RecallMatch[]; onCheck: (m: RecallMatch) => void; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  const likely = matches.filter((m) => m.strength === "likely");
  const possible = matches.filter((m) => m.strength === "possible");
  const card = (m: RecallMatch) => (
    <li key={m.recall.id + m.item.id} className="recall">
      <strong>{m.item.name}</strong>
      <span>
        {m.barcode === "match" ? "has the same barcode as " : "may match "}
        <b>{m.recall.product}</b>
        {m.recall.firm ? ` from ${m.recall.firm}` : ""}.
      </span>
      {m.barcode === "differs" && <span className="hint small">The barcode you scanned isn't one this recall lists, so it's probably a different size or product.</span>}
      <span className="hint small">
        {m.recall.reason ? `Why: ${m.recall.reason.replace(/\s+/g, " ").slice(0, 220)}. ` : ""}
        {m.recall.classification ? `${m.recall.classification}. ` : ""}Reported {m.recall.date}. Recall {m.recall.id}.
      </span>
      <span className="hint small">
        {m.barcode === "match" ? "Check the lot code and dates on your package against the recall. " : "Check the brand, size and codes on your package against the recall. "}
        If it matches, don't eat it: return it or throw it out.
      </span>
      <button className="btn small" type="button" onClick={() => onCheck(m)}>
        I checked, it's not mine
      </button>
    </li>
  );
  return (
    <div className="shade" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Food recalls">
        <h3>Food recalls to check</h3>
        <p className="sub">Ongoing FDA food recalls that reach Washington and share a name or a scanned barcode with something in your kitchen. Even a barcode match isn't proof: the lot code and dates on the label decide.</p>
        {likely.length > 0 && <ul className="recalls">{likely.map(card)}</ul>}
        {possible.length > 0 && (
          <>
            <p className="hint">Also check (only a common word matches, like "salsa" or "bread"):</p>
            <ul className="recalls">{possible.map(card)}</ul>
          </>
        )}
        <p className="hint small">
          Source: FDA recall reports (openFDA), refreshed twice a day. Meat and poultry recalls come from the USDA and aren't included yet. <a href={FDA_RECALLS} target="_blank" rel="noreferrer">All FDA recalls</a>
        </p>
        <div className="actions">
          <div className="right">
            <button className="btn" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
