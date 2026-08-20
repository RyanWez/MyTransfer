import type { Sim, StatsResponse, Transfer } from "./types";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL_MS = 3500; // 3.5s cache TTL for instant navigation without redundant network traffic

async function cachedFetch<T>(key: string, url: string, ttlMs: number = DEFAULT_TTL_MS): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.timestamp < ttlMs) {
    return cached.data as T;
  }

  if (inFlight.has(key)) {
    return inFlight.get(key) as Promise<T>;
  }

  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res.json();
    })
    .then((data: T) => {
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
export async function fetchStats(from?: number, to?: number): Promise<StatsResponse> {
  const query = from && to ? `?from=${from}&to=${to}` : "";
  const key = `stats:${from || "def"}:${to || "def"}`;
  return cachedFetch<StatsResponse>(key, `/api/stats${query}`, 3000);
}

/** Fetch SIMs with promise deduplication and short-term caching. */
export async function fetchSims(): Promise<Sim[]> {
  const data = await cachedFetch<{ ok: boolean; sims: Sim[] }>("sims", "/api/sims", 3000);
  return data.sims ?? [];
}

/** Fetch transfer history with promise deduplication and short-term caching. */
export async function fetchHistory(limit?: number): Promise<Transfer[]> {
  const query = limit ? `?limit=${limit}` : "";
  const data = await cachedFetch<{ ok: boolean; transfers: Transfer[] }>(
    `history:${limit || "all"}`,
    `/api/history${query}`,
    3000
  );
  return data.transfers ?? [];
}
