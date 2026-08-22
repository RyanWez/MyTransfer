import { NextRequest } from "next/server";
import { sse } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const enc = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let onUpdate: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const cleanup = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (onUpdate) {
          sse.off("update", onUpdate);
          onUpdate = null;
        }
        try {
          controller.close();
        } catch {}
      };

      // Send initial heartbeat + retry hint to establish connection
      try {
        controller.enqueue(enc.encode("retry: 3000\n: heartbeat\n\n"));
      } catch {}

      onUpdate = () => {
        try {
          controller.enqueue(enc.encode("data: update\n\n"));
        } catch {
          // controller closed, cleanup will happen via abort/cancel
        }
      };

      sse.on("update", onUpdate);

      // Periodic keepalive every 15s to prevent Fly/Nginx idle timeout (60s)
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, 15000);

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (onUpdate) {
        sse.off("update", onUpdate);
        onUpdate = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "none",
    },
  });
}
