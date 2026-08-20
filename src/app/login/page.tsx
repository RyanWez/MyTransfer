"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * The only unauthenticated surface in the app. Posts to /api/auth/login, which
 * sets the httpOnly session cookie; the middleware then lets the browser in.
 *
 * useSearchParams requires a Suspense boundary at prerender time, so the form
 * is wrapped below.
 */
export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // If the gate isn't armed (dev without AUTH_PASSWORD), skip straight in.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/login")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.ok && d.required === false) {
          const next = params.get("next");
          router.replace(next && next.startsWith("/") ? next : "/");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router, params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || locked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        // Only allow same-site relative destinations.
        const next = params.get("next");
        router.replace(next && next.startsWith("/") ? next : "/");
        router.refresh();
        return;
      }
      if (res.status === 503) {
        // Server misconfiguration — retrying won't help.
        setLocked(true);
        setError(String(data?.error ?? "Server is not configured for login"));
      } else {
        setError(String(data?.error ?? "Wrong password"));
        setPassword("");
        inputRef.current?.focus();
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-hairline bg-card shadow-panel">
            <Lock className="h-5 w-5 text-ink-soft" strokeWidth={1.75} />
          </div>
          <h1 className="font-mono text-[13px] font-semibold uppercase tracking-[0.12em] text-ink">
            MyShare console
          </h1>
          <p className="mt-1.5 text-sm text-ink-mute">
            Enter the operator password to continue
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-hairline bg-card p-5 shadow-panel"
        >
          <Input
            ref={inputRef}
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={locked}
            error={error ?? undefined}
            iconLeft={<Lock className="h-4 w-4" strokeWidth={1.75} />}
            placeholder="••••••••"
          />
          <Button
            type="submit"
            className="mt-4 w-full"
            loading={busy}
            disabled={locked || !password}
          >
            {busy ? "Checking…" : "Unlock"}
          </Button>

          {locked && (
            <div className="mt-4 flex items-start gap-2 rounded border border-alert/40 bg-alert/5 px-3 py-2.5 text-xs leading-relaxed text-ink-mute">
              <ShieldAlert className="mt-px h-4 w-4 shrink-0 text-alert" strokeWidth={1.75} />
              <span>
                This deployment has no <code className="font-mono">AUTH_PASSWORD</code> set,
                so the console stays locked. Set it in the server environment and redeploy.
              </span>
            </div>
          )}
        </form>

        <p className="mt-6 text-center text-xs text-ink-faint">
          This console holds live SIM tokens — keep the password private.
        </p>
      </div>
    </div>
  );
}
