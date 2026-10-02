import { useEffect, useState } from "react";
import { createInvite, createKitchen, deleteAccount, deviceList, joinKitchen, listMembers, openKitchen, removeMember, sendCode, setMemberRole, signOut, startDemo, verifyCode, type AppState, type Member } from "./store";
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
      <main className="welcome">
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
              Check <strong>{email}</strong>. Tap the sign-in link in the email, or type the code if it has one.
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
        <button className="linkbtn try" type="button" onClick={startDemo}>
          Just looking? Try it with a sample kitchen
        </button>
      </main>
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
      <main className="welcome">
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
        <TwoTap label="Delete my account" confirm="Tap again to delete it for good" disabled={busy} onConfirm={() => void run(deleteAccount)} />
      </main>
    </div>
  );
}

/** Settings section: who's in this kitchen, inviting people (as members or owners), switching kitchens. */
export function Sharing({ app }: { app: AppState }) {
  const current = app.kitchens.find((k) => k.id === app.kitchenId);
  const owner = current?.role === "owner";
  const others = app.kitchens.filter((k) => k.id !== app.kitchenId);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [note, setNote] = useState("");
  const { busy, error, run } = useBusy();

  const load = () =>
    void listMembers().then((r) => {
      setMembers(r.members ?? null);
      setNote(r.error ?? "");
    });
  useEffect(load, [app.kitchenId]);

  const act = (job: () => Promise<string | null>) =>
    void run(async () => {
      const err = await job();
      if (!err) load();
      return err;
    });

  return (
    <>
      <p className="hint">
        Signed in as <strong>{app.email}</strong>
        {current && <>, this kitchen's {current.role}</>}.
      </p>

      {members && (
        <div className="people">
          {members.map((m) => {
            const me = m.userId === app.userId;
            return (
              <div className="person" key={m.userId}>
                <span className="who">
                  {m.email}
                  {me && <small> (you)</small>}
                </span>
                <span className={"role " + m.role}>{m.role}</span>
                {owner && !me && (
                  <span className="person-actions">
                    <button className="linkbtn" type="button" disabled={busy} onClick={() => act(() => setMemberRole(m.userId, m.role === "owner" ? "member" : "owner"))}>
                      {m.role === "owner" ? "Make member" : "Make owner"}
                    </button>
                    <TwoTap label="Remove" confirm="Tap again" disabled={busy} onConfirm={() => act(() => removeMember(m.userId))} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {note && <p className="hint small">{note}</p>}

      {owner && <InviteMaker />}

      <NewKitchen />

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
      <div className="menu">
        {current && members && members.length > 1 && (
          <TwoTap label="Leave this kitchen" confirm="Tap again to leave" className="btn" disabled={busy} onConfirm={() => act(() => removeMember())} />
        )}
        <button className="btn" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      <div className="menu">
        <span className="hint small">Delete your account for good: kitchens only you use are deleted with everything in them; shared kitchens stay with the others (if you're the only owner, the person who joined next becomes owner).</span>
        <TwoTap label="Delete my account" confirm="Tap again to delete it for good" disabled={busy} onConfirm={() => act(deleteAccount)} />
      </div>
    </>
  );
}

/**
 * Start another kitchen from the same account: a client's, a second home, a cabin. The new one
 * opens right away, empty, with the usual three places; switch back under "Your other kitchens".
 */
function NewKitchen() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { busy, error, run } = useBusy();
  if (!open)
    return (
      <div className="menu">
        <button className="btn" type="button" onClick={() => setOpen(true)}>
          Set up another kitchen
        </button>
        <span className="hint small">For a client, a second home, anywhere. Each kitchen has its own list and its own people.</span>
      </div>
    );
  return (
    <form
      className="menu"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => createKitchen(name.trim() || "New kitchen", { ...EMPTY_KITCHEN, name: name.trim() || "New kitchen" }));
      }}
    >
      <label className="field">
        Kitchen name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. The Garcias' kitchen" autoFocus />
      </label>
      <div className="addrow">
        <button className="btn" type="button" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Setting up…" : "Create and open it"}
        </button>
      </div>
      {error && <p className="formerror">{error}</p>}
    </form>
  );
}

/** Make a one-time invite code: as a member (shares the list) or an owner (hands the kitchen over). */
function InviteMaker() {
  const [invite, setInvite] = useState<{ code: string; role: Member["role"] } | null>(null);
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useBusy();
  const make = (role: Member["role"]) =>
    void run(async () => {
      const r = await createInvite(role);
      if (r.code) {
        setInvite({ code: r.code, role });
        setCopied(false);
      }
      return r.error ?? null;
    });

  return (
    <div className="card">
      <p className="hint small">
        Each code works once, for 7 days. A <strong>member</strong> shares and edits the list. An <strong>owner</strong> can also invite people and change who's in it: use that to hand a kitchen over to a client, then stay on or leave.
      </p>
      {invite ? (
        <>
          <div className="line">
            <input readOnly value={invite.code} aria-label="Invite code" className="code" onFocus={(e) => e.target.select()} />
            <button
              className="btn"
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(invite.code).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="hint small">
            This code joins as {invite.role === "owner" ? "an owner" : "a member"}.{" "}
            <button className="linkbtn" type="button" onClick={() => setInvite(null)}>
              Make another
            </button>
          </p>
        </>
      ) : (
        <div className="line">
          <button className="btn" type="button" disabled={busy} onClick={() => make("member")}>
            Invite a member
          </button>
          <button className="btn" type="button" disabled={busy} onClick={() => make("owner")}>
            Invite an owner
          </button>
        </div>
      )}
      {error && <p className="formerror">{error}</p>}
    </div>
  );
}

/** A button that asks for a second tap before doing something hard to undo. */
function TwoTap({ label, confirm, onConfirm, disabled, className }: { label: string; confirm: string; onConfirm: () => void; disabled?: boolean; className?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      className={(className ?? "linkbtn danger") + (armed ? " armed" : "")}
      type="button"
      disabled={disabled}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}
