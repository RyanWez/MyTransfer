import { useState, useEffect, useRef } from "react";

/**
 * Similar to useState, but persists the state to localStorage so it survives browser restarts.
 * Avoids SSR hydration mismatches by initializing with initialValue and loading from localStorage on mount.
 */
export function useLocalState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(initialValue);
  const isHydrated = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
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
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(state));
      }
    } catch {}
  }, [key, state]);

  return [state, setState] as const;
}
