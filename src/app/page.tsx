"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, SquareStack } from "lucide-react";
import { Eyebrow } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { MetricStrip } from "@/components/MetricStrip";
import { TrendChart } from "@/components/TrendChart";
import { RangePicker } from "@/components/RangePicker";
import {
  fmtAmount,
  fmtClock,
  fmtDayHeader,
  fmtPhoneGrouped,
  fmtShortDate,
  statusBadge,
} from "@/lib/format";
import { CHART_INK, customRange, presetRange, type RangeKey } from "@/lib/chart";
import { DAILY_LIMIT_PER_SIM } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { fetchStats } from "@/lib/api";
import type { StatsResponse } from "@/lib/types";

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function DashboardPage() {
  const [preset, setPreset] = useState<RangeKey>("today");
  const [range, setRange] = useState(() => presetRange("today"));
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchStats(range.from, range.to)
      .then((d: StatsResponse) => {
        if (alive && d?.ok) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) {
          setLoading(false);
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [range]);

  const onPreset = useCallback((key: RangeKey) => {
    setPreset(key);
    // Custom keeps whatever span is on screen; the two date inputs take it from there.
    if (key !== "custom") setRange(presetRange(key));
  }, []);

  const onCustom = useCallback((fromDay: string, toDay: string) => {
    const next = customRange(fromDay, toDay);
    if (next) setRange(next);
  }, []);

  // Mirrors the server's rule so the axis caption is right on the first paint instead
  // of flipping from "day" to "hour" when the fetch lands.
  const hourly = data
    ? data.series.granularity === "hour"
    : (range.to - range.from) / 86400 <= 1.001;
  const buckets = useMemo(() => data?.series.buckets ?? [], [data?.series.buckets]);

  const axis = useMemo(() => {
    const ticks: string[] = [];
    const long: string[] = [];
    for (const b of buckets) {
      const d = new Date(b.ts * 1000);
      if (hourly) {
        ticks.push(pad2(d.getHours()));
        long.push(`${pad2(d.getHours())}:00`);
      } else {
        ticks.push(fmtShortDate(b.ts));
        long.push(fmtDayHeader(b.ts));
      }
    }
    return { ticks, long };
  }, [buckets, hourly]);

  const countSeries = useMemo(
    () => [
      { key: "sent", label: "Sent", color: CHART_INK.sent, values: buckets.map((b) => b.sent) },
      {
        key: "failed",
        label: "Failed",
        color: CHART_INK.failed,
        values: buckets.map((b) => b.failed),
      },
    ],
    [buckets]
  );

  const volumeSeries = useMemo(
    () => [
      {
        key: "volume",
        label: "Volume",
        color: CHART_INK.volume,
        values: buckets.map((b) => b.volume),
      },
    ],
    [buckets]
  );

  const stats = data?.stats;
  const totals = data?.totals;
  // The charts and the tiles describe the same slice, so one phrase names it for both.
  const period =
    preset === "today"
      ? "today"
      : `${fmtShortDate(range.from)} – ${fmtShortDate(range.to - 1)}`;
  const grain = hourly ? "Hour by hour" : "Day by day";

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
    <div className="mx-auto max-w-5xl space-y-8">
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

      {/* One filter row, scoping every figure and curve below it. */}
      <section className="animate-rise-in space-y-4 [animation-delay:40ms]">
        <RangePicker
          preset={preset}
          onPresetChange={onPreset}
          from={range.from}
          to={range.to}
          onCustomChange={onCustom}
        />

        {/* Hold the previous render while refetching — no skeleton, no layout jump. */}
        <div className={cn("space-y-6 transition-opacity", loading && data && "opacity-50")}>
          <MetricStrip
            items={[
              { label: `Sent ${period}`, value: fmtAmount(totals?.sent ?? 0) },
              {
                label: `Volume ${period}`,
                value: fmtAmount(totals?.volume ?? 0),
                sub: "Ks, fees excluded",
                // Brass means money — a zero isn't money worth pointing at.
                tone: totals?.volume ? "brass" : "muted",
              },
              {
                label: `Failed ${period}`,
                value: fmtAmount(totals?.failed ?? 0),
                tone: totals?.failed ? "alert" : "muted",
              },
            ]}
          />

          {/* Two measures, two charts. Counts and Ks share no scale, so they never
              share an axis. */}
          <div className="rounded border border-hairline bg-card px-4 py-4">
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <Eyebrow>Transfers</Eyebrow>
              <span className="font-mono text-eyebrow uppercase text-ink-faint">
                {grain}
              </span>
            </div>
            <TrendChart
              labels={axis.ticks}
              longLabels={axis.long}
              series={countSeries}
              replayKey={`${range.from}-${range.to}-count`}
              caption={`Transfers ${period}, ${grain.toLowerCase()}`}
            />
          </div>

          <div className="rounded border border-hairline bg-card px-4 py-4">
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <Eyebrow>Volume moved</Eyebrow>
              <span className="font-mono text-eyebrow uppercase text-ink-faint">Ks</span>
            </div>
            <TrendChart
              labels={axis.ticks}
              longLabels={axis.long}
              series={volumeSeries}
              replayKey={`${range.from}-${range.to}-volume`}
              caption={`Volume moved ${period} in Ks, ${grain.toLowerCase()}`}
            />
          </div>
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
