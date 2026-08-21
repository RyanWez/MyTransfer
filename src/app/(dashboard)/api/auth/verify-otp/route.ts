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
  try {
    const { phone, otp, reqId, subscriptionId: hint } = await req.json();
    if (!phone || !otp)
      return NextResponse.json({ ok: false, error: "phone & otp required" }, { status: 400 });

    const msisdn = normalizeMsisdn(phone);
    const registering = typeof reqId === "string" && reqId.length > 0;

    // Diagnostic (dev only)
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[verify-otp] ${new Date().toISOString()} phone=${msisdn} flow=${registering ? "register" : "login"} otp=${String(otp).slice(0, 2)}**** reqId=${registering ? "yes" : "no"}`
      );
    }

    const result = registering
      ? await confirmRegister(msisdn, reqId, otp)
      : await loginWithOtp(msisdn, otp);

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[verify-otp] ${new Date().toISOString()} phone=${msisdn} flow=${registering ? "register" : "login"} result ok=${apiOk(result.errorCode)} errorCode=${result.errorCode ?? "-"} msg=${result.message ?? "-"} hasToken=${!!result.result?.access_token}`
      );
    }

    if (!apiOk(result.errorCode) || !result.result?.access_token) {
      const isUnauth =
        result.errorCode === 401 ||
        String(result.message ?? "")
          .toLowerCase()
          .includes("unauthorized");
      // Mytel's login OTP sometimes auto-sends a second SMS after the first
      // validate fails — second code is the valid one. Surface that clearly.
      const friendly =
        !registering && isUnauth
          ? "Mytel sent a new code to your phone. Please wait for the second SMS and enter the new 6-digit code. (First code expired)"
          : (result.message ?? (registering ? "Could not create the account" : "Login failed"));
      return NextResponse.json({
        ok: false,
        registered: false,
        errorCode: result.errorCode,
        message: friendly,
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
  } catch (err: any) {
    console.error("[verify-otp] Error:", err);
    return NextResponse.json(
      {
        ok: false,
        errorCode: -1,
        message: err?.message || "Failed to reach Mytel server",
      },
      { status: 502 }
    );
  }
}
