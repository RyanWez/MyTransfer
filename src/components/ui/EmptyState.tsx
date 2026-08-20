"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  /** One line on what to do next — an empty screen is an invitation to act. */
  body?: string;
  action?: React.ReactNode;
  className?: string;
}

function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center animate-in fade-in zoom-in-95 duration-500 rounded-xl bg-card border border-hairline shadow-sm",
        className
      )}
    >
      {icon && (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-substrate text-ink-faint shadow-inner">
          {icon}
        </div>
      )}
      <div className="text-base font-semibold text-ink">{title}</div>
      {body && <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-mute">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export { EmptyState };
