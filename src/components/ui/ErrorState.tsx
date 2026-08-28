"use client";

import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  /** What could not be read, in the operator's words: "the SIM tray", "history". */
  what: string;
  /** The reason, already phrased for a person — ApiError.userMessage fits. */
  detail?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

/**
 * A failed read, said out loud.
 *
 * The distinction this exists to draw: an empty tray and an unreachable server
 * are not the same thing, and rendering both as "0 SIMs" told the operator their
 * SIMs were gone. Anything that fails says so here, and offers the retry.
 */
function ErrorState({ what, detail, onRetry, retrying, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-alert/30 bg-alert-wash px-6 py-12 text-center shadow-sm animate-in fade-in zoom-in-95 duration-300",
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-card text-alert-deep shadow-inner">
        <AlertTriangle className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div className="text-base font-semibold text-ink">Couldn&apos;t load {what}</div>
      {detail && <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-mute">{detail}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry} disabled={retrying}>
          <RotateCw
            className={cn("h-3.5 w-3.5", retrying && "animate-spin")}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      )}
    </div>
  );
}

/**
 * The same message as a strip, for a page that already has content on screen and
 * only needs to say that the latest refresh didn't land.
 */
function ErrorBanner({
  what,
  detail,
  onRetry,
  retrying,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded border border-alert/30 bg-alert-wash px-3 py-2",
        className
      )}
    >
      <AlertTriangle
        className="h-3.5 w-3.5 shrink-0 text-alert-deep"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 text-xs text-ink">
        Couldn&apos;t refresh {what}
        {detail && <span className="text-ink-mute"> — {detail}</span>}{" "}
        <span className="text-ink-faint">Showing the last data read.</span>
      </span>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry} disabled={retrying}>
          <RotateCw
            className={cn("h-3 w-3", retrying && "animate-spin")}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      )}
    </div>
  );
}

export { ErrorState, ErrorBanner };
