import { NextRequest, NextResponse } from "next/server";
import {
  requestLoginOtp,
  requestRegisterOtp,
  checkAccount,
  normalizeMsisdn,
  apiOk,
} from "@/lib/mytel";
import { dbApi } from "@/lib/db";

/** What the client must do with the code once it arrives. */
type Flow = "login" | "register";

/**
 * Send the SIM a 6-digit code, picking the right endpoint for the number.
 *
 * A number that has never been through MyID has no account to log into, so
 * `login/method/otp/get-otp` is a dead end for it — that was the bug. The app solves
 * this by checking the number first and routing fresh numbers through
 * `v2/register/request` instead, which sends the same SMS and hands back a `reqId`
 * that `v2/register/confirm` swaps for real tokens. Either way the caller gets one
 * OTP box; only the follow-up call differs.
 */
export async function POST(req: NextRequest) {
  const { phone } = await req.json();
  if (!phone) return NextResponse.json({ ok: false, error: "phone required" }, { status: 400 });

  const msisdn = normalizeMsisdn(phone);

  let state;
  try {
    state = await checkAccount(msisdn);
  } catch {
    // Treat an unreachable check like an inconclusive one: try both paths below.
    state = { kind: "unknown" as const };
  }

  // A verified account can log in; everything else needs the account created first.
  if (state.kind === "verified") {
    return finish(msisdn, await sendLoginOtp(msisdn));
  }
  if (state.kind === "missing" || state.kind === "unverified") {
    return finish(msisdn, await sendRegisterOtp(msisdn));
  }

  // Inconclusive check — don't strand the user. Try login, then registration.
  const login = await sendLoginOtp(msisdn);
  if (login.ok) return finish(msisdn, login);
  const register = await sendRegisterOtp(msisdn);
  return finish(msisdn, register.ok ? register : login);
}

interface OtpAttempt {
  ok: boolean;
  flow: Flow;
  reqId?: string;
  subscriptionId?: string | null;
  errorCode?: number;
  message?: string;
}

async function sendLoginOtp(msisdn: string): Promise<OtpAttempt> {
  try {
    const result = await requestLoginOtp(msisdn);
    return {
      ok: apiOk(result.errorCode),
      flow: "login",
      errorCode: result.errorCode,
      message: result.message,
    };
  } catch (e) {
    return { ok: false, flow: "login", message: (e as Error).message };
  }
}

async function sendRegisterOtp(msisdn: string): Promise<OtpAttempt> {
  try {
    const result = await requestRegisterOtp(msisdn);
    const reqId = result.result?.reqId;
    // No reqId means confirm can't be called, so this is a failure even on a 2xx.
    return {
      ok: apiOk(result.errorCode) && !!reqId,
      flow: "register",
      reqId,
      subscriptionId: result.result?.individualSubscription?.id ?? null,
      errorCode: result.errorCode,
      message: result.message,
    };
  } catch (e) {
    return { ok: false, flow: "register", message: (e as Error).message };
  }
}

function finish(msisdn: string, attempt: OtpAttempt) {
  if (attempt.ok) {
    // Re-logging in a SIM that is already working must not knock it back to
    // "waiting for OTP": if the operator abandons the dialog, a perfectly valid
    // token would sit in the tray looking logged out.
    const existing = dbApi.getSim(msisdn);
    if (!existing || existing.status !== "active") {
      dbApi.upsertSim(msisdn, { status: "otp_pending" });
    }
  }
  return NextResponse.json({
    ok: attempt.ok,
    flow: attempt.flow,
    reqId: attempt.reqId ?? null,
    subscriptionId: attempt.subscriptionId ?? null,
    errorCode: attempt.errorCode,
    message: attempt.message,
  });
}
