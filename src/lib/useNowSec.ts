"use client";

import * as React from "react";

let nowSec = Math.floor(Date.now() / 1000);
const listeners = new Set<() => void>();
let timerId: ReturnType<typeof setInterval> | null = null;

function tick() {
  nowSec = Math.floor(Date.now() / 1000);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timerId === null && typeof window !== "undefined") {
    timerId = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  };
}

function getSnapshot() {
  return nowSec;
}

function getServerSnapshot() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Single global 1-second ticker hook using React 18's useSyncExternalStore.
 * Synchronizes all countdowns and active token meters into a single batched render cycle,
 * eliminating separate per-component intervals.
 */
export function useNowSec(): number {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
