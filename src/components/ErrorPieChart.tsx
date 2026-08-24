"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CHART_INK } from "@/lib/chart";
import { CountUp } from "./CountUp";

export interface PieSlice {
  reason: string;
  count: number;
}

interface ErrorPieChartProps {
  data: PieSlice[];
  className?: string;
}

const COLORS = [
  CHART_INK.failed,
  "#F87171", // red-400
  "#FCA5A5", // red-300
  "#FECACA", // red-200
  "#FEE2E2", // red-100
];

/**
 * Donut of top error reasons.
 *
 * Each slice grows **in place** — its stroke-dasharray sweeps from `0` to its
 * final length while its position stays fixed — so the pie builds clockwise,
 * one segment after another (staggered delays, spring settle). The previous
 * version animated stroke-dashoffset from a full revolution, which sent every
 * arc flying around the circle before landing.
 *
 * Slices and legend rows are cross-highlighted on hover.
 */
export function ErrorPieChart({ data, className }: ErrorPieChartProps) {
  const [armed, setArmed] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  // Two frames: paint everything hidden, then release the staggered sweep.
  useEffect(() => {
    setArmed(false);
    setHover(null);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setArmed(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [data]);

  const total = data.reduce((acc, d) => acc + d.count, 0);
  if (total === 0) return null;

  let acc = 0;
  const slices = data.map((d, i) => {
    const percentage = (d.count / total) * 100;
    const startAt = acc;
    acc += percentage;
    return {
      ...d,
      color: COLORS[i % COLORS.length],
      percentage,
      startAt,
    };
  });

  return (
    <div className={cn("flex flex-col sm:flex-row items-center gap-6", className)}>
      <div
        className="relative w-32 h-32 shrink-0"
        onMouseLeave={() => setHover(null)}
      >
        {/* 42-box classic: r=15.9155 makes the circumference exactly 100 units,
            so percentages map 1:1 onto dash lengths, and an 8-unit stroke fits
            inside the box as a real ring instead of flooding it. */}
        <svg
          viewBox="0 0 42 42"
          className="w-full h-full -rotate-90"
          role="img"
          aria-label={`Top error reasons across ${total} failed transfers`}
        >
          {/* Faint track so the donut reads as a shape even at frame zero. */}
          <circle
            r={15.91549430918954}
            cx="21"
            cy="21"
            fill="none"
            stroke="rgb(var(--hairline))"
            strokeWidth="8"
            opacity="0.45"
          />
          {slices.map((slice, i) => {
            const dimmed = hover !== null && hover !== i;
            return (
              <circle
                key={`${slice.reason}-${i}`}
                r={15.91549430918954}
                cx="21"
                cy="21"
                fill="transparent"
                stroke={slice.color}
                strokeWidth={hover === i ? 9.5 : 8}
                // Position is fixed via dashoffset; only the arc LENGTH animates,
                // so slices grow from their own start point instead of flying
                // around the ring like the old offset-based sweep did.
                strokeDashoffset={-slice.startAt}
                strokeDasharray={armed ? `${slice.percentage} ${100 - slice.percentage}` : "0 100"}
                onMouseEnter={() => setHover(i)}
                className="cursor-default"
                style={{
                  transition: [
                    `stroke-dasharray 650ms cubic-bezier(0.22, 1.35, 0.36, 1) ${i * 110}ms`,
                    "stroke-width 150ms ease",
                    "opacity 180ms ease",
                  ].join(", "),
                  opacity: dimmed ? 0.3 : 1,
                }}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-mono tnum text-ink-mute">
            <CountUp value={total} duration={700} />
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1 w-full space-y-2">
        {slices.map((slice, i) => {
          const dimmed = hover !== null && hover !== i;
          return (
            <div
              key={`${slice.reason}-${i}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              title={slice.reason}
              className={cn(
                "flex items-center gap-2.5 rounded px-1 -mx-1 text-sm transition-colors cursor-default",
                hover === i && "bg-substrate"
              )}
              style={{
                opacity: armed ? (dimmed ? 0.45 : 1) : 0,
                transform: armed ? "none" : "translateY(6px)",
                transition: [
                  `opacity 400ms ease ${i * 90}ms`,
                  `transform 400ms cubic-bezier(0.22, 1.35, 0.36, 1) ${i * 90}ms`,
                  "background-color 150ms ease",
                ].join(", "),
              }}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: slice.color }}
                aria-hidden="true"
              />
              <span className="truncate text-ink-soft">{slice.reason}</span>
              <span className="ml-auto shrink-0 font-mono tnum text-ink-mute">
                {Math.round(slice.percentage)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
