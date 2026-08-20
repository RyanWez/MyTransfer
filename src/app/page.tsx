"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, SquareStack } from "lucide-react";
import { Eyebrow } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { MetricStrip } from "@/components/MetricStrip";
import { fmtAmount, fmtClock, fmtPhoneGrouped, statusBadge } from "@/lib/format";
import { DAILY_LIMIT_PER_SIM } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Stats } from "@/lib/types";

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStats(d.stats))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const sent = stats?.rows.find((r) => r.status === "success");
  const failed = stats?.rows.find((r) => r.status === "failed");
  const sentCount = sent?.cnt ?? 0;
  const capacity = (stats?.loggedIn ?? 0) * DAILY_LIMIT_PER_SIM;
  const used = capacity ? Math.min(1, sentCount / capacity) : 0;

  if (loaded && stats && stats.simCount === 0) {
    return (
      <EmptyState
        icon={<SquareStack className="h-7 w-7" strokeWidth={1.25} />}
        title="The tray is empty"
        body="Log in a Mytel SIM to read its balance and start sending transfers."
        action={
          <Button asChild>
            <Link href="/sims">
              Log in a SIM
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* The one number the operator opens this page for. */}
      <section className="animate-rise-in">
        <Eyebrow>Total available</Eyebrow>
        <div className="mt-2 font-mono text-hero tnum text-brass-deep">
          {stats ? fmtAmount(stats.totalBalance) : "—"}
          {/* tracking-normal: the hero's negative tracking is a px value, so a small
              child would inherit it as a much larger proportion. */}
          <span className="ml-2 align-baseline text-lg font-normal tracking-normal text-ink-mute">
            Ks
          </span>
        </div>
        <p className="mt-1.5 text-sm text-ink-mute">
          {stats ? (
            <>
              across {stats.loggedIn} active {stats.loggedIn === 1 ? "SIM" : "SIMs"} of{" "}
              {stats.simCount} in the tray
            </>
          ) : (
            "Reading the tray…"
          )}
        </p>
      </section>

      <section className="animate-rise-in [animation-delay:40ms]">
        <MetricStrip
          items={[
            { label: "Sent today", value: String(sentCount) },
            {
              label: "Volume today",
              value: sent ? fmtAmount(sent.total) : "0",
              sub: "Ks, fees excluded",
              // Brass means money — a zero isn't money worth pointing at.
              tone: sent?.total ? "brass" : "muted",
            },
            {
              label: "Failed today",
              value: String(failed?.cnt ?? 0),
              tone: failed?.cnt ? "alert" : "muted",
            },
            {
              label: "Capacity left",
              value: String(Math.max(0, capacity - sentCount)),
              sub: `of ${capacity} transfers`,
            },
          ]}
        />

        {/* The 5-per-SIM-per-day rule, drawn instead of described. */}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                used >= 0.8 ? "bg-alert" : "bg-ink"
              )}
              style={{ width: `${used * 100}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-eyebrow uppercase tnum text-ink-mute">
            {sentCount} of {capacity} daily transfers used
          </span>
        </div>
      </section>

      <section className="animate-rise-in [animation-delay:80ms]">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <Eyebrow>Recent</Eyebrow>
          <Link
            href="/history"
            className="font-mono text-eyebrow font-semibold uppercase text-ink-mute underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
          >
            Full history
          </Link>
        </div>

        <div className="overflow-hidden rounded border border-hairline bg-card">
          {stats?.recent.length ? (
            <ul className="divide-y divide-hairline">
              {stats.recent.map((t) => {
                const badge = statusBadge(t.status);
                return (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-substrate"
                  >
                    <StatusDot tone={badge.tone} size="sm" />
                    <span className="shrink-0 font-mono text-xs tnum text-ink-mute">
                      {fmtClock(t.created_at)}
                    </span>
                    {/* Same two-line reflow as the history log, so a row reads the
                        same way in both places instead of eliding the numbers. */}
                    <span className="order-3 flex min-w-0 flex-1 basis-full items-center gap-2 font-mono text-xs tnum text-ink-soft sm:order-none sm:basis-auto">
                      <span className="truncate">{fmtPhoneGrouped(t.sender_phone)}</span>
                      <ArrowRight
                        className="h-3 w-3 shrink-0 text-brass"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      <span className="truncate">{fmtPhoneGrouped(t.receiver_phone)}</span>
                    </span>
                    <span className="order-2 ml-auto shrink-0 font-mono text-sm tnum text-brass-deep sm:order-none">
                      {fmtAmount(t.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              title="No transfers yet"
              body="Pick a SIM, enter a receiver and amount, and confirm with the OTP sent to the sender."
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link href="/transfer">Start a transfer</Link>
                </Button>
              }
              className="py-12"
            />
          )}
        </div>
      </section>

      <p className="max-w-xl text-xs leading-relaxed text-ink-faint">
        MyShare limits: 500–5,000 Ks per transfer, 5% fee, {DAILY_LIMIT_PER_SIM} transfers per SIM
        per day. The OTP always goes to the sender SIM.
      </p>
    </div>
  );
}
