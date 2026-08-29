import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";
import { getBalance, normalizeMsisdn } from "@/lib/mytel";
import { getValidToken } from "@/lib/tokens";

// Refresh balance for one SIM: POST /api/sims/refresh  { phone }
export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone) return NextResponse.json({ ok: false, error: "phone required" }, { status: 400 });

    const msisdn = normalizeMsisdn(phone);
    // Same shape check the OTP route applies. This value ends up in a Mytel
    // query string, and while getBalance refuses anything non-numeric and an
    // unknown number never gets past the lookup below, a request-supplied
    // number should be rejected at the door rather than two guards deep.
    if (!/^959\d{9}$/.test(msisdn)) {
      return NextResponse.json(
        { ok: false, error: "Invalid phone number" },
        { status: 400 }
      );
    }

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
  } catch (err: any) {
    console.error("[sims/refresh] Error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Failed to reach Mytel server",
      },
      { status: 502 }
    );
  }
}
