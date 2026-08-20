import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";

export async function GET(req: NextRequest) {
  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 500;
  return NextResponse.json({ ok: true, transfers: dbApi.listTransfers(limit) });
}
