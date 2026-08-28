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
// Not an abuse budget — a single operator console, deliberately uncapped on volume.
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

  // Early validation: Myanmar numbers are 09XXXXXXXXX (11) -> 959XXXXXXXXX (12).
  // 13 digits like 9596872446600 is an extra-digit typo and Mytel rejects it with
  // "Validation failed for object='msisdnReq'".
  if (!/^959\d{9}$/.test(msisdn)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid phone number",
        message: `“${phone}” doesn’t look like a Myanmar number. Use 09XXXXXXXXX (11 digits) or 959XXXXXXXXX (12 digits). You sent ${msisdn} (${msisdn.length} digits).`,
      },
      { status: 400 }
    );
  }

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

    const send = async (dispatch: () => Promise<OtpAttempt>) => finish(msisdn, await dispatch());

    let state;
    let checkError: string | null = null;
    try {
      state = await checkAccount(msisdn);
    } catch (e) {
      checkError = (e as Error).message;
      state = { kind: "unknown" as const };
    }

    // Retry once on flaky network — but never double-send SMS; one SMS per click only.
    if (state.kind === "unknown") {
      try {
        state = await checkAccount(msisdn);
        checkError = null;
      } catch (e) {
        checkError = (e as Error).message;
        state = { kind: "unknown" as const };
      }
    }

    if (process.env.NODE_ENV !== "production") {
      if (checkError) {
        console.log(
          `[request-otp] ${Date.now()} phone=${msisdn} check-account state=${state.kind} error=${checkError}`
        );
      } else {
        console.log(`[request-otp] ${Date.now()} phone=${msisdn} check-account state=${state.kind}`);
      }
    }

    // Single SMS per request: never auto-fallback to a second endpoint.
    // A second SMS would invalidate the first OTP on Mytel's side, causing
    // "enter first code -> Unauthorized, second code works" bug.
    if (state.kind === "verified") {
      return send(() => sendLoginOtp(msisdn));
    }
    if (state.kind === "missing" || state.kind === "unverified") {
      return send(() => sendRegisterOtp(msisdn));
    }

    // Inconclusive (unknown) — default to login (95% of SIMs are existing accounts).
    // If this was actually a fresh number, login will fail with a clear message and
    // the user can retry; the retry will re-check account and likely route correctly.
    // Never auto-try register here — that would send 2 SMS and invalidate the first.
    return send(() => sendLoginOtp(msisdn));
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
  // Translate Mytel's raw validation message into something the toast can show directly.
  if (!attempt.ok && attempt.message?.includes("msisdnReq")) {
    attempt.message = `Invalid phone number format (${msisdn}, ${msisdn.length} digits). Use 09XXXXXXXXX or 959XXXXXXXXX.`;
  }
  // Diagnostic (dev only): one line per outbound SMS attempt
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[request-otp] ${new Date().toISOString()} phone=${msisdn} path=${attempt.flow} ok=${attempt.ok} errorCode=${attempt.errorCode ?? "-"} msg=${attempt.message ?? "-"}`
    );
  }
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
