"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Cpu, Plus, Search, SquareStack, X } from "lucide-react";
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
import { SimCard, SimCardSkeleton } from "@/components/SimCard";
import { fmtKs, fmtPhoneGrouped, sameNumber } from "@/lib/format";
import { fetchSims, invalidateCache } from "@/lib/api";
import { useLive } from "@/lib/liveEvents";
import { useSessionState } from "@/lib/useSessionState";
import { useNowSec } from "@/lib/useNowSec";
import type { Sim } from "@/lib/types";

type LoginMode = "otp" | "password";
/** Which endpoint pair the SMS code belongs to — see /api/auth/request-otp. */
type Flow = "login" | "register";

export default function SimsPage() {
  const [sims, setSims] = useState<Sim[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSims, setSelectedSims] = useState<string[]>([]);

  const [loginOpen, setLoginOpen] = useSessionState("login_open", false);
  const [mode, setMode] = useSessionState<LoginMode>("login_mode", "otp");
  const [phone, setPhone] = useSessionState("login_phone", "");
  const [otp, setOtp] = useSessionState("login_otp", "");
  const [password, setPassword] = useSessionState("login_password", "");
  const [otpSent, setOtpSent] = useSessionState("login_otpSent", false);
  const [otpError, setOtpError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useSessionState<Flow>("login_flow", "login");
  // Only set on the register flow; v2/register/confirm needs it alongside the code.
  const [reqId, setReqId] = useSessionState<string | null>("login_reqId", null);
  const [regSubId, setRegSubId] = useSessionState<string | null>("login_regSubId", null);
  
  const [loginResendAt, setLoginResendAt] = useSessionState("login_resendAt", 0);
  const nowSec = useNowSec();
  const cooldown = loginResendAt > 0 ? Math.max(0, loginResendAt - nowSec) : 0;

  const [pendingRemove, setPendingRemove] = useState<Sim | null>(null);
  const [pendingBulkRemove, setPendingBulkRemove] = useState(false);
  // The destructive buttons spin until the server confirms — the dialogs stay
  // open through the request so a slow link never looks like nothing happened.
  const [deleting, setDeleting] = useState(false);
  // Focused when the login dialog opens, so a number can be typed immediately.
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    (background = false) => {
      if (!background) setLoaded(false);
      const opts = background ? { bypassCache: true, noDelay: true } : undefined;
      fetchSims(opts)
        .then((all) => setSims(all))
        .catch(() => {})
        .finally(() => setLoaded(true));
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  // Shared app-wide EventSource: refetch on pushes, reconnect with backoff.
  useLive(() => {
    invalidateCache("sims");
    fetchSims({ bypassCache: true, noDelay: true })
      .then((all) => setSims(all))
      .catch(() => {});
  });

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
    setOtpError(false);
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
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const r = await res.json().catch(() => ({ ok: false, message: `Server error (${res.status})` }));
      if (res.ok && r.ok) {
        setOtpSent(true);
        setFlow(r.flow === "register" ? "register" : "login");
        setReqId(r.reqId ?? null);
        setRegSubId(r.subscriptionId ?? null);
        setLoginResendAt(Math.floor(Date.now() / 1000) + 45);
        toast.success("OTP sent", {
          description:
            r.flow === "register"
              ? `No MyID account on this number yet — the code will open one. Read it off ${fmtPhoneGrouped(phone)}.`
              : `Read the code off ${fmtPhoneGrouped(phone)}.`,
        });
      } else {
        const raw = r.message || r.error || "Check the number and try again.";
        const isMsisdnError =
          raw.includes("msisdnReq") || raw.includes("Invalid phone number");
        toast.error(isMsisdnError ? "Invalid phone number" : "Couldn't send the OTP", {
          description: isMsisdnError
            ? raw
            : raw,
        });
      }
    } catch (err: any) {
      toast.error("Network error", { description: err?.message || "The console couldn't reach Mytel. Try again." });
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
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const r = await res.json().catch(() => ({ ok: false, message: `Server error (${res.status})` }));
      if (res.ok && r.ok) {
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
        const msg = r.message || r.error || "Check the code or password and try again.";
        const isNewCode =
          r.errorCode === 401 || String(msg).toLowerCase().includes("new code");
        
        if (mode === "otp") {
          setOtpError(true);
          setTimeout(() => {
            setOtp("");
            setOtpError(false);
          }, 500);
        }

        if (flow !== "register" && isNewCode) {
          toast.error("Login failed - Mytel sent a new code, please wait for second SMS", {
            description: msg,
          });
        } else {
          toast.error(flow === "register" ? "Couldn't open the account" : "Login failed", {
            description: msg,
          });
        }
      }
    } catch (err: any) {
      toast.error("Network error", { description: err?.message || "The console couldn't reach Mytel. Try again." });
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

  function toggleSelection(sim: Sim) {
    setSelectedSims((prev) =>
      prev.includes(sim.phone) ? prev.filter((p) => p !== sim.phone) : [...prev, sim.phone]
    );
  }

  async function confirmRemove() {
    const sim = pendingRemove;
    if (!sim || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/sims", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: sim.phone }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`${fmtPhoneGrouped(sim.phone)} removed`, {
        description: "Its transfer history stays in the log.",
      });
      setPendingRemove(null);
      invalidateCache();
      load();
    } catch {
      toast.error("Couldn't remove the SIM", { description: "Network error — try again." });
    } finally {
      setDeleting(false);
    }
  }

  async function confirmBulkRemove() {
    if (selectedSims.length === 0 || deleting) return;
    const phones = selectedSims;
    setDeleting(true);
    try {
      const res = await fetch("/api/sims", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`${phones.length} SIMs removed`, {
        description: "Their transfer histories stay in the log.",
      });
      setSelectedSims([]);
      setSelectionMode(false);
      setPendingBulkRemove(false);
      invalidateCache();
      load();
    } catch {
      toast.error("Couldn't remove the SIMs", { description: "Network error — try again." });
    } finally {
      setDeleting(false);
    }
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
              className="h-8 w-full rounded border border-hairline bg-card pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint transition-colors focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
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
          {sims.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectionMode) {
                  setSelectionMode(false);
                  setSelectedSims([]);
                } else {
                  setSelectionMode(true);
                }
              }}
              className="shrink-0"
            >
              {selectionMode ? "Cancel" : "Select"}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => openLogin()} className="shrink-0 transition-transform hover:scale-105 active:scale-95">
            <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Log in a SIM
          </Button>
        </div>
      </div>

      {!loaded ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SimCardSkeleton key={i} />
          ))}
        </div>
      ) : loaded && sims.length === 0 ? (
        <EmptyState
          icon={
            <div className="relative w-24 h-24 flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
              <div className="absolute inset-0 bg-gradient-to-tr from-brass-soft/20 to-transparent rounded-2xl animate-pulse" />
              <div className="absolute -inset-2 bg-substrate rounded-3xl opacity-50 dark:opacity-10 blur-xl" />
              <div className="relative w-16 h-20 bg-card border border-hairline shadow-xl rounded-md flex flex-col p-2 notch-lg rotate-12 transition-transform duration-500 hover:rotate-6">
                <div className="absolute right-1 top-4 w-4 h-4 text-brass-deep/20">
                  <Cpu className="w-full h-full" strokeWidth={1.5} />
                </div>
                <div className="mt-auto flex gap-1">
                  <div className="w-3 h-1 bg-hairline rounded-full" />
                  <div className="w-2 h-1 bg-hairline rounded-full" />
                </div>
              </div>
              <div className="absolute -bottom-2 -left-2 w-12 h-16 bg-substrate border border-hairline shadow-lg rounded-md notch-sm -rotate-6 flex items-center justify-center">
                <SquareStack className="h-5 w-5 text-ink-mute" strokeWidth={1.5} />
              </div>
            </div>
          }
          title="The tray is empty"
          body="Log in a Mytel SIM with an SMS code or its MyID password to read balances and send transfers."
          action={
            <Button onClick={() => openLogin()} className="transition-transform hover:scale-105 active:scale-95 shadow-md">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Log in a SIM
            </Button>
          }
        />
      ) : loaded && filteredSims.length === 0 ? (
        <EmptyState
          icon={
            <div className="relative w-24 h-24 flex items-center justify-center">
              <div className="absolute inset-0 bg-substrate rounded-full opacity-50 blur-lg" />
              <div className="relative w-16 h-16 bg-card border border-hairline rounded-full flex items-center justify-center shadow-inner">
                <Search className="h-7 w-7 text-ink-mute animate-pulse" strokeWidth={1.5} />
              </div>
            </div>
          }
          title="No matching SIMs"
          body={`No SIMs found matching "${searchQuery}". Try a different phone number or note.`}
          action={
            <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredSims.map((s, i) => (
            <SimCard
              key={s.id}
              sim={s}
              refreshing={refreshing === s.phone}
              onRefresh={refreshBalance}
              onRemove={setPendingRemove}
              onLogin={(sim) => openLogin(sim.phone)}
              selectionMode={selectionMode}
              selected={selectedSims.includes(s.phone)}
              onSelectToggle={toggleSelection}
              className="animate-rise-in"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            />
          ))}
        </div>
      )}

      {/* Login */}
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        {/* Land straight in the phone field: the whole point of the dialog is
            typing a number, so don't let Radix park focus on the close X. */}
        <DialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            phoneInputRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Log in a SIM</DialogTitle>
            <DialogDescription>
              Mytel authorises this console with the SIM&apos;s own credentials. A number with no
              MyID account yet gets one opened by the same SMS code. Nothing leaves this machine.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* While an SMS code is pending, switching to the password tab would
                abandon that code — lock the switch until Cancel/Resend resolves it. */}
            <SegmentedControl
              aria-label="Login method"
              value={mode}
              disabled={otpSent}
              onValueChange={(v) => {
                if (otpSent) return;
                setMode(v);
                setOtpSent(false);
                setFlow("login");
                setReqId(null);
                setRegSubId(null);
                setOtp("");
                setPassword("");
              }}
              options={[
                { value: "otp", label: "SMS code" },
                { value: "password", label: "MyID password" },
              ]}
              fullWidth
              className="w-full"
            />

            <div className="space-y-4">
              <Input
                ref={phoneInputRef}
                label="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && mode === "otp" && !otpSent && phone && !busy) {
                    requestOtp();
                  }
                }}
                disabled={mode === "otp" && otpSent}
                placeholder="09XXXXXXXXX"
                inputMode="numeric"
                autoComplete="off"
                className="font-mono"
              />

              {alreadyInTray && (
                <p className="text-xs leading-relaxed text-ink-mute">
                  {fmtPhoneGrouped(alreadyInTray.phone)} is already in the tray. Logging in again
                  replaces its stored token and keeps its place — no duplicate card.
                </p>
              )}

              {mode === "otp"
                ? otpSent && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="mb-2 flex items-center justify-between font-mono text-eyebrow font-semibold uppercase text-ink-mute">
                        <span>Code from SMS</span>
                        {cooldown > 0 && <span className="text-ink-faint">resend in {cooldown}s</span>}
                      </div>

                      <div className="mt-1">
                        <OtpInput value={otp} onChange={(v) => { setOtp(v); setOtpError(false); }} autoFocus error={otpError} onSubmit={canSubmit && !busy ? doLogin : undefined} />
                      </div>

                      {flow === "register" && (
                        <p className="mt-3 text-xs leading-relaxed text-ink-mute">
                          This number has no MyID account. Entering the code opens one and logs it
                          in — no need to visit the MyID app first.
                        </p>
                      )}
                    </div>
                  )
                : (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <Input
                        label="MyID password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && phone && canSubmit && !busy) {
                            doLogin();
                          }
                        }}
                        autoComplete="current-password"
                      />
                    </div>
                  )}
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:space-x-0">
            <Button variant="ghost" onClick={() => setLoginOpen(false)} disabled={busy} className="sm:mr-auto">
              Cancel
            </Button>
            {mode === "otp" && otpSent && (
              <Button variant="outline" onClick={requestOtp} disabled={busy || cooldown > 0}>
                {cooldown > 0 ? `Resend (${cooldown}s)` : "Resend"}
              </Button>
            )}
            {mode === "otp" && !otpSent ? (
              <Button onClick={requestOtp} loading={busy} disabled={!phone}>
                Send code
              </Button>
            ) : (
              <Button onClick={doLogin} loading={busy} disabled={!phone || !canSubmit}>
                {mode === "otp" && flow === "register" ? "Open account" : "Log in"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <Dialog open={!!pendingRemove} onOpenChange={(o) => !o && setPendingRemove(null)}>
        <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Remove {pendingRemove && fmtPhoneGrouped(pendingRemove.phone)}?</DialogTitle>
            <DialogDescription>
              This drops the SIM and its stored tokens from the tray. Transfers it already made stay
              in the history, and you can log it back in any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingRemove(null)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="destructive" loading={deleting} onClick={confirmRemove}>
              Remove SIM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Remove */}
      <Dialog open={pendingBulkRemove} onOpenChange={setPendingBulkRemove}>
        <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Remove {selectedSims.length} SIMs?</DialogTitle>
            <DialogDescription>
              This drops the selected SIMs and their stored tokens from the tray. Transfers they already made stay
              in the history, and you can log them back in any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingBulkRemove(false)} disabled={deleting}>
              Keep them
            </Button>
            <Button variant="destructive" loading={deleting} onClick={confirmBulkRemove}>
              Remove SIMs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Action Bar for Bulk Select */}
      {selectionMode && selectedSims.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full bg-card p-2 pr-4 shadow-2xl border border-hairline animate-rise-in">
          <div className="flex h-10 items-center rounded-full bg-substrate px-4 font-mono text-sm font-semibold">
            {selectedSims.length} selected
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setPendingBulkRemove(true)}
            className="rounded-full"
          >
            Remove
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectionMode(false);
              setSelectedSims([]);
            }}
            className="rounded-full"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
