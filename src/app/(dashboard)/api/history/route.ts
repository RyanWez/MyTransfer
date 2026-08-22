import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";

export async function GET(req: NextRequest) {
  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 5000) : 5000;
  
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const fromTs = fromParam ? Number(fromParam) : undefined;
  const toTs = toParam ? Number(toParam) : undefined;

  const validFrom = fromTs !== undefined && Number.isFinite(fromTs) ? fromTs : undefined;
  const validTo = toTs !== undefined && Number.isFinite(toTs) ? toTs : undefined;

  return NextResponse.json({
    ok: true,
    transfers: dbApi.listTransfers(limit, validFrom, validTo),
  });
}

export async function DELETE(req: NextRequest) {
  try {
    const { id, password } = await req.json();
    if (typeof id !== "number") return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    
    const transfer = dbApi.getTransferById(id);
    if (!transfer) {
      return NextResponse.json({ ok: false, error: "Transfer not found" }, { status: 404 });
    }

    if (transfer.amount >= 5000) {
      if (password !== process.env.AUTH_PASSWORD) {
        return NextResponse.json({ ok: false, error: "Unauthorized: Incorrect password for large amount" }, { status: 401 });
      }
    }

    dbApi.deleteTransfer(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
