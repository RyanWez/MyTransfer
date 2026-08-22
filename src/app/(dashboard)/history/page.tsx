"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, ScrollText, Search, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
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
  fmtPhoneGrouped,
  statusBadge,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchHistory } from "@/lib/api";
import type { Transfer } from "@/lib/types";

type Filter = "all" | "success" | "pending" | "failed";

function getInitialTodayRange(): DateRange {
  const today = new Date();
  const from = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).getTime() / 1000);
  const to = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime() / 1000);
  return { from, to };
}

const PAGE_SIZE = 15;

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

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const ACTION_WIDTH = 84;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    setIsDragging(true);
    startX.current = e.clientX;
    currentX.current = offset;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    const diff = e.clientX - startX.current;
    let newOffset = currentX.current + diff;
    if (newOffset > 0) newOffset = 0;
    if (newOffset < -ACTION_WIDTH * 1.5) newOffset = -ACTION_WIDTH * 1.5;
    setOffset(newOffset);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    setIsDragging(false);
    if (offset < -ACTION_WIDTH / 2) {
      setOffset(-ACTION_WIDTH);
    } else {
      setOffset(0);
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
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
  const [rows, setRows] = useState<Transfer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(getInitialTodayRange);
  const [filter, setFilter] = useState<Filter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmAmount, setConfirmAmount] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const loadData = useCallback((background = false) => {
    if (!background) setLoaded(false);
    fetchHistory(dateRange.from ?? undefined, dateRange.to ?? undefined)
      .then((transfers) => setRows(transfers))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [dateRange]);

  useEffect(() => {
    loadData();

    const eventSource = new EventSource("/api/events");
    eventSource.onmessage = (e) => {
      if (e.data === "update") {
        loadData(true);
      }
    };

    return () => eventSource.close();
  }, [loadData]);

  const filtered = useMemo(() => {
    const trimmed = searchQuery.trim();
    const q = trimmed.toLowerCase().replace(/[\s-+]/g, "");
    const searchLower = trimmed.toLowerCase();

    return rows.filter((r) => {
      const statusMatch = filter === "all" || r.status === filter;
      if (!statusMatch) return false;
      if (!trimmed) return true;

      const senderClean = r.sender_phone.toLowerCase().replace(/[\s-+]/g, "");
      if (senderClean.includes(q)) return true;

      const receiverClean = r.receiver_phone.toLowerCase().replace(/[\s-+]/g, "");
      if (receiverClean.includes(q)) return true;

      if (r.message && r.message.toLowerCase().includes(searchLower)) return true;
      if (String(r.amount).includes(trimmed)) return true;
      if (r.error_code !== null && String(r.error_code).includes(trimmed)) return true;

      return false;
    });
  }, [rows, filter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const days = useMemo(() => {
    const buckets = new Map<string, Transfer[]>();
    for (const t of paginatedRows) {
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
  }, [paginatedRows]);

  function handleFilterChange(val: Filter) {
    setFilter(val);
    setPage(1);
  }

  function handleSearchChange(val: string) {
    setSearchQuery(val);
    setPage(1);
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setIsDeleting(true);
    
    const transferToDelete = rows.find(r => r.id === deleteId);
    const isHighValue = transferToDelete ? transferToDelete.amount >= 5000 : false;

    try {
      const res = await fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id: deleteId,
          ...(isHighValue ? { password: confirmPassword } : {})
        }),
      }).then((r) => r.json());
      if (res.ok) {
        setRows((r) => r.filter((x) => x.id !== deleteId));
        toast.success("Record deleted");
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

  if (!loaded) {
    return <HistorySkeleton />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="whitespace-nowrap font-mono text-eyebrow font-semibold uppercase tnum text-ink-mute">
          {searchQuery.trim() || filter !== "all" ? (
            <>
              {filtered.length} of {rows.length} {rows.length === 1 ? "attempt" : "attempts"}
            </>
          ) : (
            <>
              {rows.length} {rows.length === 1 ? "attempt" : "attempts"}
            </>
          )}
        </span>

        <div className="flex flex-wrap items-center gap-2.5">
          <DateRangePicker
            value={dateRange}
            onChange={(r) => {
              setDateRange(r);
              setPage(1);
            }}
          />

          <div className="relative w-40 sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search sender, receiver, error..."
              className="h-8 w-full rounded border border-hairline bg-card pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint transition-colors focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

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
        </div>
      </div>

      {loaded && rows.length === 0 && (
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

      {loaded && rows.length > 0 && filtered.length === 0 && (
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
              searchQuery.trim()
                ? `No transfers found matching "${searchQuery}". Try searching by a different phone number or status.`
                : `No ${filter === "failed" ? "failed" : filter === "pending" ? "pending" : "successful"} transfers in the log.`
            }
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilter("all");
                  setPage(1);
                }}
              >
                Clear filter & search
              </Button>
            }
          />
        </div>
      )}

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
                            single right-hand column instead of each row growing a third line. */}
                        <span className="order-3 flex min-w-0 flex-1 basis-full items-center gap-2 font-mono text-xs tnum text-ink-soft sm:order-none sm:basis-auto">
                          <span className="truncate">{fmtPhoneGrouped(t.sender_phone)}</span>
                          <ArrowRight
                            className="h-3 w-3 shrink-0 text-brass"
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                          <span className="truncate">{fmtPhoneGrouped(t.receiver_phone)}</span>
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
                        <div className="mt-1.5 pl-[18px] text-xs text-alert-deep">{reason}</div>
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

      {/* Pagination & Page Size Controls */}
      {filtered.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-4 border-t border-hairline pt-5 sm:flex-row">
          <div className="flex flex-wrap items-center gap-3 font-mono text-eyebrow uppercase tnum text-ink-mute">
            <span>
              Showing {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} transfers
            </span>
            <span className="hidden text-hairline-strong sm:inline">·</span>
            <div className="flex items-center gap-1.5">
              <span className="text-ink-faint">Rows:</span>
              {[10, 20, 50].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => handlePageSizeChange(size)}
                  className={cn(
                    "rounded px-2 py-0.5 font-mono text-xs transition-colors",
                    pageSize === size
                      ? "bg-ink font-semibold text-substrate shadow-sm"
                      : "border border-hairline bg-card text-ink-mute hover:border-hairline-strong hover:bg-substrate hover:text-ink"
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="icon-sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                      onClick={() => setPage(p)}
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

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
            const transferToDelete = rows.find(r => r.id === deleteId);
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
                          To confirm, type AUTH_PASSWORD
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
