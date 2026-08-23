import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  authRequired,
  createSessionValue,
  sessionCookieOptions,
  verifyPassword,
  missingPasswordInProduction,
} from "@/lib/auth";

import { authenticator } from "otplib";

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

  let password = "";
  let totpCode = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
    totpCode = typeof body?.totpCode === "string" ? body.totpCode : "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  if (!password || !(await verifyPassword(password))) {
    return NextResponse.json({ ok: false, error: "wrong password" }, { status: 401 });
  }

  const totpSecret = process.env.AUTH_TOTP_SECRET;
  if (totpSecret) {
    if (!totpCode || !authenticator.check(totpCode, totpSecret)) {
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

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, value, sessionCookieOptions);
  return res;
}
