"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/format";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm font-mono uppercase tracking-[0.08em] leading-none",
  {
    variants: {
      tone: {
        signal: "bg-signal-wash text-signal-deep",
        alert: "bg-alert-wash text-alert-deep",
        brass: "bg-brass-wash text-brass-deep",
        muted: "bg-substrate text-ink-mute border border-hairline",
      },
      size: {
        default: "px-2 py-1 text-[10px]",
        lg: "px-2.5 py-1.5 text-eyebrow",
      },
    },
    defaultVariants: {
      tone: "muted",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color">,
    VariantProps<typeof badgeVariants> {
  tone?: Tone;
}

function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
