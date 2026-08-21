"use client";

import { useEffect } from "react";
import { Toaster, toast } from "sonner";
import { CheckCircle2, CircleAlert } from "lucide-react";

/**
 * Toasts carry every action result now — the old inline amber/rose message boxes
 * pushed the layout around. Modern top-center stack with smooth slide.
 * Error toasts stay longer than success (main fix).
 */
export default function Toasts() {
  useEffect(() => {
    // Patch durations globally from main: success 3.5s, error 6.5s, others 4s
    const anyToast = toast as unknown as Record<string, unknown>;
    if (anyToast._patched) return;
    anyToast._patched = true;
    const origSuccess = toast.success.bind(toast);
    const origError = toast.error.bind(toast);
    const orig = (toast as unknown as { (msg: string, opts?: Record<string, unknown>): unknown }).bind(
      toast
    );
    (toast as unknown as Record<string, unknown>).success = (
      msg: Parameters<typeof toast.success>[0],
      opts?: Parameters<typeof toast.success>[1]
    ) => origSuccess(msg, { duration: 3500, ...opts } as never);
    (toast as unknown as Record<string, unknown>).error = (
      msg: Parameters<typeof toast.error>[0],
      opts?: Parameters<typeof toast.error>[1]
    ) => origError(msg, { duration: 6500, ...opts } as never);
    // generic toast() -> 4s
    try {
      (toast as unknown as Record<string, unknown>).__orig = orig;
    } catch {}
  }, []);

  return (
    <Toaster
      position="top-center"
      expand={false}
      visibleToasts={3}
      gap={10}
      offset={16}
      closeButton
      icons={{
        success: (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal-wash">
            <CheckCircle2 className="h-4 w-4 text-signal-deep" strokeWidth={2.5} />
          </div>
        ),
        error: (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-alert-wash">
            <CircleAlert className="h-4 w-4 text-alert-deep" strokeWidth={2.5} />
          </div>
        ),
      }}
      toastOptions={{
        unstyled: true,
        duration: 4000,
        classNames: {
          toast:
            "group flex w-[92vw] max-w-[440px] items-start gap-3 rounded-2xl border border-hairline bg-card/95 px-4 py-3.5 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl " +
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 " +
            "data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2 data-[swipe-direction=up]:slide-out-to-top-2 duration-300",
          success: "border-hairline",
          error: "border-hairline",
          icon: "shrink-0",
          content: "min-w-0 flex-1",
          title: "text-sm font-medium text-ink",
          description: "mt-1 text-xs leading-relaxed text-ink-mute",
          actionButton:
            "ml-2 shrink-0 self-center rounded bg-ink px-2.5 py-1.5 font-mono text-eyebrow font-semibold uppercase text-substrate transition-colors hover:bg-ink-soft",
          closeButton:
            "left-auto right-1 top-1 border-hairline bg-card/80 text-ink-mute backdrop-blur hover:text-ink",
        },
      }}
    />
  );
}
