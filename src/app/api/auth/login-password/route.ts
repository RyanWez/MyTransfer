import { NextRequest, NextResponse } from "next/server";
import {
  loginWithPassword,
  listSubscriptions,
  getBalance,
  normalizeMsisdn,
} from "@/lib/mytel";
import { dbApi } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { phone, password } = await req.json();
  if (!phone || !password)
    return NextResponse.json({ ok: false, error: "phone & password required" }, { status: 400 });

  const msisdn = normalizeMsisdn(phone);
  const result = await loginWithPassword(msisdn, password);

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
  } catch {}

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
