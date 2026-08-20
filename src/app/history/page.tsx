"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDot } from "@/components/ui/StatusDot";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  dayKey,
  fmtAmount,
  fmtClock,
  fmtDayHeader,
  fmtPhoneGrouped,
  statusBadge,
} from "@/lib/format";
import type { Transfer } from "@/lib/types";

type Filter = "all" | "success" | "failed";

export default function HistoryPage() {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => setRows((d.transfers ?? []) as Transfer[]))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const shown = rows.filter((r) => filter === "all" || r.status === filter);

  // Day groups carry the running total — the number an operator reconciles against.
  // Bucketed and sorted here rather than trusting the incoming order: the query sorts
  // by `id DESC`, which only matches time order while ids and timestamps agree. A log
  // that can print the same date as two separate headings isn't worth reconciling against.
  const days = useMemo(() => {
    const buckets = new Map<string, Transfer[]>();
    for (const t of shown) {
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
  }, [shown]);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <span className="whitespace-nowrap font-mono text-eyebrow font-semibold uppercase tnum text-ink-mute">
          {shown.length} of {rows.length} {rows.length === 1 ? "attempt" : "attempts"}
        </span>
        <SegmentedControl
          aria-label="Filter transfers"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "success", label: "Sent" },
            { value: "failed", label: "Failed" },
          ]}
        />
      </div>

      {loaded && rows.length === 0 && (
        <div className="rounded border border-hairline bg-card">
          <EmptyState
            icon={<ScrollText className="h-7 w-7" strokeWidth={1.25} />}
            title="Nothing sent yet"
            body="Every transfer this console attempts lands here — successes and failures alike, with the reason."
            action={
              <Button asChild>
                <Link href="/transfer">
                  Start a transfer
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </Link>
              </Button>
            }
          />
        </div>
      )}

      {loaded && rows.length > 0 && shown.length === 0 && (
        <div className="rounded border border-hairline bg-card">
          <EmptyState
            title={filter === "failed" ? "No failures" : "Nothing sent"}
            body={`No ${filter === "failed" ? "failed" : "successful"} transfers in the log. Switch the filter to see the rest.`}
            className="py-12"
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
                  <li key={t.id} className="px-4 py-3 transition-colors hover:bg-substrate">
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
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
