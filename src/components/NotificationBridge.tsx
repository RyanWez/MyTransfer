"use client";

import { useEffect } from "react";
import { useLive, type LiveUpdate } from "@/lib/liveEvents";
import { chime, notifEnabled, showNotif } from "@/lib/notifications";

const BASE_TITLE = "MyShare · Mytel transfer console";

/**
 * Listens to the shared SSE stream and surfaces transfer results as OS
 * notifications — but only when the tab is in the background and the user
 * opted in. In the foreground the receipt/toast already tells the story.
 */
export default function NotificationBridge() {
  // Title flash: mark unread results while the tab is hidden.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") document.title = BASE_TITLE;
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.title = BASE_TITLE;
    };
  }, []);

  useLive((u?: LiveUpdate) => {
    if (!u || u.kind !== "transfer:result") return;
    if (document.visibilityState === "visible") return;
    if (!notifEnabled()) return;

    const ok = u.status === "success";
    const title = ok ? "Transfer sent ✓" : "Transfer failed";
    let body = `Ks ${u.amount.toLocaleString()} → ${u.receiver}`;
    if (!ok && u.message) body += ` — ${u.message}`;

    void showNotif(title, {
      body,
      tag: `ms-transfer-${u.id}`,
    });
    chime(ok);
    document.title = "🔔 MyShare";
  });

  return null;
}
