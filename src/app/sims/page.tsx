"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, SquareStack } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OtpInput } from "@/components/ui/OtpInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { SimCard } from "@/components/SimCard";
import { fmtKs, fmtPhoneGrouped } from "@/lib/format";
import type { Sim } from "@/lib/types";

type LoginMode = "otp" | "password";

export default function SimsPage() {
  const [sims, setSims] = useState<Sim[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const [loginOpen, setLoginOpen] = useState(false);
  const [mode, setMode] = useState<LoginMode>("otp");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const [pendingRemove, setPendingRemove] = useState<Sim | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/sims")
        .then((r) => r.json())
        .then((d) => setSims((d.sims ?? []) as Sim[]))
        .catch(() => {})
        .finally(() => setLoaded(true)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  function openLogin(prefill?: string) {
    setPhone(prefill ?? "");
    setOtp("");
    setPassword("");
    setOtpSent(false);
    setMode("otp");
    setLoginOpen(true);
  }

  async function requestOtp() {
    if (!phone) return;
    setBusy(true);
    try {
      const r = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      }).then((r) => r.json());
      if (r.ok) {
        setOtpSent(true);
        toast.success("OTP sent", { description: `Read the code off ${fmtPhoneGrouped(phone)}.` });
      } else {
        toast.error("Couldn't send the OTP", {
          description: r.message || "Check the number and try again.",
        });
      }
    } catch {
      toast.error("Network error", { description: "The console couldn't reach Mytel. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function doLogin() {
    setBusy(true);
    try {
      const url = mode === "otp" ? "/api/auth/verify-otp" : "/api/auth/login-password";
      const body = mode === "otp" ? { phone, otp } : { phone, password };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (r.ok) {
        toast.success(`${fmtPhoneGrouped(phone)} logged in`, {
          description:
            r.balance !== null && r.balance !== undefined
              ? `Balance ${fmtKs(r.balance)}.`
              : "Balance not read yet — use the refresh button on the card.",
        });
        setLoginOpen(false);
        load();
      } else {
        toast.error("Login failed", {
          description: r.message || r.error || "Check the code or password and try again.",
        });
      }
    } catch {
      toast.error("Network error", { description: "The console couldn't reach Mytel. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function refreshBalance(sim: Sim) {
    setRefreshing(sim.phone);
    try {
      const r = await fetch("/api/sims/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: sim.phone }),
      }).then((r) => r.json());
      if (r.ok) {
        toast.success(`${fmtPhoneGrouped(sim.phone)} balance read`, {
          description: r.balance !== null && r.balance !== undefined ? fmtKs(r.balance) : undefined,
        });
      } else if (r.needsLogin) {
        toast.error("Token expired", {
          description: `Log in ${fmtPhoneGrouped(sim.phone)} again to keep using it.`,
          action: { label: "Log in", onClick: () => openLogin(sim.phone) },
        });
      } else {
        toast.error("Couldn't read the balance", { description: r.message || r.error || undefined });
      }
      load();
    } catch {
      toast.error("Network error", { description: "The console couldn't reach Mytel. Try again." });
    } finally {
      setRefreshing(null);
    }
  }

  async function confirmRemove() {
    const sim = pendingRemove;
    if (!sim) return;
    setPendingRemove(null);
    await fetch("/api/sims", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: sim.phone }),
    });
    toast.success(`${fmtPhoneGrouped(sim.phone)} removed`, {
      description: "Its transfer history stays in the log.",
    });
    load();
  }

  const canSubmit = mode === "otp" ? otp.length === 6 : password.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-eyebrow font-semibold uppercase tnum text-ink-mute">
          {sims.length} {sims.length === 1 ? "SIM" : "SIMs"} ·{" "}
          {sims.filter((s) => s.status === "active").length} active
        </span>
        <Button variant="secondary" size="sm" onClick={() => openLogin()}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Log in a SIM
        </Button>
      </div>

      {loaded && sims.length === 0 ? (
        <div className="rounded border border-hairline bg-card">
          <EmptyState
            icon={<SquareStack className="h-7 w-7" strokeWidth={1.25} />}
            title="The tray is empty"
            body="Log in a Mytel SIM with an SMS code or its MyID password to read balances and send transfers."
            action={
              <Button onClick={() => openLogin()}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                Log in a SIM
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sims.map((s, i) => (
            <SimCard
              key={s.id}
              sim={s}
              refreshing={refreshing === s.phone}
              onRefresh={refreshBalance}
              onRemove={setPendingRemove}
              onLogin={(sim) => openLogin(sim.phone)}
              className="animate-rise-in"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            />
          ))}
        </div>
      )}

      {/* Login */}
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log in a SIM</DialogTitle>
            <DialogDescription>
              Mytel authorises this console with the SIM&apos;s own credentials. Nothing leaves this
              machine.
            </DialogDescription>
          </DialogHeader>

          <SegmentedControl
            aria-label="Login method"
            value={mode}
            onValueChange={(v) => {
              setMode(v);
              setOtpSent(false);
            }}
            options={[
              { value: "otp", label: "SMS code" },
              { value: "password", label: "MyID password" },
            ]}
          />

          <div className="space-y-4">
            <Input
              label="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
              disabled={mode === "otp" && otpSent}
              placeholder="09XXXXXXXXX"
              inputMode="numeric"
              autoComplete="off"
              className="font-mono"
            />

            {mode === "otp"
              ? otpSent && (
                  <div>
                    <div className="mb-2 font-mono text-eyebrow font-semibold uppercase text-ink-mute">
                      Code from SMS
                    </div>
                    <OtpInput value={otp} onChange={setOtp} autoFocus />
                  </div>
                )
              : (
                  <Input
                    label="MyID password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setLoginOpen(false)} disabled={busy}>
              Cancel
            </Button>
            {mode === "otp" && otpSent && (
              <Button variant="outline" onClick={requestOtp} disabled={busy}>
                Resend
              </Button>
            )}
            {mode === "otp" && !otpSent ? (
              <Button onClick={requestOtp} loading={busy} disabled={!phone}>
                Send code
              </Button>
            ) : (
              <Button onClick={doLogin} loading={busy} disabled={!phone || !canSubmit}>
                Log in
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <Dialog open={!!pendingRemove} onOpenChange={(o) => !o && setPendingRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {pendingRemove && fmtPhoneGrouped(pendingRemove.phone)}?</DialogTitle>
            <DialogDescription>
              This drops the SIM and its stored tokens from the tray. Transfers it already made stay
              in the history, and you can log it back in any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingRemove(null)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={confirmRemove}>
              Remove SIM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
