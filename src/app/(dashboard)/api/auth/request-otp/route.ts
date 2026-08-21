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

// A code stays valid long enough that a second request inside this window can only
// produce a wasted (and confusing) second SMS. In-memory: survives neither a restart
// nor multiple workers, but it stops refresh/double-click double-sends on one server.
const OTP_COOLDOWN_MS = 45_000;
const lastOtpAt = new Map<string, number>();
// One request-otp in flight per number at a time, so a double-click can't race two
// sends past the cooldown check before either records itself.
const inFlight = new Set<string>();

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

  if (inFlight.has(msisdn)) {
    return NextResponse.json({
      ok: false,
      error: "Already sending a code to this number — give it a moment.",
    });
  }
  inFlight.add(msisdn);
  try {
    const last = lastOtpAt.get(msisdn);
    if (last) {
      const waitSec = Math.ceil((last + OTP_COOLDOWN_MS - Date.now()) / 1000);
      if (waitSec > 0) {
        return NextResponse.json({
          ok: false,
          error: `An OTP was just sent — wait ${waitSec}s before requesting another.`,
        });
      }
      lastOtpAt.delete(msisdn);
    }

    let state;
    try {
      state = await checkAccount(msisdn);
    } catch {
      // Treat an unreachable check like an inconclusive one: retry below.
      state = { kind: "unknown" as const };
    }

    // A flaky check-account is what drags known numbers into the double-SMS fallback:
    // the retry almost always settles it, and the DB picks the path if it still won't.
    if (state.kind === "unknown") {
      try {
        state = await checkAccount(msisdn);
      } catch {
        state = { kind: "unknown" as const };
      }
    }

    console.log(`[request-otp] ${Date.now()} phone=${msisdn} check-account state=${state.kind}`);

    // A verified account can log in; everything else needs the account created first.
    if (state.kind === "verified") {
      return finish(msisdn, await sendLoginOtp(msisdn));
    }
    if (state.kind === "missing" || state.kind === "unverified") {
      const reg = await sendRegisterOtp(msisdn);
      if (reg.ok) return finish(msisdn, reg);
      // Fallback: If registration was refused because account is already verified, try login OTP
      return finish(msisdn, await sendLoginOtp(msisdn));
    }

    // Default / Inconclusive account state:
    // Try standard Login OTP first (fastest and standard path for existing SIMs)
    const login = await sendLoginOtp(msisdn);
    if (login.ok) return finish(msisdn, login);

    // If login was rejected (e.g. fresh SIM needing registration), try Register OTP
    const register = await sendRegisterOtp(msisdn);
    if (register.ok) return finish(msisdn, register);

    return finish(msisdn, login.message ? login : register);
  } finally {
    inFlight.delete(msisdn);
  }
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
  // Diagnostic: one line per outbound SMS attempt — count these in the dev terminal
  // while a SIM logs in. More than 1 ok line per click = our code double-fired;
  // exactly 1 but two SMS on the phone = Mytel sent a duplicate itself.
  console.log(
    `[request-otp] ${new Date().toISOString()} phone=${msisdn} path=${attempt.flow} ok=${attempt.ok} errorCode=${attempt.errorCode ?? "-"} msg=${attempt.message ?? "-"}`
  );
  if (attempt.ok) {
    lastOtpAt.set(msisdn, Date.now());
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
