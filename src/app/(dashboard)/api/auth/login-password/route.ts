import { NextRequest, NextResponse } from "next/server";
import { loginWithPassword, normalizeMsisdn, apiOk } from "@/lib/mytel";
import { persistLogin } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { phone, password } = await req.json();
  if (!phone || !password)
    return NextResponse.json({ ok: false, error: "phone & password required" }, { status: 400 });

  const msisdn = normalizeMsisdn(phone);
  const result = await loginWithPassword(msisdn, password);

  if (!apiOk(result.errorCode) || !result.result?.access_token) {
    return NextResponse.json({
      ok: false,
      errorCode: result.errorCode,
      message: result.message ?? "Login failed",
    });
  }

  const { subscriptionId, balance } = await persistLogin(msisdn, result.result);

  return NextResponse.json({ ok: true, subscriptionId, balance });
}
