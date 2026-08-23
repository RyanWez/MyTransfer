"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ChevronDown, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { fmtAmount, fmtClock, fmtPhone, fmtPhoneGrouped } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchHistory } from "@/lib/api";
import { toast } from "sonner";
import type { Transfer } from "@/lib/types";

function getInitialTodayRange(): DateRange {
  const today = new Date();
  const from = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).getTime() / 1000);
  const to = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime() / 1000);
  return { from, to };
}

function ReceiversSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-5 w-32 bg-substrate rounded" />
        <div className="flex gap-2.5">
          <div className="h-8 w-44 sm:w-60 bg-substrate rounded" />
          <div className="h-8 w-40 bg-substrate rounded" />
        </div>
      </div>
      <section>
        <div className="overflow-hidden rounded border border-hairline bg-card">
          <ul className="divide-y divide-hairline">
            {[1, 2, 3, 4, 5].map((i) => (
              <li key={i} className="p-4 flex items-center justify-between relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                <div className="h-5 w-32 bg-substrate rounded" />
                <div className="h-5 w-24 bg-substrate rounded" />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

const PAGE_SIZE = 50;

/** Viewport caps: the outer list scrolls after ~10 receiver rows, an expanded
 *  receiver's transfer list scrolls after ~5 rows — a phone with dozens of
 *  transfers can't stretch the page anymore. */
const LIST_VIEWPORT = "max-h-[600px]";
const TRANSFERS_VIEWPORT = "max-h-[350px]";

function getPaginationRange(current: number, total: number): (number | "...")[] {
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

type GroupedReceiver = {
  phone: string;
  totalAmount: number;
  totalFee: number;
  successCount: number;
  transfers: Transfer[];
};

/** Copies a paste-ready local number (09...) — grouped display stays for reading. */
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${text} copied`);
  } catch {
    toast.error("Couldn't copy to clipboard");
  }
}

export default function ReceiversPage() {
  const [range, setRange] = useState<DateRange>(getInitialTodayRange);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchHistory(range.from ?? undefined, range.to ?? undefined)
      .then((data) => {
        if (alive) {
          setTransfers(data || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [range.from, range.to]);

  const grouped = useMemo(() => {
    const map = new Map<string, GroupedReceiver>();
    
    // Filter first by search
    const normalizedQuery = searchQuery.replace(/\D/g, "");
    
    for (const t of transfers) {
      // Success only — failed/pending attempts never reach the receivers log.
      if (t.status !== "success") continue;
      if (normalizedQuery && !t.receiver_phone.includes(normalizedQuery)) {
        continue;
      }
      
      let g = map.get(t.receiver_phone);
      if (!g) {
        g = {
          phone: t.receiver_phone,
          totalAmount: 0,
          totalFee: 0,
          successCount: 0,
          transfers: []
        };
        map.set(t.receiver_phone, g);
      }
      
      g.transfers.push(t);
      g.totalAmount += t.amount;
      g.totalFee += t.fee || 0;
      g.successCount++;
    }

    // Sort by most recent transfer first (or could be totalAmount, but this mirrors history better)
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [transfers, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pageRows = useMemo(
    () => grouped.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [grouped, currentPage]
  );

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setPage(1);
  }

  function handleRangeChange(range: DateRange) {
    setRange(range);
    setPage(1);
  }

  if (loading) {
    return <ReceiversSkeleton />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-mute">
          Receivers Log
        </h1>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-faint" />
            <input
              type="text"
              placeholder="Search receiver..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-8 w-full sm:w-60 rounded border border-hairline bg-card pl-8 pr-3 text-xs text-ink placeholder:text-ink-faint transition-colors focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
            />
          </div>
          <DateRangePicker value={range} onChange={handleRangeChange} />
        </div>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No receivers found"
          body={
            searchQuery
              ? `No successful transfers matching "${searchQuery}" in this period.`
              : "No successful transfers recorded in this period."
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded border border-hairline bg-card shadow-sm">
            <div className={cn(LIST_VIEWPORT, "overflow-y-auto overscroll-contain")}>
              <ul className="divide-y divide-hairline flex flex-col">
                {pageRows.map((g) => {
                  const isExpanded = expandedId === g.phone;
                  return (
                    <li key={g.phone} className="flex flex-col">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : g.phone)}
                        className={cn(
                          "flex items-center justify-between p-4 text-left transition-colors hover:bg-white/[0.02]",
                          isExpanded && "bg-white/[0.02]"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-ink-faint transition-transform duration-300",
                              isExpanded ? "-rotate-180" : "rotate-0"
                            )}
                          />
                          <span
                            role="button"
                            tabIndex={0}
                            title="Click to copy"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(fmtPhone(g.phone));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                copyToClipboard(fmtPhone(g.phone));
                              }
                            }}
                            className="group/copy inline-flex cursor-copy items-center gap-1 rounded font-mono text-[15px] font-medium text-ink transition-colors hover:text-brass focus:outline-none focus-visible:ring-1 focus-visible:ring-brass"
                          >
                            {fmtPhoneGrouped(g.phone)}
                            <Copy className="h-3 w-3 text-ink-faint opacity-0 transition-opacity group-hover/copy:opacity-100" />
                          </span>
                          <span className="rounded-full bg-substrate px-2 py-0.5 font-mono text-[10px] text-ink-mute">
                            {g.successCount} {g.successCount === 1 ? "transfer" : "transfers"}
                          </span>
                        </div>
                        <div className="font-mono text-base font-medium text-brass-deep tnum">
                          {fmtAmount(g.totalAmount)} <span className="text-xs text-brass-deep/60">Ks</span>
                        </div>
                      </button>

                      {/* Smooth accordion body */}
                      <div
                        className={cn(
                          "grid transition-all duration-300 ease-in-out",
                          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="border-t border-hairline bg-substrate/50 p-4">
                            <div
                              className={cn(
                                TRANSFERS_VIEWPORT,
                                "overflow-y-auto overscroll-contain",
                                g.transfers.length > 5 && "pr-1"
                              )}
                            >
                              <ul className="space-y-3">
                                {g.transfers.map((t) => (
                                  <li
                                    key={t.id}
                                    className="flex items-center justify-between gap-4 rounded-md border border-hairline bg-card p-3 shadow-sm"
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-mono text-[13px] text-ink">
                                        From: {fmtPhoneGrouped(t.sender_phone)}
                                      </span>
                                      <span className="font-mono text-[10px] text-ink-mute">
                                        {fmtClock(t.created_at)}
                                      </span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                      <span className="font-mono text-[13px] font-medium text-ink tnum">
                                        {fmtAmount(t.amount)}{" "}
                                        <span className="text-[10px] text-ink-mute">Ks</span>
                                      </span>
                                      {t.fee > 0 && (
                                        <span className="font-mono text-[10px] text-ink-mute">
                                          Fee: {fmtAmount(t.fee)} Ks
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={grouped.length}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-4 border-t border-hairline pt-4 sm:flex-row">
      <p className="font-mono text-eyebrow uppercase tnum text-ink-mute">
        Showing {(currentPage - 1) * PAGE_SIZE + 1}–
        {Math.min(currentPage * PAGE_SIZE, totalItems)} of {totalItems} receivers
      </p>

      {totalPages > 1 && (
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

          <div className="flex items-center gap-1">
            {getPaginationRange(currentPage, totalPages).map((p, idx) =>
              p === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-1.5 font-mono text-xs text-ink-faint">
                  …
                </span>
              ) : (
                <button
                  key={`page-${p}`}
                  type="button"
                  onClick={() => onPageChange(p)}
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
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
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
