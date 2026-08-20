"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/format";

const fill: Record<Tone, string> = {
  signal: "bg-signal ring-2 ring-signal/20",
  alert: "bg-alert ring-2 ring-alert/20",
  brass: "bg-brass ring-2 ring-brass/20",
  muted: "border border-hairline-strong",
};

const sizes = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
} as const;

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: keyof typeof sizes;
  pulse?: boolean;
}

/** A hardware status LED. Filled and haloed when live, a hollow ring when not. */
function StatusDot({ tone = "muted", size = "md", pulse, className, ...props }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full",
        sizes[size],
        fill[tone],
        pulse && tone !== "muted" && "animate-led-pulse",
        className
      )}
      {...props}
    />
  );
}

export { StatusDot };
