import { useState, useEffect, useRef } from "react";

/**
 * Similar to useState, but persists the state to sessionStorage so it survives browser reloads.
 * Avoids SSR hydration mismatches by initializing with initialValue and loading from sessionStorage on mount.
 */
export function useSessionState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(initialValue);
  const isHydrated = useRef(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) {
        setState(JSON.parse(stored));
      }
    } catch {}
    isHydrated.current = true;
  }, [key]);

  useEffect(() => {
    if (!isHydrated.current) return;
    try {
      if (state === undefined) {
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, JSON.stringify(state));
      }
    } catch {}
  }, [key, state]);

  return [state, setState] as const;
}

