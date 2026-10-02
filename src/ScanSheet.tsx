import { useEffect, useRef, useState } from "react";
import { lookUp, type Product } from "./barcode";
import type { Household } from "./types";

type Detector = { detect: (src: CanvasImageSource | ImageBitmap) => Promise<{ rawValue: string }[]> };
type Stage = { step: "starting" } | { step: "scan" } | { step: "nocamera" } | { step: "looking"; code: string } | { step: "missing"; code: string };

const FORMATS = ["ean_13", "upc_a", "upc_e", "ean_8"];

/** The phone's own barcode reader when it has one (Chrome on Android); otherwise a reader that downloads once (about 1 MB). */
async function makeDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (native) {
    try {
      return new native({ formats: FORMATS });
    } catch {
      // Some browsers have it but not for these formats; fall through to the download.
    }
  }
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: FORMATS as ("ean_13" | "upc_a" | "upc_e" | "ean_8")[] });
}

/** Point the camera at a grocery barcode; hands back the product's name, size, place and allergy flags. */
export function ScanSheet({ h, onClose, onFound }: { h: Household; onClose: () => void; onFound: (p: Product) => void }) {
  const [stage, setStage] = useState<Stage>({ step: "starting" });
  const [typed, setTyped] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const detector = useRef<Promise<Detector> | null>(null);
  const busy = useRef(false);
  const scanning = useRef(false); // the camera is on and being read
  const [noReader, setNoReader] = useState(false); // the barcode reader couldn't load: typing only
  const photoRef = useRef<HTMLInputElement>(null);

  const find = async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    setStage({ step: "looking", code });
    try {
      const p = await lookUp(code, h);
      if (p) return onFound(p);
    } catch {
      // No signal or the database is down: same answer as not found.
    }
    setStage({ step: "missing", code });
  };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    detector.current = makeDetector();
    // Without a reader (it couldn't download), neither the camera nor a photo can work: typing only.
    detector.current.catch(() => !stopped && setNoReader(true));
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        if (!stopped) setStage({ step: "nocamera" });
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      setStage({ step: "scan" });
      const d = await detector.current!.catch(() => null);
      if (stopped) return;
      if (!d) {
        // Nothing can read the picture, so don't leave the camera running.
        stream.getTracks().forEach((t) => t.stop());
        return setStage({ step: "nocamera" });
      }
      scanning.current = true;
      const tick = async () => {
        if (stopped) return;
        if (!busy.current && v.readyState >= 2) {
          const found = await d.detect(v).catch(() => []);
          if (found[0]?.rawValue) void find(found[0].rawValue);
        }
        timer = window.setTimeout(tick, 250);
      };
      void tick();
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      document.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setStage({ step: "looking", code: "the photo" });
    try {
      const d = await detector.current!;
      const found = await d.detect(await createImageBitmap(file));
      if (found[0]?.rawValue) {
        busy.current = false;
        return void find(found[0].rawValue);
      }
    } catch {
      // fall through
    }
    setStage({ step: "missing", code: "" });
  };

  const again = () => {
    busy.current = false;
    setTyped("");
    setStage({ step: scanning.current ? "scan" : "nocamera" });
  };

  return (
    <div className="shade scan-shade" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet scan-sheet" role="dialog" aria-modal="true" aria-label="Scan a barcode">
        <h3>Scan a barcode</h3>
        <div className="scan-view" hidden={stage.step === "nocamera"}>
          <video ref={video} muted playsInline aria-label="Camera" />
          <div className="scan-frame" aria-hidden="true" />
        </div>
        <p className="sub" role="status">
          {stage.step === "starting" && "Starting the camera…"}
          {stage.step === "scan" && "Line up the barcode inside the box."}
          {stage.step === "nocamera" && (noReader ? "Barcodes can't be read here right now. Type the number under the bars instead." : "The camera isn't available here. Take a photo of the barcode, or type its number.")}
          {stage.step === "looking" && `Looking up ${stage.code}…`}
          {stage.step === "missing" &&
            (stage.code ? `Barcode ${stage.code} isn't in the product database yet. Type the name instead, or try another.` : "Couldn't find a barcode in that photo. Try closer, flat and well lit.")}
        </p>
        <form
          className="scan-type"
          onSubmit={(e) => {
            e.preventDefault();
            busy.current = false;
            void find(typed.replace(/\D/g, ""));
          }}
        >
          <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" placeholder="Or type the number under the bars" aria-label="Barcode number" autoComplete="off" />
          <button className="btn small" type="submit" disabled={typed.replace(/\D/g, "").length < 6}>
            Look up
          </button>
        </form>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // so picking the same photo again still counts
            void fromPhoto(file);
          }}
        />
        <div className="actions">
          {stage.step === "missing" && (
            <button className="btn" type="button" onClick={again}>
              Scan another
            </button>
          )}
          {stage.step === "nocamera" && !noReader && (
            <button className="btn primary" type="button" onClick={() => photoRef.current?.click()}>
              Take a photo of it
            </button>
          )}
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
