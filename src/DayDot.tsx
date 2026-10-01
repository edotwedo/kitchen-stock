import type { CSSProperties } from "react";

/** The weekday an item was frozen, in the kitchen day-dot color. */
export function DayDot({ day }: { day: { n: number; short: string; long: string } }) {
  return (
    <span className={"daydot d" + day.n} style={{ "--dot": `var(--day-${day.n})` } as CSSProperties} title={day.long} role="img" aria-label={day.long}>
      {day.short}
    </span>
  );
}
