import { useEffect, useRef, useState } from "react";
import { parseReceipt, type ReceiptLine } from "./receipt";
import type { ItemFields } from "./store";
import type { Household, LocationKind } from "./types";

type Row = ReceiptLine & { on: boolean; loc: string };
type Stage = { step: "pick" } | { step: "reading"; pct: number } | { step: "review"; rows: Row[] } | { step: "error"; msg: string };

/** Make a photo easier to read: shrink to a sensible size, grey, and stretch the contrast. */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  let lo = 255, hi = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    d.data[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = ((d.data[i] - lo) / span) * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** Read the text off a receipt photo, on the phone. The reader (about 10 MB) downloads the first time. */
async function readPhoto(file: File, onPct: (pct: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onPct(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(await prepare(file));
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export function ReceiptSheet({ h, onClose, onPutAway }: { h: Household; onClose: () => void; onPutAway: (restockIds: string[], adds: Partial<ItemFields>[]) => void }) {
  const [stage, setStage] = useState<Stage>({ step: "pick" });
  const [pasted, setPasted] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const placeFor = (kind: LocationKind) => h.locations.find((l) => l.kind === kind)?.key ?? h.locations.find((l) => l.kind === "pantry")?.key ?? h.locations[0]?.key ?? "";
  const review = (text: string) => {
    const rows = parseReceipt(text, h).map((l) => ({ ...l, on: true, loc: l.match ? l.match.loc : placeFor(l.kind) }));
    setStage(rows.length ? { step: "review", rows } : { step: "error", msg: "No food lines found. Try a sharper photo, flat and well lit, with the whole list of items in it." });
  };
  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setStage({ step: "reading", pct: 0 });
    try {
      review(await readPhoto(file, (pct) => setStage({ step: "reading", pct })));
    } catch {
      setStage({ step: "error", msg: "Couldn't read the photo. The reader needs a connection the first time it's used. Check the signal and try again." });
    }
  };

  const rows = stage.step === "review" ? stage.rows : [];
  const setRow = (n: number, patch: Partial<Row>) => stage.step === "review" && setStage({ step: "review", rows: rows.map((r, k) => (k === n ? { ...r, ...patch } : r)) });
  const chosen = rows.filter((r) => r.on && r.name.trim());
  const putAway = () => {
    const restock = chosen.filter((r) => r.match && r.name === r.match.name && r.loc === r.match.loc).map((r) => r.match!.id);
    const adds = chosen.filter((r) => !(r.match && r.name === r.match.name && r.loc === r.match.loc)).map((r) => ({ name: r.name.trim(), loc: r.loc }));
    onPutAway(restock, adds);
  };

  return (
    <div className="shade" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Scan a receipt">
        <h3>Scan a receipt</h3>

        {stage.step === "pick" && (
          <>
            <p className="sub">Take a photo of the receipt, flat and well lit. Things you already have go back to full; new things get added. You check the list first.</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void fromPhoto(e.target.files?.[0])} />
            <div className="actions">
              <div className="right">
                <button className="btn" type="button" onClick={onClose}>
                  Cancel
                </button>
                <button className="btn primary" type="button" onClick={() => fileRef.current?.click()}>
                  Take or choose a photo
                </button>
              </div>
            </div>
            <details className="paste">
              <summary>Or paste the receipt's text</summary>
              <label className="field full">
                Receipt text <span className="hint small">from an emailed or online receipt</span>
                <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} />
              </label>
              <button className="btn" type="button" disabled={!pasted.trim()} onClick={() => review(pasted)}>
                Read it
              </button>
            </details>
          </>
        )}

        {stage.step === "reading" && (
          <div className="reading" role="status">
            <p className="sub">Reading the receipt… {stage.pct > 0 ? `${stage.pct}%` : "(the first time takes a little longer)"}</p>
            <div className="walk-bar" aria-hidden="true">
              <span style={{ width: `${stage.pct}%` }} />
            </div>
          </div>
        )}

        {stage.step === "error" && (
          <>
            <p className="formerror">{stage.msg}</p>
            <div className="actions">
              <div className="right">
                <button className="btn" type="button" onClick={onClose}>
                  Close
                </button>
                <button className="btn primary" type="button" onClick={() => setStage({ step: "pick" })}>
                  Try again
                </button>
              </div>
            </div>
          </>
        )}

        {stage.step === "review" && (
          <>
            <p className="sub">Untick anything that isn't food or that you didn't keep. Fix any names it got wrong.</p>
            <div className="receipt-rows">
              {rows.map((r, n) => (
                <div className={"receipt-row" + (r.on ? "" : " off")} key={n}>
                  <input type="checkbox" checked={r.on} aria-label={`Put away ${r.name}`} onChange={(e) => setRow(n, { on: e.target.checked })} />
                  <div className="receipt-main">
                    <input className="receipt-name" value={r.name} aria-label="Name" onChange={(e) => setRow(n, { name: e.target.value })} />
                    <small>{r.raw}</small>
                  </div>
                  <div className="receipt-side">
                    <span className={"tag " + (r.match && r.name === r.match.name ? "restock" : "new")}>{r.match && r.name === r.match.name ? "Restock" : "New"}</span>
                    <select value={r.loc} aria-label={`Where ${r.name} goes`} onChange={(e) => setRow(n, { loc: e.target.value })}>
                      {h.locations.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <div className="actions">
              <button className="btn" type="button" onClick={() => setStage({ step: "pick" })}>
                Start over
              </button>
              <div className="right">
                <button className="btn primary" type="button" disabled={!chosen.length} onClick={putAway}>
                  Put away {chosen.length} {chosen.length === 1 ? "item" : "items"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
