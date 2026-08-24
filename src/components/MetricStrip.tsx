"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/format";
import { CountUp } from "@/components/CountUp";

export interface Metric {
  label: string;
  /**
   * A string renders as-is; a number counts up to its target (and re-animates
   * between updates) using `format`.
   */
  value: string | number;
  sub?: string;
  tone?: Tone;
  /** Formatter for numeric values; defaults to en-US grouping. */
  format?: (n: number) => string;
}

const valueTone: Record<Tone, string> = {
  signal: "text-ink",
  alert: "text-alert-deep",
  brass: "text-brass-deep",
  muted: "text-ink",
};

/** Explicit classes so Tailwind's scanner keeps them — a template string wouldn't be seen. */
const columns: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
};

/**
 * A light scale-punch when a numeric metric changes — keyed off the *target*
 * value so the running count-up doesn't retrigger it every frame.
 */
function PunchOnChange({
  valueKey,
  children,
  className,
}: {
  valueKey: string | number;
  children: React.ReactNode;
  className?: string;
}) {
  const [punching, setPunching] = React.useState(false);
  const prev = React.useRef(valueKey);

  React.useEffect(() => {
    if (!Object.is(prev.current, valueKey)) {
      prev.current = valueKey;
      setPunching(true);
    }
  }, [valueKey]);

  return (
    <div
      className={cn(className, punching && "animate-cell-punch")}
      onAnimationEnd={() => setPunching(false)}
    >
      {children}
    </div>
  );
}

/**
 * Metrics as hairline-divided columns rather than boxed cards — one less border
 * per figure, and it reads as an instrument panel. `gap-px` over a hairline
 * background gives exact 1px dividers that survive wrapping.
 *
 * `stagger` lets each cell rise in sequence on mount — used by the dashboard's
 * entrance cascade.
 */
function MetricStrip({
  items,
  className,
  stagger,
}: {
  items: Metric[];
  className?: string;
  stagger?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded border border-hairline bg-hairline",
        columns[items.length] ?? "grid-cols-2 md:grid-cols-4",
        className
      )}
    >
      {items.map((m, i) => (
        <div
          key={m.label}
          style={stagger ? { animationDelay: `${i * 60}ms` } : undefined}
          className={cn("bg-card px-4 py-3.5", stagger && "animate-rise-spring")}
        >
          <div className="font-mono text-eyebrow font-semibold uppercase text-ink-mute">
            {m.label}
          </div>
          <PunchOnChange valueKey={m.value} className="mt-1.5 font-mono text-xl tnum">
            <span className={valueTone[m.tone ?? "muted"]}>
              {typeof m.value === "number" ? (
                <CountUp value={m.value} format={m.format} duration={700} />
              ) : (
                m.value
              )}
            </span>
          </PunchOnChange>
          {m.sub && <div className="mt-0.5 text-xs text-ink-faint">{m.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export { MetricStrip };
