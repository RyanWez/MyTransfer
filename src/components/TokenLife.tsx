"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { fmtCountdown, fmtShortDate, fmtStamp } from "@/lib/format";
import { useNowSec } from "@/lib/useNowSec";

const HOUR = 3600;
const DAY = 86400;
const WEEK = 7 * DAY;
const PADS = 4;

/**
 * Mytel hands out access tokens with wildly different lifetimes — the observed
 * value is ~30 days, the fallback in lib/tokens.ts is 300s. So the pads step
 * through orders of magnitude rather than a fixed window: plenty of time, days,
 * hours, minutes, gone.
 */
function padsFor(remaining: number): number {
  if (remaining > WEEK) return 4;
  if (remaining > DAY) return 3;
  if (remaining > HOUR) return 2;
  if (remaining > 0) return 1;
  return 0;
}

export interface TokenLifeProps {
  expiresAt: number | null;
  className?: string;
}

/**
 * Four brass contact pads that deplete as the access token ages, with the time
 * left beside them. Uses a synchronized global ticker so all SIM cards update together
 * in a single React render pass without scattered per-component timers.
 */
function TokenLife({ expiresAt, className }: TokenLifeProps) {
  const now = useNowSec();
  const remaining = expiresAt ? expiresAt - now : null;

  if (remaining === null) {
    return (
      <div className={cn("font-mono text-eyebrow uppercase text-ink-faint", className)}>
        No token
      </div>
    );
  }

  const lit = padsFor(remaining);
  const expired = remaining <= 0;
  const low = !expired && remaining < HOUR;

  const label = expired
    ? "Refreshes on next use"
    : remaining < DAY
      ? `Token ${fmtCountdown(remaining)}`
      : `Token to ${fmtShortDate(expiresAt!)}`;

  return (
    <div
      className={cn("flex min-w-0 items-center gap-2.5", className)}
      title={expiresAt ? `Access token expires ${fmtStamp(expiresAt)}` : undefined}
    >
      <div className="flex shrink-0 gap-[3px]" aria-hidden="true">
        {Array.from({ length: PADS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2.5 w-2 rounded-[1px] transition-colors duration-500",
              i < lit ? (low ? "bg-alert" : "bg-brass") : "bg-hairline"
            )}
          />
        ))}
      </div>
      <span
        className={cn(
          "truncate whitespace-nowrap font-mono text-eyebrow uppercase tnum",
          expired ? "text-ink-faint" : low ? "text-alert-deep" : "text-ink-mute"
        )}
      >
        {label}
      </span>
    </div>
  );
}

export { TokenLife };
