"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const notchClass = {
  sm: "notch notch-sm",
  md: "notch",
  lg: "notch notch-lg",
} as const;

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Applied to the inner surface — put padding here. */
  contentClassName?: string;
  notch?: keyof typeof notchClass;
  /** Selected state: the hairline border layer becomes brass. */
  active?: boolean;
  as?: "div" | "button";
  disabled?: boolean;
  type?: "button" | "submit";
}

/**
 * A SIM-shaped surface: rectangle with the top-right corner cut at 45°.
 *
 * clip-path removes any border along the diagonal, so the hairline is faked by
 * stacking two clipped layers — an outer filled `hairline`, an inner inset 1px
 * filled `card`. Focus rings are drawn `ring-inset` on the inner layer for the
 * same reason: an outset ring would be clipped away.
 */
const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  (
    { className, contentClassName, notch = "md", active, as = "div", children, ...props },
    ref
  ) => {
    const Comp = as as React.ElementType;
    const clip = notchClass[notch];
    const interactive = as === "button";

    return (
      <Comp
        ref={ref}
        className={cn(
          clip,
          "p-px text-left transition-colors duration-150",
          active ? "bg-brass" : "bg-hairline",
          interactive && [
            "block w-full outline-none",
            !active && "hover:bg-hairline-strong",
            "[&:focus-visible>div]:ring-2 [&:focus-visible>div]:ring-inset [&:focus-visible>div]:ring-ink",
            "disabled:opacity-50",
          ],
          className
        )}
        {...props}
      >
        <div className={cn(clip, "h-full bg-card", contentClassName)}>{children}</div>
      </Comp>
    );
  }
);
Panel.displayName = "Panel";

export { Panel };
