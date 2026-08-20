"use client";

import { Toaster } from "sonner";
import { Check, CircleAlert } from "lucide-react";

/**
 * Toasts carry every action result now — the old inline amber/rose message boxes
 * pushed the layout around. Fully unstyled so they use the console's own tokens.
 */
export default function Toasts() {
  return (
    <Toaster
      position="bottom-right"
      gap={8}
      offset={20}
      icons={{
        success: <Check className="h-4 w-4 text-signal-deep" strokeWidth={2.25} />,
        error: <CircleAlert className="h-4 w-4 text-alert" strokeWidth={2} />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-start gap-2.5 rounded border border-hairline bg-card px-3.5 py-3 shadow-lift",
          success: "border-signal/40",
          error: "border-alert/40",
          icon: "mt-px shrink-0",
          content: "min-w-0 flex-1",
          title: "text-sm font-medium text-ink",
          description: "mt-0.5 text-xs leading-relaxed text-ink-mute",
          actionButton:
            "ml-2 shrink-0 self-center rounded bg-ink px-2 py-1 font-mono text-eyebrow font-semibold uppercase text-substrate transition-colors hover:bg-ink-soft",
          closeButton: "border-hairline bg-card text-ink-mute hover:text-ink",
        },
      }}
    />
  );
}
