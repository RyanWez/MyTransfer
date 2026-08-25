"use client";

import { useEffect } from "react";
import { Toaster, toast } from "sonner";
import { CheckCircle2, CircleAlert } from "lucide-react";

const DEFAULT_MS = 4000;
const SWEEP_MS = 500;
/** Small grace so sonner's own timer (when unfrozen) always wins the race. */
const GRACE_MS = 300;

/**
 * Toasts carry every action result — the old inline amber/rose message boxes
 * pushed the layout around. Modern top-center stack with smooth slide.
 *
 * Why the sweeper: sonner v2 hard-freezes its own dismissal timers while the
 * pointer rests on the stack (expanded) or the tab is hidden — there is no
 * opt-out, and Alt-Tabbing away never fires mouseleave, so the freeze latches.
 * With the notification bell on, the operator's workflow hits both constantly
 * and toasts piled up without ever dismissing. This interval reads sonner's
 * store directly and dismisses each toast once its real age passes its
 * duration — a clock sonner can't pause (throttled while hidden, flushed the
 * moment the tab comes back).
 */
export default function Toasts() {
  useEffect(() => {
    const seen = new Map<string | number, number>();

    const timer = setInterval(() => {
      const now = Date.now();
      const alive = new Set<string | number>();

      for (const t of toast.getToasts()) {
        alive.add(t.id);
        // Dismissal stubs carry no duration — only live toasts get aged out.
        if (!("duration" in t)) continue;
        if (t.type === "loading" || t.duration === Infinity) continue;

        const first = seen.get(t.id);
        if (first === undefined) {
          seen.set(t.id, now);
          continue;
        }
        if (now - first >= (t.duration ?? DEFAULT_MS) + GRACE_MS) {
          toast.dismiss(t.id);
        }
      }

      // Toasts sonner already removed leave the map.
      for (const id of seen.keys()) {
        if (!alive.has(id)) seen.delete(id);
      }
    }, SWEEP_MS);

    return () => {
      clearInterval(timer);
      seen.clear();
    };
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
        duration: DEFAULT_MS,
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
