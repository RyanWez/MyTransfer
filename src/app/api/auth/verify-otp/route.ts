import { NextRequest, NextResponse } from "next/server";
import {
  loginWithOtp,
  listSubscriptions,
  getBalance,
  normalizeMsisdn,
} from "@/lib/mytel";
import { dbApi } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { phone, otp } = await req.json();
  if (!phone || !otp)
    return NextResponse.json({ ok: false, error: "phone & otp required" }, { status: 400 });

  const msisdn = normalizeMsisdn(phone);
  const result = await loginWithOtp(msisdn, otp);

  const ok = result.errorCode === 0 || (result.errorCode >= 200 && result.errorCode < 300);
  if (!ok || !result.result?.access_token) {
    return NextResponse.json({
      ok: false,
      errorCode: result.errorCode,
      message: result.message ?? "Login failed",
    });
  }

  const lr = result.result;
  const nowSec = Math.floor(Date.now() / 1000);

  // Find this number's subscription id + balance
  let subscriptionId: string | null = null;
  let balance: number | null = null;
  try {
    const subs = await listSubscriptions(lr.access_token);
    const mine = subs.find((s) => normalizeMsisdn(s.isdn) === msisdn) ?? subs[0];
    if (mine) {
      subscriptionId = mine.id;
      const bal = await getBalance(lr.access_token, normalizeMsisdn(mine.isdn));
      if (bal) balance = bal.mainAmount;
    }
  } catch {
    // non-fatal: balance can be refreshed later
  }

  dbApi.upsertSim(msisdn, {
    access_token: lr.access_token,
    refresh_token: lr.refresh_token,
    token_expires_at: nowSec + (lr.expires_in ?? 300),
    refresh_expires_at: nowSec + (lr.refresh_expires_in ?? 0),
    subscription_id: subscriptionId,
    balance,
    balance_checked_at: balance !== null ? nowSec : null,
    status: "active",
  });

  return NextResponse.json({ ok: true, subscriptionId, balance });
}
