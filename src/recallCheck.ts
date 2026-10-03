import { useEffect, useMemo, useState } from "react";
import { findRecallMatches, fromFda, matchKey, recallQuery, type Recall, type RecallMatch } from "./recalls";
import type { Household } from "./types";

// Recalls are fetched at most twice a day and kept on this device, so the list works offline too.
const CACHE = "ks-recalls-v2"; // v2: recalls carry the barcodes they list
const CHECKED = "ks-recalls-checked";
const FRESH_MS = 12 * 3600e3;

function read<T>(k: string): T | null {
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked: just refetch next time */
  }
}

/** Ongoing FDA food recalls, from this device's copy when it's fresh. Never throws. */
export async function loadRecalls(now = new Date(), f: typeof fetch = fetch): Promise<Recall[]> {
  const cached = read<{ at: number; recalls: Recall[] }>(CACHE);
  if (cached && now.getTime() - cached.at < FRESH_MS) return cached.recalls;
  try {
    const res = await f(recallQuery(now));
    // openFDA answers 404 when nothing matches the search.
    if (res.status === 404) {
      write(CACHE, { at: now.getTime(), recalls: [] });
      return [];
    }
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { results?: Parameters<typeof fromFda>[0] };
    const recalls = fromFda(j.results ?? []);
    write(CACHE, { at: now.getTime(), recalls });
    return recalls;
  } catch {
    return cached?.recalls ?? [];
  }
}

export const checkedKeys = (): string[] => read<string[]>(CHECKED) ?? [];
export function markChecked(key: string) {
  write(CHECKED, [...new Set([...checkedKeys(), key])].slice(-500));
}

/** The kitchen's possible recall matches, minus the ones already checked. */
export function useRecallMatches(h: Household | null, state = "WA") {
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [checked, setChecked] = useState<string[]>(checkedKeys);
  useEffect(() => {
    let live = true;
    void loadRecalls().then((r) => live && setRecalls(r));
    return () => {
      live = false;
    };
  }, []);
  const matches: RecallMatch[] = useMemo(
    () => (h ? findRecallMatches(h, recalls, state).filter((m) => !checked.includes(matchKey(m))) : []),
    [h, recalls, checked, state],
  );
  const check = (m: RecallMatch) => {
    markChecked(matchKey(m));
    setChecked(checkedKeys());
  };
  return { matches, check };
}
