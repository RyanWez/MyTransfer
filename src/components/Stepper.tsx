"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Three ordered states — the sequence is real, so numbering carries information. */
function Stepper({
  steps,
  current,
  className,
}: {
  steps: string[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-center", className)}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className={cn("flex items-center", i > 0 && "flex-1")}>
            {i > 0 && (
              <span
                className={cn(
                  "mx-2 h-px flex-1 transition-colors duration-300",
                  done || active ? "bg-ink" : "bg-hairline"
                )}
                aria-hidden="true"
              />
            )}
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-semibold transition-colors duration-200",
                  done && "bg-ink text-substrate",
                  active && "bg-brass text-ink",
                  !done && !active && "border border-hairline-strong text-ink-faint"
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  "font-mono text-eyebrow font-semibold uppercase transition-colors duration-200",
                  active ? "text-ink" : done ? "text-ink-soft" : "text-ink-faint"
                )}
              >
                {label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export { Stepper };
