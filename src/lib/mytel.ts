// Mytel API client — reverse-engineered from MyID.apk v2.0.19
// See ../MyShare-API-Analysis.md for the full trace.

const AUTH_BASE = "https://apis.mytel.com.mm/myid/authen/v1.0/";
const API_BASE = "https://apis.mytel.com.mm";
const KEYCLOAK_TOKEN =
  "https://id.mytel.com.mm/auth/realms/cim/protocol/openid-connect/token";

// Values copied from the app (eu/c.java): os, version, appVersion, buildVersionApp
const DEVICE = {
  os: "ANDROID samsung SM-A125F",
  version: "12",
  imei: "dashboard-device",
  deviceId: "dashboard-device-id",
  appVersion: "2.0.19",
  osApp: "ANDROID",
  buildVersionApp: "311",
};

// The register-confirm body is built differently from the login body in the app:
// eu/c.java passes Build.BRAND (field f31885f) as `version` there, while the login
// bodies pass the Android release string (f31883c). Mirrored verbatim so our request
// looks like a real client's.
const DEVICE_BRAND = "samsung";

const CLIENT_ID = "superapp-client";
const CLIENT_SECRET = "a2d5a415-1c9f-421d-84d4-5f6e0e814752";

export interface LoginResult {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  thirdPartyToken?: string;
}

export interface ApiResult<T = unknown> {
  errorCode: number;
  message?: string;
  result?: T;
}

export interface Subscription {
  id: string;
  isdn: string;
  subType: string;
  verify: boolean;
}

export interface BalanceInfo {
  msisdn: string;
  subId: string;
  mainAmount: number;
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Accept-Language": "EN",
    "User-Agent": "okhttp/4.9.3",
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

/** Normalize a Myanmar phone number to international form without "+": 959... */
export function normalizeMsisdn(phone: string): string {
  let p = phone.replace(/[\s\-()]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0095")) p = "95" + p.slice(4);
  if (p.startsWith("09")) p = "95" + p.slice(1);
  if (p.startsWith("9") && !p.startsWith("95")) p = "95" + p;
  return p;
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
}

/**
 * The app's `BaseResponse.isSucess()` is `200 <= errorCode < 300`, but the csm/*
 * endpoints answer with 0 instead. Both count as success.
 */
export function apiOk(errorCode: number | undefined): boolean {
  if (errorCode === undefined) return false;
  return errorCode === 0 || (errorCode >= 200 && errorCode < 300);
}

// ---------- Login ----------

/**
 * Where a number stands with MyID, which decides whether it can log in at all.
 *
 * Mirrors the app's routing in `input_phone/p.java`: a verified account goes to the
 * login screen, anything else goes to the V2 "create account" screen — which is why
 * a fresh SIM can never get past `login/method/otp/*`.
 */
export type AccountState =
  | { kind: "verified"; myid: string | null; subscriptionId: string | null }
  /** Account row exists but was never verified — the app still re-registers these. */
  | { kind: "unverified" }
  /** HTTP 400 "Dont have account" — never touched MyID. */
  | { kind: "missing" }
  /** Anything unexpected; callers should fall back rather than block the user. */
  | { kind: "unknown"; errorCode?: number; message?: string };

/** `GET v2/login/action/check-account` — does this number have a usable MyID account? */
export async function checkAccount(phone: string): Promise<AccountState> {
  const url = `${AUTH_BASE}v2/login/action/check-account?phoneNumber=${encodeURIComponent(phone)}`;
  const res = await fetch(url, { method: "GET", headers: headers() });
  const text = await res.text();

  let data: ApiResult<{ id?: string; myid?: string; verify?: boolean }> | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: "unknown", message: `Non-JSON response (${res.status})` };
  }

  // The app keys off the 400 body text, not the status alone.
  if (res.status === 400) {
    if ((data?.message ?? "").toLowerCase().includes("dont have account")) {
      return { kind: "missing" };
    }
    return { kind: "unknown", errorCode: data?.errorCode, message: data?.message };
  }

  const ok = data != null && data.errorCode >= 200 && data.errorCode < 300;
  if (!ok || !data?.result) {
    return { kind: "unknown", errorCode: data?.errorCode, message: data?.message };
  }
  if (data.result.verify !== true) return { kind: "unverified" };
  return {
    kind: "verified",
    myid: data.result.myid ?? null,
    subscriptionId: data.result.id ?? null,
  };
}

export interface RegisterRequestResult {
  /** Opaque handle that must be echoed back with the OTP on confirm. */
  reqId: string;
  msisdn?: string;
  haveMytelpayAccount?: boolean;
  individualSubscription?: { id?: string; myid?: string; subType?: string; verify?: boolean };
}

/**
 * Step 1 of first-time signup: `POST v2/register/request` with nothing but the number.
 * Sends the same 6-digit SMS as a login OTP; calling it again is the app's "resend".
 */
export async function requestRegisterOtp(
  msisdn: string
): Promise<ApiResult<RegisterRequestResult>> {
  const res = await fetch(`${AUTH_BASE}v2/register/request`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ msisdn }),
  });
  return json<ApiResult<RegisterRequestResult>>(res);
}

/**
 * Step 2 of first-time signup: `POST v2/register/confirm` creates the MyID account and
 * returns the same token payload as a login, so one OTP both registers and signs in.
 */
export async function confirmRegister(
  msisdn: string,
  reqId: string,
  otp: string
): Promise<ApiResult<LoginResult>> {
  const body = {
    msisdn,
    reqId,
    otp,
    imei: DEVICE.imei,
    deviceId: DEVICE.deviceId,
    os: DEVICE.os,
    osApp: DEVICE.osApp,
    version: DEVICE_BRAND,
    appVersion: DEVICE.appVersion,
    buildVersionApp: DEVICE.buildVersionApp,
  };
  const res = await fetch(`${AUTH_BASE}v2/register/confirm`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  return json<ApiResult<LoginResult>>(res);
}

/** Step 1 of OTP login: ask Mytel to SMS a 6-digit OTP to the SIM. */
export async function requestLoginOtp(phone: string): Promise<ApiResult> {
  const url = `${AUTH_BASE}login/method/otp/get-otp?phoneNumber=${encodeURIComponent(phone)}`;
  const res = await fetch(url, { method: "GET", headers: headers() });
  return json<ApiResult>(res);
}

/** Step 2 of OTP login: validate OTP → returns tokens. */
export async function loginWithOtp(
  phone: string,
  otp: string
): Promise<ApiResult<LoginResult>> {
  const body = { phoneNumber: phone, password: otp, ...DEVICE };
  const res = await fetch(`${AUTH_BASE}login/method/otp/validate-otp`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  return json<ApiResult<LoginResult>>(res);
}

/** Alternative: login with MyID password. */
export async function loginWithPassword(
  phone: string,
  password: string
): Promise<ApiResult<LoginResult>> {
  const body = { phoneNumber: phone, password, ...DEVICE };
  const res = await fetch(`${AUTH_BASE}login/method/password`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  return json<ApiResult<LoginResult>>(res);
}

/** Refresh an access token using the stored refresh_token (Keycloak). */
export async function refreshAccessToken(
  refreshToken: string
): Promise<LoginResult | null> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
  });
  const res = await fetch(KEYCLOAK_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;
  return data as LoginResult;
}

// ---------- Account info ----------

/** List the SIMs registered under this MyID account. */
export async function listSubscriptions(
  token: string
): Promise<Subscription[]> {
  const res = await fetch(
    `${API_BASE}/csm/v1.0/api/individual/subscription?limit=10&offset=0`,
    { headers: headers(token) }
  );
  const data = await json<ApiResult<{ content: Subscription[] }>>(res);
  if (data.errorCode !== 0 || !data.result?.content) return [];
  return data.result.content.filter((s) => s.subType === "Mobile");
}

/** Get main account balance for a number. */
export async function getBalance(
  token: string,
  msisdn: string
): Promise<BalanceInfo | null> {
  const url = `${API_BASE}/account-detail/api/v1.2/individual/account-main?isdn=${encodeURIComponent(
    msisdn
  )}&language=EN`;
  const res = await fetch(url, { headers: headers(token) });
  const data = await json<ApiResult<unknown>>(res);
  if (data.errorCode !== 0) return null;
  // Response shape: result: [ { msisdn, subId, mainBalance: { main: { amount } } } ]
  const arr = Array.isArray(data.result) ? (data.result as any[]) : [];
  const first = arr[0];
  if (!first) return null;
  const main =
    first.mainBalance?.main?.amount ??
    first.mainBalance?.data?.amount ??
    first.main?.amount ??
    0;
  return {
    msisdn: first.msisdn ?? msisdn,
    subId: first.subId ?? "",
    mainAmount: Number(main),
  };
}

// ---------- MyShare transfer ----------

/** Trigger the transfer OTP (SMS goes to the SENDER SIM). Needs subscriptionId. */
export async function requestTransferOtp(
  token: string,
  subscriptionId: string
): Promise<ApiResult> {
  const res = await fetch(
    `${API_BASE}/csm/v1.0/api/individual/subscription/${encodeURIComponent(
      subscriptionId
    )}/verify`,
    { headers: headers(token) }
  );
  return json<ApiResult>(res);
}

/** Execute the MyShare transfer with the OTP. */
export async function registerMyShare(
  token: string,
  senderMsisdn: string,
  receiverMsisdn: string,
  amount: number,
  otp: string
): Promise<ApiResult> {
  const body = {
    msisdn: senderMsisdn,
    balanceTranfer: String(amount),
    receiverMsisdn,
    otpCode: otp,
  };
  const res = await fetch(
    `${API_BASE}/csm/v1.0/api/vas-package/MyShare/register`,
    {
      method: "POST",
      headers: {
        ...headers(token),
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    }
  );
  return json<ApiResult>(res);
}
