import { NextRequest } from "next/server";
import { sse } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat to establish connection
      controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
      
      const onUpdate = () => {
        controller.enqueue(new TextEncoder().encode("data: update\n\n"));
      };
      
      sse.on("update", onUpdate);
      
      req.signal.addEventListener("abort", () => {
        sse.off("update", onUpdate);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
