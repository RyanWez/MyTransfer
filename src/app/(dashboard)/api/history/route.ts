import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";

export async function GET(req: NextRequest) {
  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 500;
  return NextResponse.json({ ok: true, transfers: dbApi.listTransfers(limit) });
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (typeof id !== "number") return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    dbApi.deleteTransfer(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
