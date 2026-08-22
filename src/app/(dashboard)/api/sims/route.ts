import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";
import { normalizeMsisdn } from "@/lib/mytel";

export async function GET() {
  const volumeToday = dbApi.todayVolumeBySender();
  const volumeThisMonth = dbApi.thisMonthVolumeBySender();
  const sims = dbApi.listSims().map((s) => ({
    ...s,
    access_token: undefined,
    refresh_token: undefined,
    volume_today: volumeToday[s.phone] ?? 0,
    volume_this_month: volumeThisMonth[s.phone] ?? 0,
  }));
  return NextResponse.json({ ok: true, sims });
}

export async function DELETE(req: NextRequest) {
  const { phone } = await req.json();
  if (!phone) return NextResponse.json({ ok: false }, { status: 400 });
  dbApi.deleteSim(normalizeMsisdn(phone));
  return NextResponse.json({ ok: true });
}
