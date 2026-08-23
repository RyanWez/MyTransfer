"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  error?: boolean;
  onSubmit?: () => void;
}

/**
 * One cell per digit, with auto-advance, backspace-retreat, arrow navigation and
 * paste-fill. Replaces the single wide input faked with letter-spacing.
 */
function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  autoFocus,
  className,
  error,
  onSubmit,
}: OtpInputProps) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const [punch, setPunch] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (value === "" && refs.current[0]) {
      const isFocused = refs.current.some((el) => el === document.activeElement);
      if (isFocused && document.activeElement !== refs.current[0]) {
        refs.current[0].focus();
      }
    }
  }, [value]);

  const digits = value.split("");

  const focusAt = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(i, length - 1))];
    el?.focus();
    el?.select();
  };

  const punchAt = (i: number) => {
    setPunch(i);
    window.setTimeout(() => setPunch((p) => (p === i ? null : p)), 200);
  };

  const commit = (i: number, incoming: string) => {
    const chars = value.split("");
    for (let k = 0; k < incoming.length && i + k < length; k++) {
      chars[i + k] = incoming[k];
    }
    onChange(chars.join("").slice(0, length));
    punchAt(i);
    focusAt(i + incoming.length);
  };

  const handleChange = (i: number, raw: string) => {
    const incoming = raw.replace(/\D/g, "");
    if (incoming) commit(i, incoming);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        onChange(value.slice(0, i - 1) + value.slice(i));
        focusAt(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(i + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasted) {
      onChange(pasted);
      punchAt(0);
      focusAt(pasted.length);
    }
  };

  return (
    <div
      className={cn(
        "flex gap-2",
        error && "animate-shake-x",
        className
      )}
      onPaste={handlePaste}
    >
      {Array.from({ length }, (_, i) => {
        const filled = Boolean(digits[i]);
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={digits[i] ?? ""}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onSubmit) {
                e.preventDefault();
                onSubmit();
              } else {
                handleKeyDown(i, e);
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1} of ${length}`}
            className={cn(
              "h-16 w-full min-w-0 sm:h-14 rounded border bg-card text-center font-mono text-otp text-ink",
              "transition-colors duration-150 focus:outline-none focus:border-brass focus:ring-1 focus:ring-brass",
              "disabled:bg-substrate disabled:text-ink-faint",
              error ? "border-alert text-alert focus:border-alert focus:ring-alert" : filled ? "border-brass" : "border-hairline hover:border-hairline-strong",
              punch === i && "animate-cell-punch"
            )}
          />
        );
      })}
    </div>
  );
}

export { OtpInput };
