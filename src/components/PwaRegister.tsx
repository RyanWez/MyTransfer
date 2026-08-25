"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production builds only. In dev the SW's
 * caches would fight HMR and serve stale chunks, so it stays dormant there.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed SW must never take the console down with it.
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
