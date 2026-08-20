import { NextRequest, NextResponse } from "next/server";
import { loginWithOtp, confirmRegister, normalizeMsisdn, apiOk } from "@/lib/mytel";
import { persistLogin } from "@/lib/session";

/**
 * Turn the SMS code into stored tokens.
 *
 * `reqId` is present when /api/auth/request-otp routed the number through
 * registration; that code has to go back to `v2/register/confirm`, which creates the
 * MyID account and returns tokens in one step. Without a `reqId` this is an ordinary
 * OTP login. The two codes are not interchangeable — each is bound to the call that
 * sent it.
 */
export async function POST(req: NextRequest) {
  const { phone, otp, reqId, subscriptionId: hint } = await req.json();
  if (!phone || !otp)
    return NextResponse.json({ ok: false, error: "phone & otp required" }, { status: 400 });

  const msisdn = normalizeMsisdn(phone);
  const registering = typeof reqId === "string" && reqId.length > 0;

  const result = registering
    ? await confirmRegister(msisdn, reqId, otp)
    : await loginWithOtp(msisdn, otp);

  if (!apiOk(result.errorCode) || !result.result?.access_token) {
    return NextResponse.json({
      ok: false,
      registered: false,
      errorCode: result.errorCode,
      message:
        result.message ?? (registering ? "Could not create the account" : "Login failed"),
    });
  }

  const { subscriptionId, balance } = await persistLogin(
    msisdn,
    result.result,
    typeof hint === "string" ? hint : null
  );

  return NextResponse.json({
    ok: true,
    // Lets the UI say "account created" rather than just "logged in".
    registered: registering,
    subscriptionId,
    balance,
  });
}
