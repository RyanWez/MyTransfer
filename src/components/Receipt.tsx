"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** A money table: mono figures right-aligned, hairline rules, brass on the total. */
function Receipt({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("border-y border-hairline py-1", className)}>{children}</div>;
}

function ReceiptRow({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  /** The line that matters — the amount actually leaving the SIM. */
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span
        className={cn(
          "text-sm",
          emphasis ? "font-medium text-ink" : muted ? "text-ink-faint" : "text-ink-soft"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono tnum",
          emphasis
            ? "text-base font-semibold text-brass-deep"
            : muted
              ? "text-sm text-ink-faint"
              : "text-sm text-ink"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ReceiptDivider() {
  return <div className="my-1 border-t border-hairline" />;
}

export { Receipt, ReceiptRow, ReceiptDivider };
