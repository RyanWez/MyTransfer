import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";
import { getBalance, normalizeMsisdn } from "@/lib/mytel";
import { getValidToken } from "@/lib/tokens";

// Refresh balance for one SIM: POST /api/sims/refresh  { phone }
export async function POST(req: NextRequest) {
  const { phone } = await req.json();
  if (!phone) return NextResponse.json({ ok: false }, { status: 400 });

  const msisdn = normalizeMsisdn(phone);
  const sim = dbApi.getSim(msisdn);
  if (!sim) return NextResponse.json({ ok: false, error: "SIM not found" }, { status: 404 });

  const ts = await getValidToken(sim);
  if (ts.needsLogin || !ts.token) {
    return NextResponse.json({ ok: false, needsLogin: true, error: "Token expired — re-login required" });
  }

  const bal = await getBalance(ts.token, msisdn);
  if (!bal) return NextResponse.json({ ok: false, error: "Could not fetch balance" });

  const nowSec = Math.floor(Date.now() / 1000);
  dbApi.upsertSim(msisdn, {
    balance: bal.mainAmount,
    balance_checked_at: nowSec,
    subscription_id: bal.subId || sim.subscription_id,
  });

  return NextResponse.json({ ok: true, balance: bal.mainAmount, subId: bal.subId });
}
