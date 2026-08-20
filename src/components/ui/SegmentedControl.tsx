"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  "aria-label"?: string;
  fullWidth?: boolean;
}

function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  fullWidth,
  ...props
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={props["aria-label"]}
      className={cn(
        "flex items-center gap-px rounded border border-hairline bg-hairline p-px",
        fullWidth ? "w-full" : "inline-flex",
        className
      )}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onValueChange(o.value)}
            className={cn(
              "rounded-sm px-3 py-2 sm:py-1.5 h-10 sm:h-8 flex items-center justify-center font-mono text-eyebrow font-semibold uppercase transition-colors duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink",
              selected ? "bg-ink text-substrate" : "bg-card text-ink-mute hover:text-ink",
              fullWidth && "flex-1"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
