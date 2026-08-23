import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";
import { authenticator } from "otplib";
import { parseTransfersFilter } from "@/lib/historyFilter";

export async function GET(req: NextRequest) {
  // Search, status filter and range all resolve in SQL — the page asks for
  // exactly one slice, so payload size stays constant as the log grows.
  const { fromTs, toTs, status, q, page, pageSize } = parseTransfersFilter(req);

  const { rows, total } = dbApi.listTransfersFiltered(
    { fromTs, toTs, status, q: q || undefined },
    pageSize,
    (page - 1) * pageSize
  );

  return NextResponse.json({
    ok: true,
    transfers: rows,
    total,
    page,
    pageSize,
  });
}

export async function DELETE(req: NextRequest) {
  try {
    const { id, password, totpCode } = await req.json();
    if (typeof id !== "number") return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    
    const transfer = dbApi.getTransferById(id);
    if (!transfer) {
      return NextResponse.json({ ok: false, error: "Transfer not found" }, { status: 404 });
    }

    if (transfer.amount >= 5000) {
      const totpSecret = process.env.AUTH_TOTP_SECRET;
      if (totpSecret) {
        if (!totpCode || !authenticator.check(totpCode, totpSecret)) {
          return NextResponse.json({ ok: false, error: "Unauthorized: Incorrect Google Auth Code" }, { status: 401 });
        }
      } else {
        if (password !== process.env.AUTH_PASSWORD) {
          return NextResponse.json({ ok: false, error: "Unauthorized: Incorrect password for large amount" }, { status: 401 });
        }
      }
    }

    dbApi.deleteTransfer(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
