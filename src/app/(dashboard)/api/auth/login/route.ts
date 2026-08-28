import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  authRequired,
  createSessionValue,
  sessionCookieOptions,
  verifyPassword,
  missingPasswordInProduction,
} from "@/lib/auth";
import { clientIp, limitFromEnv, rateLimit, rateLimitReset } from "@/lib/rateLimit";

import { authenticator } from "otplib";

// This route is the one door in the fence — middleware exempts it, so without a
// budget the single shared AUTH_PASSWORD can be guessed at network speed. Constant-
// time comparison stops a timing leak but does nothing about volume.
//
// Two windows, because they fail differently: the per-IP one stops a single host
// grinding away, the global one caps a distributed attempt (and a rotating-IP
// attacker, since a proxied deployment cannot fully trust the address).
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const IP_BUCKET = "login:ip";
const GLOBAL_BUCKET = "login:global";

const tooMany = (retryAfterSec: number) =>
  NextResponse.json(
    {
      ok: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(retryAfterSec / 60)} min.`,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );

/** Lets the login page skip itself when the gate isn't armed (dev without a password). */
export async function GET() {
  const totpRequired = !!process.env.AUTH_TOTP_SECRET;
  return NextResponse.json({ ok: true, required: authRequired(), totpRequired });
}

export async function POST(req: NextRequest) {
  // A production deployment without AUTH_PASSWORD must stay locked, and the
  // operator needs to know why — surface it instead of accepting anything.
  if (missingPasswordInProduction()) {
    return NextResponse.json(
      { ok: false, error: "AUTH_PASSWORD is not configured on the server" },
      { status: 503 }
    );
  }

  const ip = clientIp(req);
  const ipLimit = limitFromEnv("LOGIN_MAX_ATTEMPTS", 10);
  const globalLimit = limitFromEnv("LOGIN_MAX_ATTEMPTS_GLOBAL", 60);

  // Peek first: only a failed attempt should cost budget, so an operator who
  // types the right password is never locked out by their own earlier typos.
  const ipPeek = rateLimit(IP_BUCKET, ip, ipLimit, LOGIN_WINDOW_MS, { peek: true });
  if (!ipPeek.allowed) return tooMany(ipPeek.retryAfterSec);
  const globalPeek = rateLimit(GLOBAL_BUCKET, "all", globalLimit, LOGIN_WINDOW_MS, {
    peek: true,
  });
  if (!globalPeek.allowed) return tooMany(globalPeek.retryAfterSec);

  let password = "";
  let totpCode = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
    totpCode = typeof body?.totpCode === "string" ? body.totpCode : "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const spendAttempt = () => {
    rateLimit(IP_BUCKET, ip, ipLimit, LOGIN_WINDOW_MS);
    rateLimit(GLOBAL_BUCKET, "all", globalLimit, LOGIN_WINDOW_MS);
  };

  if (!password || !(await verifyPassword(password))) {
    spendAttempt();
    return NextResponse.json({ ok: false, error: "wrong password" }, { status: 401 });
  }

  const totpSecret = process.env.AUTH_TOTP_SECRET;
  if (totpSecret) {
    if (!totpCode || !authenticator.check(totpCode, totpSecret)) {
      spendAttempt();
      return NextResponse.json({ ok: false, error: "wrong auth code" }, { status: 401 });
    }
  }

  const value = await createSessionValue();
  if (!value) {
    return NextResponse.json(
      { ok: false, error: "AUTH_SECRET is not configured on the server" },
      { status: 503 }
    );
  }

  // A proven operator starts clean, so a shared office address doesn't accumulate
  // a lockout across a day of legitimate logins.
  rateLimitReset(IP_BUCKET, ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, value, sessionCookieOptions);
  return res;
}
