import { NextRequest, NextResponse } from "next/server";
import { requestLoginOtp, normalizeMsisdn } from "@/lib/mytel";
import { dbApi } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { phone } = await req.json();
  if (!phone) return NextResponse.json({ ok: false, error: "phone required" }, { status: 400 });

  const msisdn = normalizeMsisdn(phone);
  const result = await requestLoginOtp(msisdn);

  // errorCode 0 (or 2xx per BaseResponse.isSucess) means OTP was sent
  const ok = result.errorCode === 0 || (result.errorCode >= 200 && result.errorCode < 300);
  if (ok) {
    dbApi.upsertSim(msisdn, { status: "otp_pending" });
  }
  return NextResponse.json({ ok, errorCode: result.errorCode, message: result.message });
}
