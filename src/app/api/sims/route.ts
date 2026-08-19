import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";
import { normalizeMsisdn } from "@/lib/mytel";

export async function GET() {
  const sims = dbApi.listSims().map((s) => ({
    ...s,
    access_token: undefined,
    refresh_token: undefined,
  }));
  return NextResponse.json({ ok: true, sims });
}

export async function DELETE(req: NextRequest) {
  const { phone } = await req.json();
  if (!phone) return NextResponse.json({ ok: false }, { status: 400 });
  dbApi.deleteSim(normalizeMsisdn(phone));
  return NextResponse.json({ ok: true });
}
