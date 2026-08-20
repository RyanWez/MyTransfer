"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-ink text-substrate hover:bg-ink-soft",
        // Reserved for the one action that moves money.
        brass: "bg-brass text-ink hover:bg-brass-deep hover:text-substrate",
        secondary:
          "bg-card text-ink border border-hairline hover:border-hairline-strong hover:bg-substrate",
        outline: "border border-hairline text-ink hover:bg-card",
        ghost: "text-ink-soft hover:bg-card hover:text-ink",
        destructive: "bg-alert text-white hover:bg-alert-deep",
        link: "text-ink-soft underline-offset-4 hover:text-ink hover:underline",
      },
      size: {
        default: "h-12 px-4 sm:h-9 sm:px-4 text-base sm:text-sm",
        sm: "h-10 px-3 sm:h-8 sm:px-3 text-sm sm:text-xs",
        lg: "h-14 px-6 sm:h-11 sm:px-6 text-base sm:text-sm",
        xl: "h-14 px-8 sm:h-12 sm:px-8 text-base",
        icon: "h-12 w-12 sm:h-9 sm:w-9",
        // Dense card footers, where a 36px target next to an 11px label reads heavy.
        "icon-sm": "h-10 w-10 sm:h-8 sm:w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {/* Slot takes exactly one child, so the spinner only exists on real buttons —
            asChild is for links, which don't have a pending state anyway. */}
        {asChild ? (
          children
        ) : (
          <>
            {/* Keep the label through the pending state — the action doesn't change name. */}
            {loading && (
              <svg
                className="h-3.5 w-3.5 animate-spin shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="opacity-25"
                />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            )}
            {children}
          </>
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
