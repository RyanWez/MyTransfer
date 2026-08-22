"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CHART_INK } from "@/lib/chart";

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

export function ErrorPieChart({ data, className }: ErrorPieChartProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setArmed(false);
    const timer = setTimeout(() => setArmed(true), 150);
    return () => clearTimeout(timer);
  }, [data]);

  const total = data.reduce((acc, d) => acc + d.count, 0);
  if (total === 0) return null;

  let currentOffset = 0;
  const slices = data.map((d, i) => {
    const percentage = (d.count / total) * 100;
    const strokeDasharray = `${percentage} ${100 - percentage}`;
    const strokeDashoffset = -currentOffset;
    currentOffset += percentage;
    return {
      ...d,
      color: COLORS[i % COLORS.length],
      strokeDasharray,
      strokeDashoffset,
      percentage,
    };
  });

  return (
    <div className={cn("flex flex-col sm:flex-row items-center gap-6", className)}>
      <div className="relative w-32 h-32 shrink-0">
        <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90 rounded-full">
          {slices.map((slice, i) => (
            <circle
              key={i}
              r={15.91549430918954}
              cx="16"
              cy="16"
              fill="transparent"
              stroke={slice.color}
              strokeWidth="32"
              strokeDasharray={slice.strokeDasharray}
              strokeDashoffset={armed ? slice.strokeDashoffset : 100}
              style={{
                transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)",
                transitionDelay: `${i * 100}ms`,
              }}
            />
          ))}
          {/* Inner cutout for donut effect */}
          <circle r={10} cx="16" cy="16" fill="rgb(var(--card))" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-mono text-ink-mute">{total}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0 w-full space-y-2">
        {slices.map((slice, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ background: slice.color }}
              aria-hidden="true"
            />
            <span className="truncate text-ink-soft" title={slice.reason}>
              {slice.reason}
            </span>
            <span className="ml-auto font-mono text-ink-mute shrink-0">
              {Math.round(slice.percentage)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
