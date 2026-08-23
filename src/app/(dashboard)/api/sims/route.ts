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
  const { phone, phones } = await req.json();
  const targets: string[] = [];
  if (phone) targets.push(phone);
  if (Array.isArray(phones)) targets.push(...phones);

  if (targets.length === 0) return NextResponse.json({ ok: false }, { status: 400 });

  for (const p of targets) {
    dbApi.deleteSim(normalizeMsisdn(p));
  }
  return NextResponse.json({ ok: true });
}
