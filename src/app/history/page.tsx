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
  const days = useMemo(() => {
    const out: { key: string; label: string; rows: Transfer[]; sent: number; volume: number }[] = [];
    for (const t of shown) {
      const key = dayKey(t.created_at);
      let group = out[out.length - 1];
      if (!group || group.key !== key) {
        group = { key, label: fmtDayHeader(t.created_at), rows: [], sent: 0, volume: 0 };
        out.push(group);
      }
      group.rows.push(t);
      if (t.status === "success") {
        group.sent += 1;
        group.volume += t.amount;
      }
    }
    return out;
  }, [shown]);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-eyebrow font-semibold uppercase tnum text-ink-mute">
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

                      <span className="flex min-w-0 flex-1 basis-full items-center gap-2 font-mono text-xs tnum text-ink-soft sm:basis-auto">
                        <span className="truncate">{fmtPhoneGrouped(t.sender_phone)}</span>
                        <ArrowRight
                          className="h-3 w-3 shrink-0 text-brass"
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                        <span className="truncate">{fmtPhoneGrouped(t.receiver_phone)}</span>
                      </span>

                      <span className="ml-auto shrink-0 text-right">
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
