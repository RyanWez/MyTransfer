import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";
import { registerMyShare, normalizeMsisdn } from "@/lib/mytel";
import { getValidToken } from "@/lib/tokens";

// Step 2: confirm transfer with OTP.
// Body: { phone, receiver, amount, otp }
export async function POST(req: NextRequest) {
  const { phone, receiver, amount, otp } = await req.json();
  if (!phone || !receiver || !amount || !otp)
    return NextResponse.json({ ok: false, error: "phone, receiver, amount, otp required" }, { status: 400 });

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 500 || amt > 5000)
    return NextResponse.json({ ok: false, error: "Amount must be 500–5000 Ks" }, { status: 400 });

  const sender = normalizeMsisdn(phone);
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
    otp,
    status: "pending",
  });

  const result = await registerMyShare(ts.token, sender, receiver, amt, otp);
  const ok = result.errorCode === 0;

  dbApi.updateTransfer(transfer.id, {
    status: ok ? "success" : "failed",
    error_code: result.errorCode,
    message: result.message ?? null,
  });

  if (ok) {
    // deduct locally-cached balance estimate
    if (sim.balance !== null) {
      dbApi.upsertSim(sender, { balance: sim.balance - amt - fee });
    }
  }

  return NextResponse.json({
    ok,
    errorCode: result.errorCode,
    message: result.message,
    transferId: transfer.id,
  });
}
