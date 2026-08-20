"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  /** Suffix rendered inside the field — e.g. "Ks" on an amount input. */
  suffix?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, label, error, helperText, iconLeft, iconRight, suffix, id, ...props },
    ref
  ) => {
    const inputId = id || React.useId();
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = helperText && !error ? `${inputId}-helper` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-2 block font-mono text-eyebrow font-semibold uppercase text-ink-mute"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {iconLeft && (
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
              {iconLeft}
            </div>
          )}
          <input
            id={inputId}
            className={cn(
              "flex h-11 w-full rounded border bg-card px-3 text-sm text-ink placeholder:text-ink-faint",
              "transition-colors duration-150",
              "focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2",
              "disabled:cursor-not-allowed disabled:bg-substrate disabled:text-ink-mute",
              iconLeft && "pl-10",
              (iconRight || suffix) && "pr-10",
              error
                ? "border-alert focus:ring-alert"
                : "border-hairline hover:border-hairline-strong",
              className
            )}
            ref={ref}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={cn(errorId, helperId) || undefined}
            {...props}
          />
          {suffix && (
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-faint">
              {suffix}
            </div>
          )}
          {iconRight && !suffix && (
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">
              {iconRight}
            </div>
          )}
        </div>
        {error && (
          <p id={errorId} className="mt-2 text-xs text-alert-deep" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-2 text-xs text-ink-mute">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
