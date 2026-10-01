import type { ItemRow } from "./cloud";

/**
 * Changes waiting to reach the shared database. Kept on the phone so a change made
 * with no signal (a garage freezer, a basement) is sent later instead of lost.
 * Later changes to the same item replace earlier ones; only the newest settings are kept.
 */
export interface Outbox {
  settings: { name: string; settings: Record<string, unknown> } | null;
  upserts: Record<string, ItemRow>;
  deletes: string[];
}

export const emptyOutbox = (): Outbox => ({ settings: null, upserts: {}, deletes: [] });

export function isEmpty(o: Outbox): boolean {
  return !o.settings && !Object.keys(o.upserts).length && !o.deletes.length;
}

export function size(o: Outbox): number {
  return (o.settings ? 1 : 0) + Object.keys(o.upserts).length + o.deletes.length;
}

/** Add a change to what's waiting. */
export function record(o: Outbox, change: { settings?: Outbox["settings"]; upserts?: ItemRow[]; deletes?: string[] }): Outbox {
  const upserts = { ...o.upserts };
  let deletes = [...o.deletes];
  for (const r of change.upserts ?? []) {
    upserts[r.id] = r;
    deletes = deletes.filter((d) => d !== r.id);
  }
  for (const id of change.deletes ?? []) {
    delete upserts[id];
    if (!deletes.includes(id)) deletes.push(id);
  }
  return { settings: change.settings ?? o.settings, upserts, deletes };
}

/**
 * Remove what was just sent, keeping anything that changed again while it was in flight
 * (compared by object identity: record() always stores new objects).
 */
export function settle(now: Outbox, sent: Outbox): Outbox {
  const upserts: Record<string, ItemRow> = {};
  for (const [id, row] of Object.entries(now.upserts)) if (sent.upserts[id] !== row) upserts[id] = row;
  return {
    settings: now.settings === sent.settings ? null : now.settings,
    upserts,
    deletes: now.deletes.filter((d) => !sent.deletes.includes(d) || d in upserts),
  };
}

/** A failed request that never reached the server (no signal), as opposed to one it refused. */
export function isOffline(result: { error: unknown; status?: number }): boolean {
  if (!result.error) return false;
  if (result.status === 0) return true;
  const msg = String((result.error as { message?: string }).message ?? "");
  return /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
}
