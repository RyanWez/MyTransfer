"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Download, ScrollText, Search, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner, ErrorState } from "@/components/ui/ErrorState";
import { Pagination } from "@/components/ui/Pagination";
import { StatusDot } from "@/components/ui/StatusDot";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { toast } from "sonner";
import {
  dayKey,
  fmtAmount,
  fmtClock,
  fmtDayHeader,
  fmtPhone,
  fmtPhoneGrouped,
  statusBadge,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError, fetchHistoryPage, invalidateCache, type HistoryPage } from "@/lib/api";
import { useLive } from "@/lib/liveEvents";
import type { Transfer } from "@/lib/types";

type Filter = "all" | "success" | "pending" | "failed";

const NO_ROWS: Transfer[] = [];

/** How long typed characters wait before the server-side search runs. */
const SEARCH_DEBOUNCE_MS = 300;

/** Viewport cap — the log scrolls inside this frame instead of stretching
 *  the whole page. Fills the space between the sticky top bar and the
 *  pagination footer on any screen, never collapsing under 360px. */
const LOG_VIEWPORT = "max-h-[max(360px,calc(100vh-288px))]";

/** Fixed slice per request — the adaptive frame scrolls, so a bigger page
 *  just means fewer round-trips, not a taller document. */
const PAGE_SIZE = 50;

function getInitialTodayRange(): DateRange {
  const today = new Date();
  const from = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).getTime() / 1000);
  const to = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime() / 1000);
  return { from, to };
}

function HistorySkeleton() {
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
        <div className="flex items-baseline justify-between gap-4 pb-2">
          <div className="h-4 w-24 bg-substrate rounded" />
          <div className="h-4 w-32 bg-substrate rounded" />
        </div>
        <div className="overflow-hidden rounded border border-hairline bg-card">
          <ul className="divide-y divide-hairline">
            {[1, 2, 3, 4, 5].map((i) => (
              <li key={i} className="p-4 flex items-center gap-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                <div className="h-4 w-4 bg-substrate rounded-full shrink-0" />
                <div className="h-4 w-12 bg-substrate rounded shrink-0" />
                <div className="h-4 w-48 bg-substrate rounded flex-1" />
                <div className="h-5 w-20 bg-substrate rounded shrink-0 ml-auto" />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Phone number that copies itself on click — same affordance as the receivers page. */
function CopyablePhone({ phone }: { phone: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(fmtPhone(phone))) {
          toast.success(`Copied ${fmtPhoneGrouped(phone)}`);
        } else {
          toast.error("Couldn't copy to clipboard");
        }
      }}
      title={`Click to copy ${fmtPhoneGrouped(phone)}`}
      className="group/copy inline-flex min-w-0 cursor-copy items-center gap-1 rounded text-inherit transition-colors hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-brass"
    >
      <span className="truncate">{fmtPhoneGrouped(phone)}</span>
      <Copy
        className="h-3 w-3 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover/copy:opacity-100"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </button>
  );
}

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const ACTION_WIDTH = 84;
  // Pointer capture must wait for real drag intent: capturing on pointerdown
  // retargets the whole gesture, so clicks on inner controls (copy phone,
  // error filter) never reach their buttons.
  const armed = useRef(false);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    armed.current = true;
    startX.current = e.clientX;
    currentX.current = offset;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!armed.current) return;

    const diff = e.clientX - startX.current;
    if (!isDragging) {
      if (Math.abs(diff) < 6) return; // still a tap/click — hands off
      setIsDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    let newOffset = currentX.current + diff;
    if (newOffset > 0) newOffset = 0;
    if (newOffset < -ACTION_WIDTH * 1.5) newOffset = -ACTION_WIDTH * 1.5;
    setOffset(newOffset);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!armed.current) return;
    armed.current = false;
    if (!isDragging) return;
    if (offset < -ACTION_WIDTH / 2) {
      setOffset(-ACTION_WIDTH);
    } else {
      setOffset(0);
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }

  return (
    <div className="relative overflow-hidden w-full group border-0 p-0 m-0">
      <div className="absolute inset-y-0 right-0 w-[84px] flex">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOffset(0);
            onDelete();
          }}
          className="w-full bg-alert text-white flex flex-col items-center justify-center transition-colors hover:bg-alert-deep focus:outline-none"
          title="Delete record"
        >
          <Trash2 className="h-5 w-5 mb-1" />
          <span className="text-[10px] font-mono uppercase">Delete</span>
        </button>
      </div>
      <div
        className="w-full bg-card z-10 relative px-4 py-3 touch-pan-y transition-colors group-hover:bg-substrate select-none"
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  // ---- Server-driven view state -------------------------------------------
  const [dateRange, setDateRange] = useState<DateRange>(getInitialTodayRange);
  const [filter, setFilter] = useState<Filter>("all");
  const [searchInput, setSearchInput] = useState("");
  /** Committed after the debounce — what the server actually searches for. */
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<HistoryPage | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sequence guard. Typing through the filters or clicking pagination quickly
  // leaves several requests open at once, and without this whichever resolves
  // last wins — so an older page could land under the newer filter.
  const requestSeq = useRef(0);

  // ---- Delete dialog state -------------------------------------------------
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmAmount, setConfirmAmount] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const transfers = data?.transfers ?? NO_ROWS;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const hasFilters = filter !== "all" || query !== "";

  // Typing waits out a short debounce, then one request hits the server.
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const runFetch = useCallback(
    (opts?: { bypass?: boolean }) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      if (opts?.bypass) invalidateCache("history");
      fetchHistoryPage(
        {
          from: dateRange.from ?? undefined,
          to: dateRange.to ?? undefined,
          status: filter !== "all" ? filter : undefined,
          q: query || undefined,
          page,
          pageSize: PAGE_SIZE,
        },
        { bypassCache: opts?.bypass, noDelay: true }
      )
        .then((res) => {
          if (seq !== requestSeq.current) return;
          setData(res);
          setError(null);
        })
        .catch((err) => {
          if (seq !== requestSeq.current) return;
          setError(err instanceof ApiError ? err.userMessage : "Something went wrong reading this.");
        })
        .finally(() => {
          if (seq !== requestSeq.current) return;
          setLoading(false);
          setInitialLoaded(true);
        });
    },
    [dateRange, filter, query, page]
  );

  useEffect(() => {
    runFetch();
  }, [runFetch]);

  // The SSE subscription registers once — point it at the freshest fetcher.
  const fetchRef = useRef(runFetch);
  useEffect(() => {
    fetchRef.current = runFetch;
  });
  useLive(() => fetchRef.current({ bypass: true }));

  // Deletions can strand us past the last page; fall back onto it.
  useEffect(() => {
    if (data && page > pageCount) setPage(pageCount);
  }, [data, page, pageCount]);

  // CSV download link carries the exact filters the table shows.
  const exportHref = useMemo(() => {
    const p = new URLSearchParams();
    if (dateRange.from) p.set("from", String(dateRange.from));
    if (dateRange.to) p.set("to", String(dateRange.to));
    if (filter !== "all") p.set("status", filter);
    if (query) p.set("q", query);
    const s = p.toString();
    return s ? `/api/history/export?${s}` : "/api/history/export";
  }, [dateRange, filter, query]);

  // Group the visible page by day for the dated sections.
  const days = useMemo(() => {
    const buckets = new Map<string, Transfer[]>();
    for (const t of transfers) {
      const key = dayKey(t.created_at);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(t);
      else buckets.set(key, [t]);
    }
    return [...buckets.values()]
      .map((rows) => {
        const ordered = [...rows].sort((a, b) => b.created_at - a.created_at);
        const done = ordered.filter((t) => t.status === "success");
        return {
          key: dayKey(ordered[0].created_at),
          label: fmtDayHeader(ordered[0].created_at),
          rows: ordered,
          sent: done.length,
          volume: done.reduce((sum, t) => sum + t.amount, 0),
        };
      })
      .sort((a, b) => b.rows[0].created_at - a.rows[0].created_at);
  }, [transfers]);

  function handleFilterChange(val: Filter) {
    setFilter(val);
    setPage(1);
  }

  function handleSearchChange(val: string) {
    setSearchInput(val);
    setPage(1);
  }

  /** Skip the debounce — used by Enter and click-to-filter shortcuts. */
  function applyQueryNow(val: string) {
    setSearchInput(val);
    setQuery(val.trim());
    setPage(1);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setIsDeleting(true);

    const transferToDelete = transfers.find((r) => r.id === deleteId);
    const isHighValue = transferToDelete ? transferToDelete.amount >= 5000 : false;

    try {
      const res = await fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deleteId,
          ...(isHighValue ? { password: confirmPassword, totpCode: confirmPassword } : {}),
        }),
      }).then((r) => r.json());
      if (res.ok) {
        toast.success("Record deleted");
        // Removing the last row of a later page should land on its predecessor.
        if ((data?.transfers.length ?? 0) === 1 && page > 1) setPage((p) => p - 1);
        else runFetch({ bypass: true });
      } else {
        toast.error("Failed to delete", { description: res.error });
      }
    } catch {
      toast.error("Network error");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
      setConfirmAmount("");
      setConfirmPassword("");
    }
  }

  if (!initialLoaded) {
    return <HistorySkeleton />;
  }

  // Nothing read at all: "0 attempts" would read as a quiet day, not a failure.
  if (error && !data) {
    return (
      <div className="max-w-5xl mx-auto pt-6">
        <ErrorState
          what="the transfer history"
          detail={error}
          onRetry={() => runFetch({ bypass: true })}
          retrying={loading}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* A refresh that failed with rows already on screen keeps them and says so. */}
      {error && data && (
        <ErrorBanner
          what="the transfer history"
          detail={error}
          onRetry={() => runFetch({ bypass: true })}
          retrying={loading}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="whitespace-nowrap font-mono text-eyebrow font-semibold uppercase tnum text-ink-mute">
          {fmtAmount(total)} {total === 1 ? "attempt" : "attempts"}
          {hasFilters && <span className="text-ink-faint"> · filtered</span>}
        </span>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-40 sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyQueryNow(searchInput);
              }}
              placeholder="Search sender, receiver, amount, error..."
              className="h-8 w-full rounded border border-hairline bg-card pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint transition-colors focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
            />
            {/* While a committed query is in flight the clear button gives way
                to a spinner — the round-trip is visible right where you typed. */}
            {loading && query ? (
              <span
                className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-[1.5px] border-ink-faint border-t-transparent"
                aria-hidden="true"
              />
            ) : searchInput ? (
              <button
                type="button"
                onClick={() => applyQueryNow("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Sits after the search box so its panel opens back across the content
              rather than out over the sidebar. */}
          <DateRangePicker
            value={dateRange}
            onChange={(r) => {
              setDateRange(r);
              setPage(1);
            }}
          />

          <SegmentedControl
            aria-label="Filter transfers"
            value={filter}
            onValueChange={handleFilterChange}
            options={[
              { value: "all", label: "All" },
              { value: "success", label: "Success" },
              { value: "pending", label: "Pending" },
              { value: "failed", label: "Error" },
            ]}
          />

          {/* Server builds the CSV from every matching row, not just this page. */}
          <Button variant="outline" size="sm" asChild>
            <a
              href={exportHref}
              title="Download every matching record as CSV"
              aria-disabled={total === 0}
              className={cn("inline-flex items-center gap-1.5", total === 0 && "pointer-events-none opacity-50")}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              CSV
            </a>
          </Button>
        </div>
      </div>

      {total === 0 && !hasFilters && (
        <div className="rounded border border-hairline bg-card">
          <EmptyState
            icon={
              <div className="relative w-24 h-24 flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
                <div className="absolute inset-0 bg-gradient-to-bl from-brass-soft/20 to-transparent rounded-2xl animate-pulse" />
                <div className="absolute -inset-2 bg-substrate rounded-3xl opacity-50 dark:opacity-10 blur-xl" />
                <div className="relative w-16 h-20 bg-card border border-hairline shadow-xl rounded-md flex flex-col p-2 rotate-6 transition-transform duration-500 hover:-rotate-6">
                  <div className="absolute top-0 right-0 w-4 h-4 bg-hairline rounded-bl-md" />
                  <ScrollText className="h-6 w-6 text-ink-mute m-auto" strokeWidth={1.5} />
                  <div className="mt-auto space-y-1">
                    <div className="w-8 h-1 bg-hairline rounded-full" />
                    <div className="w-6 h-1 bg-hairline rounded-full" />
                    <div className="w-10 h-1 bg-hairline rounded-full" />
                  </div>
                </div>
              </div>
            }
            title="No transfers for this period"
            body={
              dateRange.from
                ? "No transfers found for the selected date range. Try selecting another range or All Time."
                : "Every transfer this console attempts lands here — successes and failures alike, with the reason."
            }
            action={
              dateRange.from ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateRange({ from: null, to: null });
                    setPage(1);
                  }}
                >
                  View All Time
                </Button>
              ) : (
                <Button asChild className="shadow-md transition-transform hover:scale-105 active:scale-95">
                  <Link href="/transfer">
                    Start a transfer
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  </Link>
                </Button>
              )
            }
          />
        </div>
      )}

      {total === 0 && hasFilters && (
        <div className="rounded border border-hairline bg-card">
          <EmptyState
            icon={
              <div className="relative w-24 h-24 flex items-center justify-center">
                <div className="absolute inset-0 bg-substrate rounded-full opacity-50 blur-lg" />
                <div className="relative w-16 h-16 bg-card border border-hairline rounded-full flex items-center justify-center shadow-inner">
                  <Search className="h-7 w-7 text-ink-mute animate-pulse" strokeWidth={1.5} />
                </div>
              </div>
            }
            title="No transfers match your search"
            body={
              searchInput.trim()
                ? `No transfers found matching "${searchInput}". Try searching by a different phone number or status.`
                : `No ${filter === "failed" ? "failed" : filter === "pending" ? "pending" : "successful"} transfers in the log.`
            }
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  applyQueryNow("");
                  setFilter("all");
                }}
              >
                Clear filter & search
              </Button>
            }
          />
        </div>
      )}

      {/* Refetches hold the previous page and dim it — skeletons are for the
          very first visit only, so live pushes never make the log flicker. */}
      <div
        className={cn(
          "space-y-5 transition-opacity",
          loading && "opacity-50 pointer-events-none"
        )}
      >
        {/* The framed log: every dated section scrolls in here while the
            controls above and pagination below stay put. */}
        <div className={cn(LOG_VIEWPORT, "overflow-y-auto overscroll-contain space-y-5 pr-1")}>
          {days.map((day) => (
          <section key={day.key}>
            <div className="flex items-baseline justify-between gap-4 pb-2">
              <h2 className="font-mono text-eyebrow font-semibold uppercase tnum text-ink">
                {day.label}
              </h2>
              <span className="font-mono text-eyebrow uppercase tnum text-ink-faint">
                {day.sent} sent · {fmtAmount(day.volume)} Ks
              </span>
            </div>

            <div className="overflow-hidden rounded border border-hairline bg-card">
              <ul className="divide-y divide-hairline">
                {day.rows.map((t) => {
                  const badge = statusBadge(t.status);
                  const failed = t.status === "failed";
                  const reason =
                    t.message ?? (t.error_code !== null ? `Error ${t.error_code}` : null);
                  return (
                    <li key={t.id} className="p-0 m-0 border-0 bg-card">
                      <SwipeableRow onDelete={() => setDeleteId(t.id)}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <StatusDot tone={badge.tone} size="sm" />
                          <span className="shrink-0 font-mono text-xs tnum text-ink-mute">
                            {fmtClock(t.created_at)}
                          </span>

                          {/* Narrow screens reorder to two lines — clock and money on the
                              first, the phone pair on the second — so amounts stay in a
                              single right-hand column instead of each row growing a third line.
                              Either number copies itself on hover/click. */}
                          <span className="order-3 flex min-w-0 flex-1 basis-full items-center gap-2 font-mono text-xs tnum text-ink-soft sm:order-none sm:basis-auto">
                            <CopyablePhone phone={t.sender_phone} />
                            <ArrowRight
                              className="h-3 w-3 shrink-0 text-brass"
                              strokeWidth={2}
                              aria-hidden="true"
                            />
                            <CopyablePhone phone={t.receiver_phone} />
                          </span>

                          <span className="order-2 ml-auto shrink-0 text-right sm:order-none">
                            <span className="font-mono text-sm tnum text-brass-deep">
                              {fmtAmount(t.amount)}
                            </span>
                            <span className="ml-2 font-mono text-xs tnum text-ink-faint">
                              +{fmtAmount(t.fee)} fee
                            </span>
                          </span>
                        </div>

                        {failed && reason && (
                          <button
                            type="button"
                            onClick={() =>
                              applyQueryNow(reason.startsWith("Error ") ? reason.slice(6) : reason)
                            }
                            title="Show transfers with this error"
                            className="mt-1.5 ml-[18px] block max-w-full truncate text-left text-xs text-alert-deep underline decoration-dotted underline-offset-2 transition-colors hover:text-alert"
                          >
                            {reason}
                          </button>
                        )}
                        {!failed && t.status !== "success" && (
                          <div className="mt-1.5 pl-[18px] font-mono text-eyebrow uppercase text-ink-faint">
                            {badge.label}
                          </div>
                        )}
                      </SwipeableRow>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))}

        </div>

        {/* Pagination Controls */}
        <Pagination
          currentPage={currentPage}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
          totalItems={total}
          onPageChange={setPage}
          noun={["transfer", "transfers"]}
          className="pt-5"
        />
      </div>

      {/* Delete Confirmation */}
      <Dialog 
        open={!!deleteId} 
        onOpenChange={(o) => {
          if (!o) {
            setDeleteId(null);
            setConfirmAmount("");
            setConfirmPassword("");
          }
        }}
      >
        <DialogContent>
          {(() => {
            const transferToDelete = transfers.find(r => r.id === deleteId);
            const isHighValue = transferToDelete ? transferToDelete.amount >= 5000 : false;
            const canDelete = isHighValue 
              ? confirmAmount === String(transferToDelete?.amount) && confirmPassword.length > 0
              : true;

            return (
              <>
                {isHighValue ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Delete High Value Transfer?</DialogTitle>
                      <DialogDescription>
                        This will permanently remove the transfer record of <strong className="font-mono">{transferToDelete?.amount} Ks</strong>.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-ink">
                          To confirm, type &quot;{transferToDelete?.amount}&quot;
                        </label>
                        <input 
                          type="text"
                          value={confirmAmount}
                          onChange={(e) => setConfirmAmount(e.target.value)}
                          className="w-full rounded border border-hairline bg-card px-3 py-2 text-sm focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-ink">
                          To confirm, type Google Auth Code or Operator Password
                        </label>
                        <input 
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full rounded border border-hairline bg-card px-3 py-2 text-sm focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <DialogHeader>
                    <DialogTitle>Delete record?</DialogTitle>
                    <DialogDescription>
                      This will permanently remove the transfer record from the history log. Are you sure you want to proceed?
                    </DialogDescription>
                  </DialogHeader>
                )}
                <DialogFooter className={isHighValue ? "pt-2" : ""}>
                  <Button variant="ghost" onClick={() => setDeleteId(null)} disabled={isDeleting}>Cancel</Button>
                  <Button variant="destructive" loading={isDeleting} disabled={!canDelete} onClick={confirmDelete}>Delete</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
