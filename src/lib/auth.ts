/**
 * Minimal password gate for the console.
 *
 * The dashboard stores live SIM tokens, so it must never be reachable without a
 * session. Design:
 * - One shared operator password from the `AUTH_PASSWORD` env var.
 * - Login sets an httpOnly cookie holding `expiry.hmac`; the HMAC is keyed with
 *   `AUTH_SECRET`, so a cookie can't be forged or extended without the secret.
 * - `src/middleware.ts` checks the cookie on every page and API route.
 *
 * Uses the Web Crypto API (async) so the same code runs in the Edge middleware
 * runtime and in Node route handlers.
 *
 * In production the gate FAILS CLOSED: if `AUTH_PASSWORD` is missing, nothing
 * gets in (the login page explains why). In dev (`next dev`) a missing password
 * leaves the console open, matching the old local-only workflow.
 */

export const SESSION_COOKIE = "myshare_session";
const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return toHex(digest);
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toHex(sig);
}

/** Constant-time string comparison to avoid timing side channels. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** True when the password gate is armed (a password is configured). */
export function authEnabled(): boolean {
  return Boolean(process.env.AUTH_PASSWORD);
}

/**
 * In production a missing password must lock the console down rather than open
 * it up — an unauthenticated token console on the public internet is a leak.
 */
export function authRequired(): boolean {
  return authEnabled() || isProduction();
}

export async function verifyPassword(candidate: string): Promise<boolean> {
  const expected = process.env.AUTH_PASSWORD;
  if (!expected) return false;
  // Compare digests, not raw strings, so length differences don't short-circuit.
  return safeEqual(await sha256Hex(candidate), await sha256Hex(expected));
}

function secret(): string | null {
  const s = process.env.AUTH_SECRET;
  const totpSuffix = process.env.AUTH_TOTP_SECRET || "";
  if (s) return s + totpSuffix;
  // Dev convenience only — production refuses to mint cookies without a secret.
  if (!isProduction()) return "dev-insecure-secret" + totpSuffix;
  return null;
}

/** Build a signed session value: `<expiryUnixSeconds>.<hmac>` */
export async function createSessionValue(): Promise<string | null> {
  const s = secret();
  if (!s) return null;
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  return `${exp}.${await hmacHex(s, String(exp))}`;
}

export async function isSessionValid(value: string | undefined | null): Promise<boolean> {
  if (!authRequired()) return true; // gate not armed (dev without a password)
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const expPart = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const exp = Number(expPart);
  if (!Number.isFinite(exp)) return false;
  if (exp < Math.floor(Date.now() / 1000)) return false;
  const s = secret();
  if (!s) return false; // production without AUTH_SECRET — stay closed
  return safeEqual(sig, await hmacHex(s, expPart));
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction(),
  path: "/",
  maxAge: SESSION_TTL_SEC,
};

export const clearedSessionCookieOptions = {
  ...sessionCookieOptions,
  maxAge: 0,
};

/** Marker used by the login page to explain a misconfigured deployment. */
export function missingPasswordInProduction(): boolean {
  return isProduction() && !authEnabled();
}
