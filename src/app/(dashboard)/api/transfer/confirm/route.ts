import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";
import { apiOk, registerMyShare, normalizeMsisdn } from "@/lib/mytel";
import { getValidToken } from "@/lib/tokens";

// Step 2: confirm transfer with OTP.
// Body: { phone, receiver, amount, otp }
export async function POST(req: NextRequest) {
  try {
    const { phone, receiver, amount, otp } = await req.json();
    if (!phone || !receiver || !amount || !otp)
      return NextResponse.json({ ok: false, error: "phone, receiver, amount, otp required" }, { status: 400 });

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 500 || amt > 5000)
      return NextResponse.json({ ok: false, error: "Amount must be 500–5000 Ks" }, { status: 400 });

    const sender = normalizeMsisdn(phone);
    const receiverMsisdn = normalizeMsisdn(receiver);
    const sim = dbApi.getSim(sender);
    if (!sim) return NextResponse.json({ ok: false, error: "SIM not found" }, { status: 404 });

    const ts = await getValidToken(sim);
    if (ts.needsLogin || !ts.token) {
      return NextResponse.json({ ok: false, needsLogin: true, error: "Token expired — re-login required" });
    }

    const fee = Math.round(amt * 0.05);
    const transfer = dbApi.addTransfer({
      sender_phone: sender,
      receiver_phone: receiver,
      amount: amt,
      fee,
      status: "pending",
    });

    // Once the row exists it must always be settled. A thrown request — the 20s
    // timeout being the common one — used to leave it `pending` forever, which
    // both stalled the history entry and inflated the pending count.
    let result;
    try {
      result = await registerMyShare(ts.token, sender, receiverMsisdn, amt, otp);
    } catch (err: any) {
      const message = err?.message || "Failed to reach Mytel server";
      dbApi.updateTransfer(transfer.id, {
        status: "failed",
        error_code: null,
        message,
      });
      return NextResponse.json(
        { ok: false, error: message, transferId: transfer.id },
        { status: 502 }
      );
    }

    // Same success test as /transfer/send: the csm/* endpoints answer 0 while the
    // rest of the app answers 2xx, and treating 2xx as a failure here marked
    // completed transfers as failed.
    const ok = apiOk(result.errorCode);

    dbApi.updateTransfer(transfer.id, {
      status: ok ? "success" : "failed",
      error_code: result.errorCode,
      message: result.message ?? null,
    });

    if (ok) {
      dbApi.debitSimBalance(sender, amt + fee);
    }

    return NextResponse.json({
      ok,
      errorCode: result.errorCode,
      message: result.message,
      transferId: transfer.id,
    });
  } catch (err: any) {
    console.error("[transfer/confirm] Error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Failed to reach Mytel server",
      },
      { status: 502 }
    );
  }
}
