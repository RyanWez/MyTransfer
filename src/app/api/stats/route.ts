import { NextRequest, NextResponse } from "next/server";
import { dbApi, type Granularity, type SeriesBucket } from "@/lib/db";

/** A day of hourly buckets, or a span of daily ones. */
function resolveRange(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const fromRaw = Number(q.get("from"));
  const toRaw = Number(q.get("to"));

  if (Number.isFinite(fromRaw) && Number.isFinite(toRaw) && fromRaw > 0 && toRaw > fromRaw) {
    const spanDays = (toRaw - fromRaw) / 86400;
    // A single day reads better hour-by-hour; anything wider would be 100+ buckets.
    const granularity: Granularity = spanDays <= 1.001 ? "hour" : "day";
    return { from: Math.floor(fromRaw), to: Math.floor(toRaw), granularity };
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    from: Math.floor(start.getTime() / 1000),
    to: Math.floor(end.getTime() / 1000),
    granularity: "hour" as Granularity,
  };
}

function totals(buckets: SeriesBucket[]) {
  return buckets.reduce(
    (acc, b) => ({
      sent: acc.sent + b.sent,
      failed: acc.failed + b.failed,
      volume: acc.volume + b.volume,
    }),
    { sent: 0, failed: 0, volume: 0 }
  );
}

export async function GET(req: NextRequest) {
  const { from, to, granularity } = resolveRange(req);
  const buckets = dbApi.rangeSeries(from, to, granularity);

  return NextResponse.json({
    ok: true,
    stats: dbApi.trayStats(),
    series: { from, to, granularity, buckets },
    totals: totals(buckets),
  });
}
