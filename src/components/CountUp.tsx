"use client";

import { useEffect, useRef, useState } from "react";

const fmtDefault = (n: number) => n.toLocaleString("en-US");

export interface CountUpProps {
  value: number;
  /** Render for the in-flight number; defaults to en-US grouping. */
  format?: (n: number) => string;
  duration?: number;
}

/**
 * Animates a number from its previous value to the new one — 0 on first sight.
 * Respects prefers-reduced-motion by jumping straight to the target.
 */
export function CountUp({ value, format = fmtDefault, duration = 900 }: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // First paint counts up from zero; later updates ease from what's on screen.
    const from = startedRef.current ? displayRef.current : 0;
    startedRef.current = true;

    if (reduced || from === value || duration <= 0) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); // easeOutExpo
      const v = Math.round(from + (value - from) * eased);
      displayRef.current = v;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format(display)}</>;
}
