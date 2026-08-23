import type { Sim, StatsResponse, Transfer } from "./types";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL_MS = 3500; // 3.5s cache TTL for instant navigation without redundant network traffic

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
    // Bypass requested — clear stale entry and don't reuse inFlight
    cache.delete(key);
    inFlight.delete(key);
  }

  const delay = opts?.noDelay ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, 300));

  const promise = Promise.all([
    fetch(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res.json();
    }),
    delay,
  ])
    .then(([data]) => {
      cache.set(key, { data: data as T, timestamp: Date.now() });
      return data as T;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  if (!opts?.bypassCache) {
    inFlight.set(key, promise);
  }
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
 * Every transfer in a range, paged through the API behind the scenes — for
 * views that genuinely need the full set (Receivers aggregation). Bounded by
 * a generous page count so a runaway total can't loop forever.
 */
export async function fetchAllTransfers(
  from?: number,
  to?: number,
  opts?: { bypassCache?: boolean; noDelay?: boolean }
): Promise<Transfer[]> {
  const pageSize = 1000;
  const maxPages = 200; // 200k rows ceiling
  const out: Transfer[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const { transfers, total } = await fetchHistoryPage(
      { from, to, page, pageSize },
      opts
    );
    out.push(...transfers);
    if (transfers.length === 0 || out.length >= total) break;
  }
  return out;
}
