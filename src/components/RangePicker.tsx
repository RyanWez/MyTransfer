"use client";

import * as React from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { toDayInput, type RangeKey } from "@/lib/chart";

export interface RangePickerProps {
  preset: RangeKey;
  onPresetChange: (key: RangeKey) => void;
  /** Half-open [from, to) currently in effect, for the custom inputs and the caption. */
  from: number;
  to: number;
  onCustomChange: (fromDay: string, toDay: string) => void;
}

const inputClass =
  "rounded border border-hairline bg-card px-2 py-1.5 font-mono text-xs tnum text-ink " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

/**
 * One filter row above the charts. Presets come first because "today" and "last 7 days"
 * are what gets reached for; the custom pair only appears once it's asked for, so the
 * row stays quiet in the common case.
 */
export function RangePicker({
  preset,
  onPresetChange,
  from,
  to,
  onCustomChange,
}: RangePickerProps) {
  // `to` is exclusive; the picker shows the last day actually included.
  const lastDay = toDayInput(to - 1);
  const firstDay = toDayInput(from);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl<RangeKey>
        aria-label="Date range"
        value={preset}
        onValueChange={onPresetChange}
        options={[
          { value: "today", label: "Today" },
          { value: "7d", label: "7 days" },
          { value: "30d", label: "30 days" },
          { value: "custom", label: "Custom" },
        ]}
      />

      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="range-from">
            First day
          </label>
          <input
            id="range-from"
            type="date"
            value={firstDay}
            max={lastDay}
            onChange={(e) => e.target.value && onCustomChange(e.target.value, lastDay)}
            className={inputClass}
          />
          <span className="font-mono text-eyebrow uppercase text-ink-mute">to</span>
          <label className="sr-only" htmlFor="range-to">
            Last day
          </label>
          <input
            id="range-to"
            type="date"
            value={lastDay}
            min={firstDay}
            onChange={(e) => e.target.value && onCustomChange(firstDay, e.target.value)}
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
}
