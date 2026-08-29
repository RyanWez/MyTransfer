import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";
import { normalizeMsisdn } from "@/lib/mytel";

export async function GET() {
  const volumeToday = dbApi.todayVolumeBySender();
  const volumeThisMonth = dbApi.thisMonthVolumeBySender();
  const sims = dbApi.listSimsPublic().map((s) => ({
    ...s,
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

  if (targets.length === 0)
    return NextResponse.json({ ok: false, error: "phone or phones required" }, { status: 400 });

  // One transaction and one live push for the whole batch — clearing out drained
  // SIMs would otherwise wake every open tab once per row.
  const removed = dbApi.deleteSims(targets.map((p) => normalizeMsisdn(p)));
  return NextResponse.json({ ok: true, removed });
}
