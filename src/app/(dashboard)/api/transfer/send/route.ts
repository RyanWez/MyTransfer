import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";
import { requestTransferOtp, normalizeMsisdn, apiOk } from "@/lib/mytel";
import { getValidToken } from "@/lib/tokens";

// Step 1: trigger OTP for a transfer. Body: { phone }
export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone) return NextResponse.json({ ok: false }, { status: 400 });

    const msisdn = normalizeMsisdn(phone);
    const sim = dbApi.getSim(msisdn);
    if (!sim) return NextResponse.json({ ok: false, error: "SIM not found" }, { status: 404 });
    if (!sim.subscription_id)
      return NextResponse.json({ ok: false, error: "No subscription id — re-login this SIM" });

    const ts = await getValidToken(sim);
    if (ts.needsLogin || !ts.token) {
      return NextResponse.json({ ok: false, needsLogin: true, error: "Token expired — re-login required" });
    }

    const result = await requestTransferOtp(ts.token, sim.subscription_id);
    const ok = apiOk(result.errorCode);

    return NextResponse.json({
      ok,
      errorCode: result.errorCode,
      message: result.message,
      needsLogin: false,
    });
  } catch (err: any) {
    console.error("[transfer/send] Error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Failed to reach Mytel server",
      },
      { status: 502 }
    );
  }
}
