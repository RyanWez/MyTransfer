"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, SquareStack, X } from "lucide-react";
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
import { fmtKs, fmtPhoneGrouped, sameNumber } from "@/lib/format";
import { fetchSims, invalidateCache } from "@/lib/api";
import type { Sim } from "@/lib/types";

type LoginMode = "otp" | "password";
/** Which endpoint pair the SMS code belongs to — see /api/auth/request-otp. */
type Flow = "login" | "register";

export default function SimsPage() {
  const [sims, setSims] = useState<Sim[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [loginOpen, setLoginOpen] = useState(false);
  const [mode, setMode] = useState<LoginMode>("otp");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState<Flow>("login");
  // Only set on the register flow; v2/register/confirm needs it alongside the code.
  const [reqId, setReqId] = useState<string | null>(null);
  const [regSubId, setRegSubId] = useState<string | null>(null);

  const [pendingRemove, setPendingRemove] = useState<Sim | null>(null);

  const load = useCallback(
    () =>
      fetchSims()
        .then((all) => setSims(all))
        .catch(() => {})
        .finally(() => setLoaded(true)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const filteredSims = useMemo(() => {
    if (!searchQuery.trim()) return sims;
    const q = searchQuery.toLowerCase().replace(/[\s-+]/g, "");
    return sims.filter((s) => {
      const phoneClean = s.phone.toLowerCase().replace(/[\s-+]/g, "");
      const noteMatch = s.note ? s.note.toLowerCase().includes(searchQuery.toLowerCase()) : false;
      return phoneClean.includes(q) || noteMatch;
    });
  }, [sims, searchQuery]);

  function openLogin(prefill?: string) {
    setPhone(prefill ?? "");
    setOtp("");
    setPassword("");
    setOtpSent(false);
    setMode("otp");
    setFlow("login");
    setReqId(null);
    setRegSubId(null);
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
        setFlow(r.flow === "register" ? "register" : "login");
        setReqId(r.reqId ?? null);
        setRegSubId(r.subscriptionId ?? null);
        toast.success("OTP sent", {
          description:
            r.flow === "register"
              ? `No MyID account on this number yet — the code will open one. Read it off ${fmtPhoneGrouped(phone)}.`
              : `Read the code off ${fmtPhoneGrouped(phone)}.`,
        });
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
      const body =
        mode === "otp"
          ? { phone, otp, reqId, subscriptionId: regSubId }
          : { phone, password };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (r.ok) {
        toast.success(
          r.registered
            ? `${fmtPhoneGrouped(phone)} registered and logged in`
            : `${fmtPhoneGrouped(phone)} logged in`,
          {
            description:
              r.balance !== null && r.balance !== undefined
                ? `Balance ${fmtKs(r.balance)}.`
                : "Balance not read yet — use the refresh button on the card.",
          }
        );
        setLoginOpen(false);
        invalidateCache();
        load();
      } else {
        toast.error(flow === "register" ? "Couldn't open the account" : "Login failed", {
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
      invalidateCache();
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
    invalidateCache();
    load();
  }

  const canSubmit = mode === "otp" ? otp.length === 6 : password.length > 0;
  /** A number already in the tray is a token refresh, not a second card. */
  const alreadyInTray = phone ? sims.find((s) => sameNumber(s.phone, phone)) : undefined;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-eyebrow font-semibold uppercase tnum text-ink-mute">
          {searchQuery.trim() ? (
            <>
              {filteredSims.length} of {sims.length} {sims.length === 1 ? "SIM" : "SIMs"}
            </>
          ) : (
            <>
              {sims.length} {sims.length === 1 ? "SIM" : "SIMs"} ·{" "}
              {sims.filter((s) => s.status === "active").length} active
            </>
          )}
        </span>
        <div className="flex items-center gap-2.5">
          <div className="relative w-44 sm:w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search SIM or note..."
              className="h-8 w-full rounded border border-hairline bg-card pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint transition-colors focus:border-hairline-strong focus:outline-none focus:ring-1 focus:ring-ink"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={() => openLogin()} className="shrink-0">
            <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Log in a SIM
          </Button>
        </div>
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
      ) : loaded && filteredSims.length === 0 ? (
        <div className="rounded border border-hairline bg-card">
          <EmptyState
            icon={<Search className="h-7 w-7" strokeWidth={1.25} />}
            title="No matching SIMs"
            body={`No SIMs found matching "${searchQuery}". Try a different phone number or note.`}
            action={
              <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredSims.map((s, i) => (
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
              Mytel authorises this console with the SIM&apos;s own credentials. A number with no
              MyID account yet gets one opened by the same SMS code. Nothing leaves this machine.
            </DialogDescription>
          </DialogHeader>

          <SegmentedControl
            aria-label="Login method"
            value={mode}
            onValueChange={(v) => {
              setMode(v);
              setOtpSent(false);
              setFlow("login");
              setReqId(null);
              setRegSubId(null);
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

            {alreadyInTray && (
              <p className="text-sm text-ink-mute">
                {fmtPhoneGrouped(alreadyInTray.phone)} is already in the tray. Logging in again
                replaces its stored token and keeps its place — no duplicate card, and its
                transfer history is untouched.
              </p>
            )}

            {mode === "otp"
              ? otpSent && (
                  <div>
                    <div className="mb-2 font-mono text-eyebrow font-semibold uppercase text-ink-mute">
                      Code from SMS
                    </div>
                    <OtpInput value={otp} onChange={setOtp} autoFocus />
                    {flow === "register" && (
                      <p className="mt-2 text-sm text-ink-mute">
                        This number has no MyID account. Entering the code opens one and logs it
                        in — no need to visit the MyID app first.
                      </p>
                    )}
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
                {mode === "otp" && flow === "register" ? "Open account & log in" : "Log in"}
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
