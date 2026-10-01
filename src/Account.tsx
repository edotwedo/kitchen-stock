import { useState } from "react";
import { createInvite, createKitchen, deviceList, joinKitchen, openKitchen, sendCode, signOut, verifyCode, type AppState } from "./store";
import { DEFAULT_FREEZER_DAYS, type Household } from "./types";

const EMPTY_KITCHEN: Household = {
  name: "My kitchen",
  locations: [
    { key: "fridge", label: "Fridge", kind: "fridge" },
    { key: "freezer", label: "Freezer", kind: "freezer" },
    { key: "pantry", label: "Pantry", kind: "pantry" },
  ],
  freezerDays: { ...DEFAULT_FREEZER_DAYS },
  flags: [],
  people: [],
  items: [],
};

function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (job: () => Promise<string | null | void>) => {
    setBusy(true);
    setError("");
    const err = await job();
    setBusy(false);
    if (err) setError(err);
  };
  return { busy, error, run };
}

export function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useBusy();

  return (
    <div className="wrap">
      <div className="welcome">
        <h1>Kitchen Stock</h1>
        {!sent ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const err = await sendCode(email);
                if (!err) setSent(true);
                return err;
              });
            }}
          >
            <p>Sign in with your email. We'll send you a code, so there's no password to remember.</p>
            <label className="field">
              Email
              <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <button className="btn primary" type="submit" disabled={busy || !email.includes("@")}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={(e) => (e.preventDefault(), void run(() => verifyCode(email, code)))}>
            <p>
              Check <strong>{email}</strong> for a code and type it here.
            </p>
            <label className="field">
              Code
              <input autoComplete="one-time-code" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="code" />
            </label>
            <button className="btn primary" type="submit" disabled={busy || code.replace(/\D/g, "").length < 6}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button className="btn" type="button" onClick={() => (setSent(false), setCode(""))}>
              Use a different email
            </button>
          </form>
        )}
        {error && <p className="formerror">{error}</p>}
      </div>
    </div>
  );
}

/** Signed in, but not part of any kitchen yet. */
export function NoKitchen({ email }: { email: string | null }) {
  const local = deviceList();
  const [name, setName] = useState(local?.name ?? "");
  const [code, setCode] = useState("");
  const { busy, error, run } = useBusy();

  return (
    <div className="wrap">
      <div className="welcome">
        <h1>Set up a kitchen</h1>
        <p>Signed in as {email}. Start a kitchen of your own, or join one with a code someone sent you.</p>
        <div className="stack">
          <label className="field">
            Kitchen name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Smith kitchen" />
          </label>
          {local && local.items.length > 0 && (
            <button className="btn primary" type="button" disabled={busy} onClick={() => void run(() => createKitchen(name || local.name, local))}>
              Start it with this phone's list ({local.items.length} items)
            </button>
          )}
          <button className={"btn" + (local?.items.length ? "" : " primary")} type="button" disabled={busy} onClick={() => void run(() => createKitchen(name || "My kitchen", EMPTY_KITCHEN))}>
            Start an empty kitchen
          </button>
        </div>
        <form className="stack join" onSubmit={(e) => (e.preventDefault(), void run(() => joinKitchen(code)))}>
          <label className="field">
            Or join with a code
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="a1b2c3d4e5f6" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </label>
          <button className="btn" type="submit" disabled={busy || code.trim().length < 6}>
            Join kitchen
          </button>
        </form>
        {error && <p className="formerror">{error}</p>}
        <button className="linkbtn" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Settings section: who's signed in, inviting people, switching kitchens. */
export function Sharing({ app }: { app: AppState }) {
  const [invite, setInvite] = useState("");
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useBusy();
  const current = app.kitchens.find((k) => k.id === app.kitchenId);
  const others = app.kitchens.filter((k) => k.id !== app.kitchenId);

  return (
    <>
      <p className="hint">
        Signed in as <strong>{app.email}</strong>
        {current && <> as this kitchen's {current.role}</>}.
      </p>
      {current?.role === "owner" && (
        <div className="card">
          <p className="hint small">Send a code to anyone who should share this list. Each code works once, for 7 days.</p>
          {invite ? (
            <div className="line">
              <input readOnly value={invite} aria-label="Invite code" className="code" onFocus={(e) => e.target.select()} />
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(invite).then(() => setCopied(true));
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await createInvite();
                  if (r.code) setInvite(r.code);
                  return r.error ?? null;
                })
              }
            >
              Make an invite code
            </button>
          )}
        </div>
      )}
      {others.length > 0 && (
        <div className="menu">
          <span className="hint small">Your other kitchens</span>
          {others.map((k) => (
            <button key={k.id} className="btn" type="button" onClick={() => void openKitchen(k.id)}>
              {k.name} <small>{k.role}</small>
            </button>
          ))}
        </div>
      )}
      {error && <p className="formerror">{error}</p>}
      <button className="btn" type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  );
}
