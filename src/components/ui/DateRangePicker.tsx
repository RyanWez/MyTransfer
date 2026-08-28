"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: number | null; // unix timestamp (seconds) at start of day 00:00:00
  to: number | null; // unix timestamp (seconds) at end of day 23:59:59
}

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
  /** Preferred edge to line the panel up with; it flips when there's no room. */
  align?: "left" | "right";
}

/** Gap between the trigger and the panel, and the least space kept at any edge. */
const PANEL_GAP = 6;
const VIEWPORT_MARGIN = 8;
/** Below this much room the panel drops to a single month rather than overflowing. */
const DUAL_MONTH_MIN_WIDTH = 620;

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatDateStr(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTimestampToStr(ts: number | null): string {
  if (ts === null) return "";
  const d = new Date(ts * 1000);
  return formatDateStr(d);
}

function startOfDayTs(d: Date): number {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  return Math.floor(c.getTime() / 1000);
}

function endOfDayTs(d: Date): number {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return Math.floor(c.getTime() / 1000);
}

interface MonthGrid {
  year: number;
  month: number;
  days: {
    date: Date;
    ts: number;
    isCurrentMonth: boolean;
    dayNum: number;
  };
}

function generateMonthDays(year: number, month: number) {
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: {
    date: Date;
    ts: number;
    isCurrentMonth: boolean;
    dayNum: number;
  }[] = [];

  // Previous month padding
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    days.push({
      date: d,
      ts: startOfDayTs(d),
      isCurrentMonth: false,
      dayNum: prevMonthDays - i,
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    days.push({
      date: d,
      ts: startOfDayTs(d),
      isCurrentMonth: true,
      dayNum: i,
    });
  }

  // Next month padding to reach 42 cells (6 rows)
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({
      date: d,
      ts: startOfDayTs(d),
      isCurrentMonth: false,
      dayNum: i,
    });
  }

  return { year, month, days };
}

export function DateRangePicker({
  value,
  onChange,
  className,
  align = "right",
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reference date for view (left month)
  const initialDate = value.from ? new Date(value.from * 1000) : new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  // Transient selection during picking
  const [pendingFrom, setPendingFrom] = useState<number | null>(value.from);
  const [pendingTo, setPendingTo] = useState<number | null>(value.to);
  const [hoverTs, setHoverTs] = useState<number | null>(null);

  /**
   * The panel is portalled to the body and placed by hand.
   *
   * Anchoring it with `right-0` inside the page put a ~600px dual-month panel
   * wherever the trigger happened to sit: in the History header the trigger is
   * mid-row, so the panel started at x=-97 — half of it off the left of the
   * window and behind the sidebar, which shares its z-index. Portalling escapes
   * every ancestor stacking context and clip, and the measurements below flip the
   * panel to the trigger's other edge before shifting it inside the viewport, so
   * it can't leave the screen no matter where the trigger is.
   */
  const [mounted, setMounted] = useState(false);
  const [placement, setPlacement] = useState<{
    left: number;
    top: number;
    /** Room the panel is allowed to take, so it never has to overflow. */
    available: number;
  } | null>(null);

  useEffect(() => setMounted(true), []);

  /**
   * Space the panel may occupy: the trigger's scroll container, clamped to the
   * window. Measured rather than assumed from a breakpoint, because the sidebar
   * takes 240px out of the row at exactly the widths where a dual-month panel
   * stops fitting.
   */
  const measureBounds = useCallback((trigger: HTMLElement) => {
    const content = trigger.closest("main")?.getBoundingClientRect();
    const minLeft = Math.max(VIEWPORT_MARGIN, (content?.left ?? 0) + VIEWPORT_MARGIN);
    const maxRight = Math.min(
      window.innerWidth - VIEWPORT_MARGIN,
      (content?.right ?? window.innerWidth) - VIEWPORT_MARGIN
    );
    return { minLeft, maxRight, available: Math.max(0, maxRight - minLeft) };
  }, []);

  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const anchor = trigger.getBoundingClientRect();
    const { minLeft, maxRight, available } = measureBounds(trigger);
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;

    // Preferred edge first, the opposite edge if that would overflow, then a
    // plain clamp so a panel wider than its container still starts in bounds.
    let left = align === "right" ? anchor.right - width : anchor.left;
    if (left < minLeft || left + width > maxRight) {
      const flipped = align === "right" ? anchor.left : anchor.right - width;
      if (flipped >= minLeft && flipped + width <= maxRight) left = flipped;
    }
    left = Math.max(minLeft, Math.min(left, Math.max(minLeft, maxRight - width)));

    // Below the trigger unless the space above is genuinely roomier.
    const below = anchor.bottom + PANEL_GAP;
    const fitsBelow = below + height <= window.innerHeight - VIEWPORT_MARGIN;
    const above = anchor.top - PANEL_GAP - height;
    const top = fitsBelow || above < VIEWPORT_MARGIN ? below : above;

    setPlacement({ left, top, available });
  }, [align, measureBounds]);

  /**
   * Two months need roughly 600px. Below that the panel shows one, so a narrow
   * container gets a smaller panel rather than one that hangs off the edge.
   * Measured before the first paint so the panel is never laid out at the wrong
   * size and then corrected.
   */
  const [available, setAvailable] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    setAvailable(measureBounds(triggerRef.current).available);
  }, [open, measureBounds]);
  const dualMonth = (placement?.available ?? available ?? 0) >= DUAL_MONTH_MIN_WIDTH;

  // Measure once the panel exists, then keep up with scrolling and resizing.
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    // Capture phase: the page may scroll inside a container, not just the window.
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  // Sync state when opened
  useEffect(() => {
    if (open) {
      setPendingFrom(value.from);
      setPendingTo(value.to);
      setHoverTs(null);
      const d = value.from ? new Date(value.from * 1000) : new Date();
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [open, value]);

  // Click outside to close. The panel is no longer a descendant of the trigger's
  // container, so it has to be checked separately or picking a date would close.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Navigation handlers
  function prevYear() {
    setViewYear((y) => y - 1);
  }
  function nextYear() {
    setViewYear((y) => y + 1);
  }
  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // Left & Right month grids
  const leftMonthGrid = useMemo(() => generateMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const rightYear = viewMonth === 11 ? viewYear + 1 : viewYear;
  const rightMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  const rightMonthGrid = useMemo(() => generateMonthDays(rightYear, rightMonth), [rightYear, rightMonth]);

  function handleDayClick(dayTs: number) {
    if (pendingFrom === null || (pendingFrom !== null && pendingTo !== null)) {
      // Start a new selection
      setPendingFrom(dayTs);
      setPendingTo(null);
      setHoverTs(null);
    } else {
      // Complete range selection
      if (dayTs < pendingFrom) {
        const start = dayTs;
        const end = endOfDayTs(new Date(pendingFrom * 1000));
        setPendingFrom(start);
        setPendingTo(end);
        onChange({ from: start, to: end });
        setOpen(false);
      } else {
        const start = pendingFrom;
        const end = endOfDayTs(new Date(dayTs * 1000));
        setPendingFrom(start);
        setPendingTo(end);
        onChange({ from: start, to: end });
        setOpen(false);
      }
    }
  }

  // Quick Preset Helper
  function applyPreset(preset: "today" | "yesterday" | "7d" | "30d" | "thisMonth" | "all") {
    const today = new Date();
    if (preset === "today") {
      const from = startOfDayTs(today);
      const to = endOfDayTs(today);
      onChange({ from, to });
    } else if (preset === "yesterday") {
      const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const from = startOfDayTs(y);
      const to = endOfDayTs(y);
      onChange({ from, to });
    } else if (preset === "7d") {
      const past = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      const from = startOfDayTs(past);
      const to = endOfDayTs(today);
      onChange({ from, to });
    } else if (preset === "30d") {
      const past = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      const from = startOfDayTs(past);
      const to = endOfDayTs(today);
      onChange({ from, to });
    } else if (preset === "thisMonth") {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const from = startOfDayTs(first);
      const to = endOfDayTs(last);
      onChange({ from, to });
    } else if (preset === "all") {
      onChange({ from: null, to: null });
    }
    setOpen(false);
  }

  const fromStr = formatTimestampToStr(value.from);
  const toStr = formatTimestampToStr(value.to);

  // Range helper for highlighting
  const currentStart = pendingFrom;
  const currentEnd = pendingTo !== null ? pendingTo : (pendingFrom !== null && hoverTs !== null ? hoverTs : null);
  const effectiveStart = currentStart !== null && currentEnd !== null ? Math.min(currentStart, currentEnd) : currentStart;
  const effectiveEnd = currentStart !== null && currentEnd !== null ? Math.max(currentStart, currentEnd) : null;

  /**
   * `nav` says which arrows this month carries. Side by side they split them —
   * back on the left month, forward on the right — but a single-month panel needs
   * both, or a narrow window could only ever move forwards.
   */
  function renderMonth(
    grid: ReturnType<typeof generateMonthDays>,
    nav: "back" | "forward" | "both"
  ) {
    const showBack = nav === "back" || nav === "both";
    const showForward = nav === "forward" || nav === "both";

    return (
      <div className="w-64 shrink-0 select-none">
        {/* Month Header */}
        <div className="flex items-center justify-between pb-3 text-xs">
          {showBack ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevYear}
                className="rounded p-1 text-ink-mute hover:bg-substrate hover:text-ink transition-colors"
                title="Previous year"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={prevMonth}
                className="rounded p-1 text-ink-mute hover:bg-substrate hover:text-ink transition-colors"
                title="Previous month"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : <div className="w-12" />}

          <div className="font-semibold text-ink text-sm">
            {MONTHS[grid.month]} {grid.year}
          </div>

          {showForward ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={nextMonth}
                className="rounded p-1 text-ink-mute hover:bg-substrate hover:text-ink transition-colors"
                title="Next month"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={nextYear}
                className="rounded p-1 text-ink-mute hover:bg-substrate hover:text-ink transition-colors"
                title="Next year"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : <div className="w-12" />}
        </div>

        {/* Weekday Labels */}
        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] font-medium text-ink-faint pb-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-0.5">{w}</div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-1 gap-x-0.5 text-center font-mono text-xs">
          {grid.days.map((d, idx) => {
            const isStart = effectiveStart !== null && (d.ts === effectiveStart || (effectiveStart >= d.ts && effectiveStart < d.ts + 86400));
            const isEnd = effectiveEnd !== null && (d.ts === effectiveEnd || (effectiveEnd >= d.ts && effectiveEnd <= d.ts + 86400));
            const inRange = effectiveStart !== null && effectiveEnd !== null && d.ts >= effectiveStart && d.ts <= effectiveEnd;

            return (
              <button
                key={`${d.ts}-${idx}`}
                type="button"
                onClick={() => handleDayClick(d.ts)}
                onMouseEnter={() => pendingFrom !== null && pendingTo === null && setHoverTs(d.ts)}
                className={cn(
                  "relative h-8 w-full flex items-center justify-center transition-all text-xs focus:outline-none",
                  !d.isCurrentMonth && "text-ink-faint/30 hover:text-ink-mute",
                  d.isCurrentMonth && "text-ink hover:bg-substrate/80",
                  inRange && !isStart && !isEnd && "bg-blue-500/15 dark:bg-blue-600/20 text-blue-600 dark:text-blue-300 font-medium",
                  (isStart || isEnd) && "bg-blue-600 text-white font-semibold rounded-md shadow-sm z-10 hover:bg-blue-500",
                  isStart && effectiveEnd && !isEnd && "rounded-r-none",
                  isEnd && effectiveStart && !isStart && "rounded-l-none"
                )}
              >
                {d.dayNum}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left", className)}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-2.5 rounded border border-hairline bg-card px-3 font-mono text-xs text-ink transition-all hover:border-hairline-strong focus:outline-none focus:border-brass focus:ring-1 focus:ring-brass",
          open && "border-brass ring-1 ring-brass"
        )}
      >
        {value.from && value.to ? (
          <div className="flex items-center gap-2 tnum">
            <span>{fromStr}</span>
            <ArrowRight className="h-3 w-3 text-ink-mute" />
            <span>{toStr}</span>
          </div>
        ) : value.from ? (
          <span className="tnum">Since {fromStr}</span>
        ) : (
          <span className="text-ink-mute">All Time</span>
        )}
        <CalendarIcon className="h-3.5 w-3.5 text-ink-faint ml-1" />
      </button>

      {/* Panel — portalled to the body so no ancestor can clip it or paint over it. */}
      {open &&
        mounted &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Choose a date range"
            style={{
              left: placement?.left ?? 0,
              top: placement?.top ?? 0,
              maxWidth: placement?.available ?? available ?? undefined,
              // Hidden for the frame before the measurement lands, so it never
              // flashes at the top-left corner on the way to its real place.
              visibility: placement ? "visible" : "hidden",
            }}
            className="fixed z-[60] max-h-[calc(100vh-1rem)] overflow-auto rounded-lg border border-hairline bg-card p-4 shadow-2xl animate-rise-in"
          >
          {/* Quick Presets Bar */}
          <div className="flex flex-wrap items-center gap-1.5 pb-3.5 mb-3.5 border-b border-hairline">
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "7d", label: "Last 7 Days" },
              { id: "30d", label: "Last 30 Days" },
              { id: "thisMonth", label: "This Month" },
              { id: "all", label: "All Time" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id as any)}
                className="rounded px-2.5 py-1 font-mono text-xs font-medium text-ink-mute hover:bg-substrate hover:text-ink transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* One month or two, decided by measured room rather than a breakpoint —
              the sidebar eats 240px at exactly the widths where two stop fitting. */}
          <div className="flex gap-6">
            {renderMonth(leftMonthGrid, dualMonth ? "back" : "both")}
            {dualMonth && (
              <>
                <div className="border-r border-hairline" />
                {renderMonth(rightMonthGrid, "forward")}
              </>
            )}
          </div>

          {/* Footer with display and clear/close */}
          <div className="mt-4 pt-3 border-t border-hairline flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-mono text-ink-soft bg-substrate px-2.5 py-1 rounded border border-hairline">
              <span>{pendingFrom ? formatTimestampToStr(pendingFrom) : "Start date"}</span>
              <span className="text-ink-mute">→</span>
              <span>{pendingTo ? formatTimestampToStr(pendingTo) : (pendingFrom ? "Pick end date" : "End date")}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onChange({ from: null, to: null });
                  setOpen(false);
                }}
                className="text-xs text-ink-faint hover:text-alert transition-colors px-2 py-1 font-mono"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded bg-ink px-3 py-1 font-mono text-xs font-medium text-substrate hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          </div>
          </div>,
          document.body
        )}
    </div>
  );
}
