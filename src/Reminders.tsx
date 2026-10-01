import { useEffect, useState } from "react";
import { morningNotice, shoppingNotice } from "../supabase/functions/_shared/reminders";
import { toRow } from "./cloud";
import { toIso } from "./logic";
import { disablePush, enablePush, pushConfigured, pushEnabled, pushSupport } from "./push";
import type { Household } from "./types";

/** Settings section: turn phone reminders on, and preview what they say. */
export function Reminders({ h, kitchenId }: { h: Household; kitchenId: string | null }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const support = pushSupport();

  useEffect(() => {
    void pushEnabled().then(setOn);
  }, []);

  const rows = h.items.map((i) => toRow(kitchenId ?? "", i));
  const k = { name: h.name, settings: { locations: h.locations, freezerDays: h.freezerDays } };
  const morning = morningNotice(k, rows, toIso(new Date()));
  const shopping = shoppingNotice(k, rows);

  const toggle = async () => {
    if (!kitchenId) return;
    setBusy(true);
    setMsg("");
    const err = on ? await disablePush() : await enablePush(kitchenId);
    setBusy(false);
    if (err) setMsg(err);
    else setOn(!on);
  };

  return (
    <>
      <p className="hint">One notification each morning at 8 for anything due in the next 3 days, frozen food nearing its best-by, and reminders you've set. The shopping list comes Saturday at 9.</p>
      {!pushConfigured ? (
        <p className="hint small">Reminders switch on once the app is online and set up (see supabase/README.md). The preview below shows what they'll say.</p>
      ) : support === "install-first" ? (
        <p className="hint small">On iPhone, add Kitchen Stock to your Home Screen first (Share, then Add to Home Screen), and turn reminders on from there.</p>
      ) : support === "unsupported" ? (
        <p className="hint small">This browser can't show reminders. Try Chrome on Android, or the Home Screen app on iPhone.</p>
      ) : (
        <div className="menu">
          <button className="btn" type="button" disabled={busy || on === null || !kitchenId} onClick={() => void toggle()}>
            {on ? "Turn reminders off on this phone" : "Turn on reminders on this phone"}
          </button>
        </div>
      )}
      {msg && <p className="formerror">{msg}</p>}
      <div className="notice-preview" aria-label="Reminder preview">
        <span className="hint small">This morning's reminder would say</span>
        {morning ? (
          <div className="notice">
            <strong>{morning.title}</strong>
            <span>{morning.body}</span>
          </div>
        ) : (
          <div className="notice">
            <span>Nothing today, so no notification.</span>
          </div>
        )}
        {shopping && (
          <>
            <span className="hint small">Saturday's would say</span>
            <div className="notice">
              <strong>{shopping.title}</strong>
              <span>{shopping.body}</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
