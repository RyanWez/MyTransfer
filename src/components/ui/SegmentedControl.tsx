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
  /** Locks the whole control — e.g. while an SMS code is pending. */
  disabled?: boolean;
}

/**
 * Segmented control with one shared "pill" that slides under the selected
 * option, instead of each button painting its own background. The pill is a
 * single absolutely-positioned element measured against the active button, so
 * selection changes animate as movement rather than a crossfade.
 */
function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  fullWidth,
  disabled,
  ...props
}: SegmentedControlProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [pill, setPill] = React.useState<{ left: number; width: number } | null>(null);

  const measure = React.useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const buttons = Array.from(c.querySelectorAll<HTMLButtonElement>("[role='tab']"));
    const active =
      buttons.find((b) => b.getAttribute("aria-selected") === "true") ?? buttons[0];
    if (!active) return;
    setPill({ left: active.offsetLeft, width: active.offsetWidth });
  }, []);

  // Re-measure whenever the selection (or the option list) changes. A plain
  // effect keeps SSR happy; the pill stays hidden until the first measurement.
  React.useEffect(() => {
    measure();
  }, [measure, value, options]);

  React.useEffect(() => {
    const c = containerRef.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(c);
    // Web fonts landing late can shift label widths; settle once they're in.
    document.fonts?.ready.then(() => measure()).catch(() => {});
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={props["aria-label"]}
      className={cn(
        "relative flex items-center gap-px rounded border border-hairline bg-hairline p-px",
        fullWidth ? "w-full" : "inline-flex",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute bottom-px top-px rounded-sm bg-ink shadow-sm transition-[left,width] duration-200 ease-out",
          !pill && "opacity-0"
        )}
        style={{ left: pill?.left ?? 0, width: pill?.width ?? 0 }}
      />
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onValueChange(o.value)}
            className={cn(
              "relative z-10 flex h-10 items-center justify-center rounded-sm px-3 py-2 font-mono text-eyebrow font-semibold uppercase transition-colors duration-150 sm:h-8 sm:py-1.5",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass",
              selected ? "text-substrate" : "text-ink-mute hover:text-ink",
              disabled && "cursor-not-allowed opacity-50",
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
