"use client";

import * as React from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { type RangeKey } from "@/lib/chart";

export interface RangePickerProps {
  preset: RangeKey;
  onPresetChange: (key: RangeKey) => void;
  /** Half-open [from, to) currently in effect, for the date picker and the caption. */
  from: number;
  to: number;
  onRangeChange: (from: number, to: number) => void;
}

/**
 * Filter row above the dashboard charts. Includes quick preset tabs and the
 * interactive dual-month DateRangePicker.
 */
export function RangePicker({
  preset,
  onPresetChange,
  from,
  to,
  onRangeChange,
}: RangePickerProps) {
  const dateRangeValue: DateRange = {
    from,
    to: to > from ? to - 1 : to,
  };

  function handleDateRangeChange(range: DateRange) {
    if (range.from && range.to) {
      // to is exclusive midnight at the start of the next day
      const nextTo = range.to + 1;
      onRangeChange(range.from, nextTo);
      onPresetChange("custom");
    }
  }

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

      <DateRangePicker
        value={dateRangeValue}
        onChange={handleDateRangeChange}
        align="left"
      />
    </div>
  );
}

