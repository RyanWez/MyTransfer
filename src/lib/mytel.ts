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
// Keycloak client secret extracted from MyID.apk (eu/c.java). Kept out of the
// repo — set MYTEL_CLIENT_SECRET, see README.
const CLIENT_SECRET = process.env.MYTEL_CLIENT_SECRET;

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

function getProxyAgent(): any {
  const proxyUrl =
    process.env.MYTEL_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;
  if (!proxyUrl) return null;
  try {
    // undici is installed as a dependency for ProxyAgent support
    // eslint-disable-next-line
    const { ProxyAgent } = require("undici");
    return new ProxyAgent(proxyUrl);
  } catch (err) {
    console.error("[mytel] Invalid proxy URL configured:", proxyUrl, err);
    return null;
  }
}

let cachedProxyAgent: any = undefined;
function proxyDispatcher(): any {
  if (cachedProxyAgent === undefined) {
    cachedProxyAgent = getProxyAgent();
    if (cachedProxyAgent) {
      const masked = (process.env.MYTEL_PROXY_URL || process.env.HTTPS_PROXY || "").replace(
        /:([^:@]+)@/,
        ":****@"
      );
      console.log(`[mytel] Proxy enabled for Mytel API requests: ${masked}`);
    }
  }
  return cachedProxyAgent || undefined;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.MYTEL_TIMEOUT_MS) || 20000;

// Every outbound call goes to one of these hosts over HTTPS. fetchWithTimeout
// refuses anything else, so no caller — and no user input that reaches a URL —
// can point this client at an arbitrary host.
const ALLOWED_HOSTS = new Set(["apis.mytel.com.mm", "id.mytel.com.mm"]);

/**
 * Fetch with proxy dispatcher and built-in timeout to prevent server thread
 * blocking when Mytel API hangs.
 *
 * `url` is always a literal endpoint built from the pinned bases above, and
 * per-request values go in `query` rather than being spliced into the string by
 * the caller. The allowlist therefore runs against a URL no caller assembled,
 * and the query is appended to an already-approved origin — a request value can
 * only ever end up in the query string, never in the scheme, host or path.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { query?: Record<string, string> } = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    throw new Error(`[mytel] Refusing to fetch non-allowlisted URL: ${target.protocol}//${target.hostname}`);
  }

  const { query, ...init } = options;
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      target.searchParams.set(key, value);
    }
  }
  const requestUrl = target.toString();

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms: ${requestUrl}`));
  }, timeoutMs);

  if (init.signal) {
    init.signal.addEventListener("abort", () => controller.abort(init.signal?.reason));
  }

  const fetchOptions: any = {
    ...init,
    signal: controller.signal,
  };

  const dispatcher = proxyDispatcher();
  if (dispatcher) {
    fetchOptions.dispatcher = dispatcher;
  }

  try {
    const res = await fetch(requestUrl, fetchOptions);
    return res;
  } catch (error: any) {
    if (error.name === "AbortError" || controller.signal.aborted) {
      throw new Error(`Mytel API request timed out (${timeoutMs / 1000}s). Network/Proxy may be slow.`);
    }
    if (
      error.code === "UND_ERR_CONNECT_TIMEOUT" ||
      error.cause?.code === "ECONNREFUSED" ||
      error.cause?.code === "ETIMEDOUT"
    ) {
      throw new Error(`Failed to reach Mytel API / Proxy (${error.message || error.cause?.code}).`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

/**
 * Phone numbers that reach a Mytel URL are digits, full stop. Anything else in
 * the value is refused rather than encoded and sent, so a phone field can never
 * steer the request path or host.
 */
function requireDigits(label: string, value: string): string {
  if (!/^\d{5,20}$/.test(value)) {
    throw new Error(`[mytel] ${label} must be 5-20 digits, got: ${value.slice(0, 20)}`);
  }
  return value;
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
  const res = await fetchWithTimeout(`${AUTH_BASE}v2/login/action/check-account`, {
    method: "GET",
    headers: headers(),
    query: { phoneNumber: requireDigits("phone", phone) },
  });
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

  // apiOk (not a bare 2xx range) — the endpoint also answers 0 on success, and
  // missing it here sends fresh numbers down the wrong OTP path below.
  const ok = data != null && apiOk(data.errorCode);
  if (!ok || !data?.result) {
    return { kind: "unknown", errorCode: data?.errorCode, message: data?.message };
  }
  const isVerified =
    data.result.verify === true ||
    String(data.result.verify).toLowerCase() === "true" ||
    (data.result as any).verify === 1 ||
    Boolean(data.result.myid);

  if (!isVerified) return { kind: "unverified" };
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
  const res = await fetchWithTimeout(`${AUTH_BASE}v2/register/request`, {
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
  const res = await fetchWithTimeout(`${AUTH_BASE}v2/register/confirm`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  return json<ApiResult<LoginResult>>(res);
}

/** Step 1 of OTP login: ask Mytel to SMS a 6-digit OTP to the SIM. */
export async function requestLoginOtp(phone: string): Promise<ApiResult> {
  const res = await fetchWithTimeout(`${AUTH_BASE}login/method/otp/get-otp`, {
    method: "GET",
    headers: headers(),
    query: { phoneNumber: requireDigits("phone", phone) },
  });
  return json<ApiResult>(res);
}

/** Step 2 of OTP login: validate OTP → returns tokens. */
export async function loginWithOtp(
  phone: string,
  otp: string
): Promise<ApiResult<LoginResult>> {
  const body = { phoneNumber: phone, password: otp, ...DEVICE };
  const res = await fetchWithTimeout(`${AUTH_BASE}login/method/otp/validate-otp`, {
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
  const res = await fetchWithTimeout(`${AUTH_BASE}login/method/password`, {
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
  if (!CLIENT_SECRET) {
    console.error("[mytel] MYTEL_CLIENT_SECRET is not set; cannot refresh tokens");
    return null;
  }
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
  });
  const res = await fetchWithTimeout(KEYCLOAK_TOKEN, {
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
  const res = await fetchWithTimeout(
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
  const res = await fetchWithTimeout(`${API_BASE}/account-detail/api/v1.2/individual/account-main`, {
    headers: headers(token),
    query: { isdn: requireDigits("msisdn", msisdn), language: "EN" },
  });
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
  const res = await fetchWithTimeout(
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
  const res = await fetchWithTimeout(
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
