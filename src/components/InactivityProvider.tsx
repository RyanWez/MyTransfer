"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// 1 hour in milliseconds
const INACTIVITY_LIMIT = 60 * 60 * 1000;

export function InactivityProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function resetTimer() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch {}
        window.location.assign("/login");
      }, INACTIVITY_LIMIT);
    }

    // Set initial timer
    resetTimer();

    // Listen to user activity
    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    
    // Throttle the reset so we aren't calling clearTimeout on every pixel of mouse movement
    let ticking = false;
    function handleActivity() {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          resetTimer();
          ticking = false;
        });
        ticking = true;
      }
    }

    for (const event of events) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of events) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [router]);

  return <>{children}</>;
}
