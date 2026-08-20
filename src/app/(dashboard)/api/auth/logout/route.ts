import { NextResponse } from "next/server";
import { SESSION_COOKIE, clearedSessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", clearedSessionCookieOptions);
  return res;
}
