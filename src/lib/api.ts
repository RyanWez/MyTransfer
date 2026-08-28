import type { ReceiversResponse, Sim, StatsResponse, Transfer } from "./types";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL_MS = 3500; // 3.5s cache TTL for instant navigation without redundant network traffic

/**
 * A failed read, in the terms a page needs to show something useful.
 *
 * Pages used to swallow these with `.catch(() => {})`, which rendered a broken
 * load as an empty one — an unreachable server looked exactly like a tray with no
 * SIMs in it. Carrying the reason lets them say which it was and offer a retry.
 */
export class ApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** Message fit for a panel, without HTTP jargon the operator can't act on. */
  get userMessage(): string {
    if (this.status === null) return "Couldn't reach the console server.";
    if (this.status === 401 || this.status === 403) return "Session expired — sign in again.";
    if (this.status === 429) return "The console is rate-limiting this request. Try again shortly.";
    if (this.status >= 500) return "The console server errored while reading this.";
    return `The console server refused this request (HTTP ${this.status}).`;
  }
}

async function requestJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    // Offline, DNS, connection reset — no status to report.
    throw new ApiError((err as Error)?.message || "Network request failed", null);
  }
  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status}: ${res.statusText}`, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("The server sent a response this page couldn't read", res.status);
  }
}

async function cachedFetch<T>(
  key: string,
  url: string,
  ttlMs: number = DEFAULT_TTL_MS,
  opts?: { bypassCache?: boolean; noDelay?: boolean }
): Promise<T> {
  const now = Date.now();
  if (!opts?.bypassCache) {
    const cached = cache.get(key);
    if (cached && now - cached.timestamp < ttlMs) {
      return cached.data as T;
    }
    if (inFlight.has(key)) {
      return inFlight.get(key) as Promise<T>;
    }
  } else {
    // Bypass requested — drop the stale entry, but keep reusing an in-flight
    // request for the same key. A live push can wake several pages at once, and
    // duplicating the request per page was pure extra load on one small VM.
    cache.delete(key);
    if (inFlight.has(key)) {
      return inFlight.get(key) as Promise<T>;
    }
  }

  const delay = opts?.noDelay ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, 300));

  const promise = Promise.all([requestJson<T>(url), delay])
    .then(([data]) => {
      cache.set(key, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/** Invalidate cached API responses after write operations (e.g. transfer sent, SIM added/removed). */
export function invalidateCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/** Fetch stats with promise deduplication and short-term caching. */
export async function fetchStats(
  from?: number,
  to?: number,
  opts?: { bypassCache?: boolean; noDelay?: boolean }
): Promise<StatsResponse> {
  const query = from && to ? `?from=${from}&to=${to}` : "";
  const key = `stats:${from || "def"}:${to || "def"}`;
  return cachedFetch<StatsResponse>(key, `/api/stats${query}`, 3000, opts);
}

/** Fetch SIMs with promise deduplication and short-term caching. */
export async function fetchSims(opts?: { bypassCache?: boolean; noDelay?: boolean }): Promise<Sim[]> {
  const data = await cachedFetch<{ ok: boolean; sims: Sim[] }>("sims", "/api/sims", 3000, opts);
  return data.sims ?? [];
}

/** One page of the History log — search/filter/paging all resolve server-side. */
export interface HistoryQuery {
  from?: number;
  to?: number;
  status?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export interface HistoryPage {
  transfers: Transfer[];
  /** Total transfers matching the query, paging excluded. */
  total: number;
}

/** Fetch one History page with promise deduplication and short-term caching. */
export async function fetchHistoryPage(
  query: HistoryQuery,
  opts?: { bypassCache?: boolean; noDelay?: boolean }
): Promise<HistoryPage> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.from !== undefined) params.set("from", String(query.from));
  if (query.to !== undefined) params.set("to", String(query.to));
  if (query.status) params.set("status", query.status);
  if (query.q) params.set("q", query.q);

  const key = `history:${query.from ?? "all"}:${query.to ?? "all"}:${query.status ?? "all"}:${query.q ?? ""}:${query.page}:${query.pageSize}`;
  const data = await cachedFetch<HistoryPage & { ok: boolean }>(
    key,
    `/api/history?${params.toString()}`,
    1500,
    opts
  );
  return { transfers: data.transfers ?? [], total: data.total ?? 0 };
}

/**
 * Successful transfers in a range, grouped by receiver on the server.
 *
 * One request, whatever the size of the log. This replaced `fetchAllTransfers`,
 * which paged the entire history into the browser — a round trip per 100 rows,
 * repeated from scratch on every live push, and silently short of the full set
 * once the log outgrew its page ceiling.
 *
 * Both bounds are optional: the picker's "All Time" leaves them out.
 */
export async function fetchReceivers(
  from?: number,
  to?: number,
  sender?: string,
  opts?: { bypassCache?: boolean; noDelay?: boolean }
): Promise<ReceiversResponse> {
  const params = new URLSearchParams();
  if (from !== undefined) params.set("from", String(from));
  if (to !== undefined) params.set("to", String(to));
  if (sender) params.set("sender", sender);

  const query = params.toString();
  const key = `receivers:${from ?? "all"}:${to ?? "all"}:${sender ?? ""}`;
  const data = await cachedFetch<ReceiversResponse & { ok: boolean }>(
    key,
    query ? `/api/receivers?${query}` : "/api/receivers",
    3000,
    opts
  );
  return {
    groups: data.groups ?? [],
    senders: data.senders ?? [],
    transferCount: data.transferCount ?? 0,
  };
}
