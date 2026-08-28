"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { fmtAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Page numbers with elisions: always the first and last page, a window around
 * the current one, and "…" for the gaps. Up to seven pages fit without any
 * elision at all, which covers most ranges the console shows.
 */
export function getPaginationRange(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export interface PaginationProps {
  currentPage: number;
  pageCount: number;
  pageSize: number;
  /** Rows matching the current filters, paging excluded. */
  totalItems: number;
  onPageChange: (page: number) => void;
  /** What's being counted, e.g. `["SIM", "SIMs"]`. */
  noun: [singular: string, plural: string];
  className?: string;
}

/**
 * The footer under every paged list — History, Receivers and the SIM tray share
 * this one so the range readout and the number row can't drift apart.
 *
 * The readout stays visible on a single page; it's the only place that says how
 * many rows the filters matched. The controls hide themselves when there's
 * nothing to navigate.
 */
function Pagination({
  currentPage,
  pageCount,
  pageSize,
  totalItems,
  onPageChange,
  noun,
  className,
}: PaginationProps) {
  if (totalItems === 0) return null;

  const first = (currentPage - 1) * pageSize + 1;
  const last = Math.min(currentPage * pageSize, totalItems);
  const label = totalItems === 1 ? noun[0] : noun[1];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-4 border-t border-hairline pt-4 sm:flex-row",
        className
      )}
    >
      <p className="whitespace-nowrap font-mono text-eyebrow uppercase tnum text-ink-mute">
        Showing {fmtAmount(first)}–{fmtAmount(last)} of {fmtAmount(totalItems)} {label}
      </p>

      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="icon-sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            aria-label="Previous page"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex flex-wrap items-center justify-center gap-1">
            {getPaginationRange(currentPage, pageCount).map((p, idx) =>
              p === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-1.5 font-mono text-xs text-ink-faint">
                  …
                </span>
              ) : (
                <button
                  key={`page-${p}`}
                  type="button"
                  onClick={() => onPageChange(p)}
                  aria-current={currentPage === p ? "page" : undefined}
                  aria-label={`Page ${p}`}
                  className={cn(
                    "h-8 min-w-[2rem] rounded px-2 font-mono text-xs font-medium transition-colors",
                    currentPage === p
                      ? "bg-ink text-substrate shadow-sm"
                      : "border border-hairline bg-card text-ink hover:border-hairline-strong hover:bg-substrate"
                  )}
                >
                  {p}
                </button>
              )
            )}
          </div>

          <Button
            variant="secondary"
            size="icon-sm"
            disabled={currentPage >= pageCount}
            onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
            aria-label="Next page"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export { Pagination };
