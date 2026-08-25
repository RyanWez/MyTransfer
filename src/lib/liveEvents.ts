// Shared live-update channel.
//
// One EventSource for the whole app (previously every page opened its own),
// exposing:
// - connection status ("connecting" | "online" | "offline") via useLiveStatus
// - server "update" events via useLive(onUpdate)
//
// Reconnects with exponential backoff (1s → 30s), resets on success, and
// retries immediately when the tab becomes visible again while offline.

import { useEffect, useRef, useSyncExternalStore } from "react";

export type LiveStatus = "connecting" | "online" | "offline";

/** Structured payloads the server may attach to an "update" event. */
export interface TransferResultUpdate {
  kind: "transfer:result";
  id: number;
  status: "success" | "failed";
  sender: string;
  receiver: string;
  amount: number;
  message?: string | null;
}

export type LiveUpdate = TransferResultUpdate;

let es: EventSource | null = null;
let status: LiveStatus = "connecting";
let retries = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const statusListeners = new Set<() => void>();
const updateListeners = new Set<(u?: LiveUpdate) => void>();

function setStatus(next: LiveStatus) {
  if (next === status) return;
  status = next;
  statusListeners.forEach((fn) => fn());
}

function connect() {
  if (typeof window === "undefined" || es) return;

  es = new EventSource("/api/events");

  es.onopen = () => {
    retries = 0;
    setStatus("online");
  };

  es.onmessage = (e) => {
    if (e.data === "update") {
      updateListeners.forEach((fn) => fn());
      return;
    }
    // "update {json}" — a plain update with a structured payload attached.
    if (typeof e.data === "string" && e.data.startsWith("update ")) {
      try {
        const payload = JSON.parse(e.data.slice(7)) as LiveUpdate;
        updateListeners.forEach((fn) => fn(payload));
      } catch {
        // Malformed payload — degrade to a plain update ping.
        updateListeners.forEach((fn) => fn());
      }
    }
  };

  es.onerror = () => {
    es?.close();
    es = null;
    setStatus("offline");
    const delay = Math.min(1000 * 2 ** retries++, 30000);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };
}

function ensureConnected() {
  connect();
}

// Coming back to the tab shouldn't wait out the backoff timer.
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !es && !reconnectTimer && status === "offline") {
      retries = 0;
      setStatus("connecting");
      connect();
    }
  });
}

/** Subscribe to server "update" events; returns the connection status too. */
export function useLive(onUpdate?: (u?: LiveUpdate) => void): LiveStatus {
  return useLiveInternal(onUpdate);
}

/** Connection status only — no update events, no extra fetches on top. */
export function useLiveStatus(): LiveStatus {
  return useLiveInternal();
}

// The two hooks share one implementation so both keep the singleton alive and
// re-render on status flips without duplicating the wiring.

function subscribeStatus(fn: () => void) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

function getStatusSnapshot(): LiveStatus {
  return status;
}

function getServerSnapshot(): LiveStatus {
  return "connecting";
}

function useLiveInternal(onUpdate?: (u?: LiveUpdate) => void): LiveStatus {
  const cbRef = useRef<((u?: LiveUpdate) => void) | undefined>(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    ensureConnected();
    if (!cbRef.current) return;
    const fn = (u?: LiveUpdate) => cbRef.current?.(u);
    updateListeners.add(fn);
    return () => {
      updateListeners.delete(fn);
    };
  }, []);

  return useSyncExternalStore(subscribeStatus, getStatusSnapshot, getServerSnapshot);
}
