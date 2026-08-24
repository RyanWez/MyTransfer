"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, ChevronLeft, ChevronRight, Copy, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { fmtAmount, fmtClock, fmtPhone, fmtPhoneGrouped, phoneSearchKeys } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchAllTransfers, invalidateCache } from "@/lib/api";
import { useLive } from "@/lib/liveEvents";
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

/** Viewport caps: the outer list fills the space between the top bar and the
 *  pagination footer (never under 360px), and an expanded receiver's transfer
 *  list scrolls after ~5 rows — neither can stretch the whole page anymore. */
const LIST_VIEWPORT = "max-h-[max(360px,calc(100vh-288px))]";
const TRANSFERS_VIEWPORT = "max-h-[350px]";

type SortKey = "volume" | "count" | "recent";

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
  lastAt: number;
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

/**
 * Tiered count badge — quiet for one-off receivers, brass once someone
 * becomes a regular, solid gold at high-frequency. Colour carries the tier,
 * the label carries the number.
 */
function TransferBadge({ count }: { count: number }) {
  const tone =
    count >= 5 ? "gold" : count >= 2 ? "brass" : "quiet";
  return (
    <span
      title={`${count} successful ${count === 1 ? "transfer" : "transfers"} in this period`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold leading-none transition-colors",
        tone === "quiet" && "border border-hairline text-ink-mute",
        tone === "brass" && "bg-brass-wash text-brass-deep ring-1 ring-inset ring-brass/30",
        tone === "gold" &&
          "bg-brass-deep text-card shadow-sm ring-1 ring-inset ring-brass/60"
      )}
    >
      {/* Tiny LED dot echoes the tier without extra text. */}
      <span
        aria-hidden="true"
        className={cn(
          "h-1 w-1 rounded-full",
          tone === "quiet" && "bg-ink-faint",
          tone === "brass" && "bg-brass/70",
          tone === "gold" && "bg-card/90"
        )}
      />
      {count} {count === 1 ? "transfer" : "transfers"}
    </span>
  );
}

export default function ReceiversPage() {
  const [range, setRange] = useState<DateRange>(getInitialTodayRange);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // ---- Advanced filters ----------------------------------------------------
  const [showFilters, setShowFilters] = useState(false);
  const [senderFilter, setSenderFilter] = useState("");
  const [minAmountInput, setMinAmountInput] = useState("");
  const [minCountInput, setMinCountInput] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("volume");

  const minAmount = Number(minAmountInput) > 0 ? Number(minAmountInput) : 0;
  const minCount = Number(minCountInput) > 0 ? Math.floor(Number(minCountInput)) : 0;
  const hasFilters =
    searchQuery.trim() !== "" || senderFilter !== "" || minAmount > 0 || minCount > 0;

  const runFetch = useCallback(
    (opts?: { bypass?: boolean }) => {
      setLoading(true);
      if (opts?.bypass) invalidateCache("history");
      fetchAllTransfers(
        range.from ?? undefined,
        range.to ?? undefined,
        { bypassCache: opts?.bypass, noDelay: true }
      )
        .then((data) => setTransfers(data || []))
        .catch(() => {})
        .finally(() => {
          setLoading(false);
          setInitialLoaded(true);
        });
    },
    [range]
  );

  useEffect(() => {
    runFetch();
  }, [runFetch]);

  // Live pushes land here too — a fresh success updates counts and volumes
  // without a manual refresh.
  const fetchRef = useRef(runFetch);
  useEffect(() => {
    fetchRef.current = runFetch;
  });
  useLive(() => fetchRef.current({ bypass: true }));

  /** Every sender seen in range — powers the sender dropdown. */
  const senders = useMemo(() => {
    const set = new Set<string>();
    for (const t of transfers) {
      if (t.status === "success") set.add(t.sender_phone);
    }
    return [...set].sort((a, b) => fmtPhoneGrouped(a).localeCompare(fmtPhoneGrouped(b)));
  }, [transfers]);

  // Filter transfers first (sender + receiver search), then aggregate — so a
  // sender filter changes each receiver's totals, not just hides rows.
  const filteredTransfers = useMemo(() => {
    const digits = searchQuery.toLowerCase().replace(/[\s-+]/g, "");
    return transfers.filter((t) => {
      // Success only — failed/pending attempts never reach the receivers log.
      if (t.status !== "success") return false;
      if (senderFilter && t.sender_phone !== senderFilter) return false;
      if (
        digits &&
        !phoneSearchKeys(t.receiver_phone).some((k) => k.includes(digits))
      ) {
        return false;
      }
      return true;
    });
  }, [transfers, searchQuery, senderFilter]);

  const allGroups = useMemo(() => {
    const map = new Map<string, GroupedReceiver>();
    for (const t of filteredTransfers) {
      let g = map.get(t.receiver_phone);
      if (!g) {
        g = {
          phone: t.receiver_phone,
          totalAmount: 0,
          totalFee: 0,
          successCount: 0,
          lastAt: 0,
          transfers: [],
        };
        map.set(t.receiver_phone, g);
      }
      g.transfers.push(t);
      g.totalAmount += t.amount;
      g.totalFee += t.fee || 0;
      g.successCount++;
      if (t.created_at > g.lastAt) g.lastAt = t.created_at;
    }
    return [...map.values()];
  }, [filteredTransfers]);

  // Group-level thresholds + ordering.
  const grouped = useMemo(() => {
    const rows = allGroups.filter(
      (g) => g.totalAmount >= minAmount && g.successCount >= minCount
    );
    switch (sortBy) {
      case "count":
        rows.sort((a, b) => b.successCount - a.successCount || b.totalAmount - a.totalAmount);
        break;
      case "recent":
        rows.sort((a, b) => b.lastAt - a.lastAt);
        break;
      default:
        rows.sort((a, b) => b.totalAmount - a.totalAmount);
    }
    return rows;
  }, [allGroups, minAmount, minCount, sortBy]);

  const totalVolume = useMemo(
    () => grouped.reduce((sum, g) => sum + g.totalAmount, 0),
    [grouped]
  );

  const totalPages = Math.max(1, Math.ceil(grouped.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pageRows = useMemo(
    () => grouped.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [grouped, currentPage]
  );

  function resetFilters() {
    setSearchQuery("");
    setSenderFilter("");
    setMinAmountInput("");
    setMinCountInput("");
    setPage(1);
  }

  function handleRangeChange(range: DateRange) {
    setRange(range);
    setPage(1);
  }

  if (!initialLoaded) {
    return <ReceiversSkeleton />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
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
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="h-8 w-full sm:w-60 rounded border border-hairline bg-card pl-8 pr-3 text-xs text-ink placeholder:text-ink-faint transition-colors focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
            />
          </div>
          <DateRangePicker value={range} onChange={handleRangeChange} />
        </div>
      </div>

      {/* Summary + advanced-filter toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-eyebrow uppercase tnum text-ink-mute">
          {fmtAmount(grouped.length)} {grouped.length === 1 ? "receiver" : "receivers"}
          {hasFilters && allGroups.length !== grouped.length && (
            <span className="text-ink-faint"> · of {allGroups.length}</span>
          )}
          <span className="hidden text-hairline-strong sm:inline"> · </span>
          <span className="text-brass-deep">{fmtAmount(totalVolume)} Ks</span>
        </span>

        <Button
          variant={hasFilters ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          Filters
          {hasFilters && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brass px-1 font-mono text-[9px] font-bold leading-none text-ink">
              {[senderFilter, minAmount > 0, minCount > 0].filter(Boolean).length}
            </span>
          )}
        </Button>
      </div>

      {showFilters && (
        <div className="animate-rise-in rounded border border-hairline bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <label className="block">
              <span className="mb-2 block font-mono text-eyebrow font-semibold uppercase text-ink-mute">
                Sender SIM
              </span>
              <select
                value={senderFilter}
                onChange={(e) => {
                  setSenderFilter(e.target.value);
                  setPage(1);
                }}
                className="h-10 sm:h-8 w-full rounded border border-hairline bg-card px-2 text-xs text-ink transition-colors focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
              >
                <option value="">All senders</option>
                {senders.map((p) => (
                  <option key={p} value={p}>
                    {fmtPhoneGrouped(p)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block font-mono text-eyebrow font-semibold uppercase text-ink-mute">
                Min received (Ks)
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={minAmountInput}
                onChange={(e) => {
                  setMinAmountInput(e.target.value.replace(/\D/g, ""));
                  setPage(1);
                }}
                placeholder="0"
                className="h-10 sm:h-8 w-full rounded border border-hairline bg-card px-2 font-mono text-xs tnum text-ink placeholder:text-ink-faint transition-colors focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
              />
            </label>

            <label className="block">
              <span className="mb-2 block font-mono text-eyebrow font-semibold uppercase text-ink-mute">
                Min transfers
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={minCountInput}
                onChange={(e) => {
                  setMinCountInput(e.target.value.replace(/\D/g, ""));
                  setPage(1);
                }}
                placeholder="0"
                className="h-10 sm:h-8 w-full rounded border border-hairline bg-card px-2 font-mono text-xs tnum text-ink placeholder:text-ink-faint transition-colors focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
              />
            </label>

            <div>
              <span className="mb-2 block font-mono text-eyebrow font-semibold uppercase text-ink-mute">
                Sort by
              </span>
              <SegmentedControl<SortKey>
                aria-label="Sort receivers"
                fullWidth
                value={sortBy}
                onValueChange={(v) => {
                  setSortBy(v);
                  setPage(1);
                }}
                options={[
                  { value: "volume", label: "Volume" },
                  { value: "count", label: "Count" },
                  { value: "recent", label: "Recent" },
                ]}
              />
            </div>
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 inline-flex items-center gap-1 font-mono text-xs text-alert-deep underline decoration-dotted underline-offset-2 hover:text-alert"
            >
              <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Clear all filters
            </button>
          )}
        </div>
      )}

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No receivers found"
          body={
            hasFilters
              ? searchQuery
                ? `No successful transfers matching "${searchQuery}" with the current filters.`
                : "Nothing matches the current filters in this period."
              : "No successful transfers recorded in this period."
          }
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Refetches hold the previous list and dim it — skeletons are for the
              very first visit only. */}
          <div
            className={cn(
              "space-y-4 transition-opacity",
              loading && "opacity-50 pointer-events-none"
            )}
          >
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
                            <TransferBadge count={g.successCount} />
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="font-mono text-base font-medium text-brass-deep tnum">
                              {fmtAmount(g.totalAmount)}{" "}
                              <span className="text-xs text-brass-deep/60">Ks</span>
                            </span>
                            {sortBy === "recent" && g.lastAt > 0 && (
                              <span className="font-mono text-[10px] text-ink-faint">
                                last {fmtClock(g.lastAt)}
                              </span>
                            )}
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
                                  {[...g.transfers]
                                    .sort((a, b) => b.created_at - a.created_at)
                                    .map((t) => (
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
