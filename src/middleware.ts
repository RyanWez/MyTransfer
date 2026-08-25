import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  authRequired,
  isSessionValid,
} from "@/lib/auth";

/**
 * The gate itself. Every page and API route passes through here; only the
 * login page and the login endpoint are exempt.
 *
 * When the gate isn't armed (dev without AUTH_PASSWORD) this is a no-op, so
 * local development keeps working exactly as before.
 */
export async function middleware(req: NextRequest) {
  if (!authRequired()) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Exempt the login surface itself.
  if (pathname === "/login" || pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  const valid = await isSessionValid(req.cookies.get(SESSION_COOKIE)?.value);
  if (valid) return NextResponse.next();

  // API callers get a clean 401; browsers get sent to the login page.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  // Remember where the operator was heading so login can drop them back there.
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own static assets and the public PWA files
  // (the service worker must be fetchable as JS or its registration fails).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)",
  ],
};
