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
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className
      )}
    >
      {icon && <div className="mb-4 text-ink-faint">{icon}</div>}
      <div className="text-sm font-medium text-ink">{title}</div>
      {body && <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-ink-mute">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export { EmptyState };
