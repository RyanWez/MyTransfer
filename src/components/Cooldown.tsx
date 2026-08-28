"use client";

import * as React from "react";
import { useNowSec } from "@/lib/useNowSec";

/**
 * Resend cooldowns, split so the ticking stays where it shows.
 *
 * Subscribing a *page* to the 1-second clock re-renders everything it owns once
 * a second, forever — the whole SIM tray, every dialog, every input — to move one
 * digit. These two split that: the page asks only whether the cooldown is still
 * running, which changes twice; the digit lives in its own leaf, which is the
 * only thing that re-renders each second.
 */

/**
 * Whether `untilSec` is still in the future. Renders twice per cooldown — once
 * when it starts, once when it lapses — because it waits on a single timeout for
 * the remaining time rather than checking a clock every second.
 */
export function useCooldownActive(untilSec: number): boolean {
  const [active, setActive] = React.useState(() => untilSec * 1000 > Date.now());

  React.useEffect(() => {
    const msLeft = untilSec * 1000 - Date.now();
    if (msLeft <= 0) {
      setActive(false);
      return;
    }
    setActive(true);
    const timer = setTimeout(() => setActive(false), msLeft);
    return () => clearTimeout(timer);
  }, [untilSec]);

  return active;
}

/** The seconds remaining, and nothing else — the only node on the 1s clock. */
export function CooldownSeconds({ at }: { at: number }) {
  const nowSec = useNowSec();
  const left = Math.max(0, at - nowSec);
  return <>{left}</>;
}
