"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/format";

export interface Metric {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}

const valueTone: Record<Tone, string> = {
  signal: "text-ink",
  alert: "text-alert-deep",
  brass: "text-brass-deep",
  muted: "text-ink",
};

/**
 * Metrics as hairline-divided columns rather than boxed cards — one less border
 * per figure, and it reads as an instrument panel. `gap-px` over a hairline
 * background gives exact 1px dividers that survive wrapping.
 */
function MetricStrip({ items, className }: { items: Metric[]; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded border border-hairline bg-hairline md:grid-cols-4",
        className
      )}
    >
      {items.map((m) => (
        <div key={m.label} className="bg-card px-4 py-3.5">
          <div className="font-mono text-eyebrow font-semibold uppercase text-ink-mute">
            {m.label}
          </div>
          <div
            className={cn(
              "mt-1.5 font-mono text-xl tnum",
              valueTone[m.tone ?? "muted"]
            )}
          >
            {m.value}
          </div>
          {m.sub && <div className="mt-0.5 text-xs text-ink-faint">{m.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export { MetricStrip };
