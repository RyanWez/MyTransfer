"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { BatteryLow, Cpu, Plus, Search, SquareStack, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OtpInput } from "@/components/ui/OtpInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner, ErrorState } from "@/components/ui/ErrorState";
import { Pagination } from "@/components/ui/Pagination";
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
import { fmtAmount, fmtKs, fmtPhoneGrouped, sameNumber } from "@/lib/format";
import { fetchSims, invalidateCache, ApiError } from "@/lib/api";
import { LOW_BALANCE_THRESHOLD } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useLive } from "@/lib/liveEvents";
import { useSessionState } from "@/lib/useSessionState";
import { CooldownSeconds, useCooldownActive } from "@/components/Cooldown";
import type { Sim } from "@/lib/types";

type LoginMode = "otp" | "password";
/** Which endpoint pair the SMS code belongs to — see /api/auth/request-otp. */
type Flow = "login" | "register";

/** Which slice of the tray is on screen. */
type View = "all" | "active" | "inactive" | "drained";
type SortKey = "recent" | "balance-asc" | "balance-desc";

/**
 * Cards per page. A multiple of 2, 3 and 4 so the last row of the responsive
 * grid is never left ragged at any breakpoint.
 */
const PAGE_SIZE = 24;

/**
 * Pre-built stagger styles. The entrance animation needs a per-position delay,
 * but a fresh `{ animationDelay }` literal per render would defeat SimCard's
 * memoisation — these are shared, so a card's props only change when its data
 * or selection does. Positions past the eighth reuse the last delay.
 */
const STAGGER: CSSProperties[] = Array.from({ length: 9 }, (_, i) => ({
  animationDelay: `${i * 40}ms`,
}));

/** A SIM that can't fund a transfer worth sending. Unread balances don't count. */
function isDrained(sim: Sim): boolean {
  return sim.balance !== null && sim.balance < LOW_BALANCE_THRESHOLD;
}

export default function SimsPage() {
  const [sims, setSims] = useState<Sim[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<View>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSims, setSelectedSims] = useState<string[]>([]);
  /** Membership test for the cards on screen, without rescanning the array. */
  const selectedSet = useMemo(() => new Set(selectedSims), [selectedSims]);
  /** Paging jumps back here rather than leaving the operator mid-grid. */
  const trayTopRef = useRef<HTMLDivElement>(null);

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
  // Only the boolean lives here; the ticking digit is a leaf inside the dialog, so
  // the tray isn't re-rendered once a second for the length of every cooldown.
  const cooldownActive = useCooldownActive(loginResendAt);

  const [pendingRemove, setPendingRemove] = useState<Sim | null>(null);
  const [pendingBulkRemove, setPendingBulkRemove] = useState(false);
  // The destructive buttons spin until the server confirms — the dialogs stay
  // open through the request so a slow link never looks like nothing happened.
  const [deleting, setDeleting] = useState(false);
  // Focused when the login dialog opens, so a number can be typed immediately.
  const phoneInputRef = useRef<HTMLInputElement>(null);

  /**
   * `background` keeps the rendered cards in place and swaps the data underneath.
   * Only the first load may fall back to skeletons — a balance read or a removal
   * replacing the whole tray with six placeholders reads as the tray emptying.
   */
  const load = useCallback(
    (background = false) => {
      if (!background) setLoaded(false);
      const opts = background ? { bypassCache: true, noDelay: true } : undefined;
      fetchSims(opts)
        .then((all) => {
          setSims(all);
          setError(null);
        })
        .catch((err) => {
          setError(err instanceof ApiError ? err.userMessage : "Something went wrong reading this.");
        })
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
    load(true);
  });

  /** One pass for every headline figure the toolbar shows. */
  const counts = useMemo(() => {
    let active = 0;
    let drained = 0;
    for (const s of sims) {
      if (s.status === "active") active += 1;
      if (isDrained(s)) drained += 1;
    }
    return { active, inactive: sims.length - active, drained };
  }, [sims]);

  /** View filter, then search, then sort — the full matching set, unpaged. */
  const visibleSims = useMemo(() => {
    let rows = sims;

    if (view === "active") rows = rows.filter((s) => s.status === "active");
    else if (view === "inactive") rows = rows.filter((s) => s.status !== "active");
    else if (view === "drained") rows = rows.filter(isDrained);

    const raw = searchQuery.trim();
    if (raw) {
      const q = raw.toLowerCase().replace(/[\s-+]/g, "");
      const noteQ = raw.toLowerCase();
      rows = rows.filter((s) => {
        const phoneClean = s.phone.toLowerCase().replace(/[\s-+]/g, "");
        return phoneClean.includes(q) || (s.note ? s.note.toLowerCase().includes(noteQ) : false);
      });
    }

    if (sortBy !== "recent") {
      const dir = sortBy === "balance-asc" ? 1 : -1;
      // A SIM whose balance was never read isn't "0 Ks" — it sorts last either
      // way, so an unread card can't masquerade as the emptiest in the tray.
      rows = [...rows].sort((a, b) => {
        if (a.balance === null) return b.balance === null ? 0 : 1;
        if (b.balance === null) return -1;
        return (a.balance - b.balance) * dir;
      });
    }

    return rows;
  }, [sims, view, searchQuery, sortBy]);

  const pageCount = Math.max(1, Math.ceil(visibleSims.length / PAGE_SIZE));
  // Derived rather than corrected in an effect: removing the last card on a page
  // must not leave the grid blank for a render while a setState catches up.
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pageRows = useMemo(
    () => visibleSims.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visibleSims, currentPage]
  );

  // Narrowing the set always lands on its first page.
  useEffect(() => {
    setPage(1);
  }, [view, searchQuery, sortBy]);

  const goToPage = useCallback((next: number) => {
    setPage(next);
    trayTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const allVisibleSelected =
    visibleSims.length > 0 && visibleSims.every((s) => selectedSet.has(s.phone));

  // Stable identity: SimCard is memoised, so a fresh closure per render would
  // re-render every card on screen whenever the page's own state moved.
  const openLogin = useCallback(
    (prefill?: string) => {
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
    },
    [setPhone, setOtp, setPassword, setOtpSent, setMode, setFlow, setReqId, setRegSubId, setLoginOpen]
  );

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
        load(true);
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

  const refreshBalance = useCallback(
    async (sim: Sim) => {
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
        load(true);
      } catch {
        toast.error("Network error", { description: "The console couldn't reach Mytel. Try again." });
      } finally {
        setRefreshing(null);
      }
    },
    [load, openLogin]
  );

  const toggleSelection = useCallback((sim: Sim) => {
    setSelectedSims((prev) =>
      prev.includes(sim.phone) ? prev.filter((p) => p !== sim.phone) : [...prev, sim.phone]
    );
  }, []);

  const requestRemove = useCallback((sim: Sim) => setPendingRemove(sim), []);

  const loginAgain = useCallback((sim: Sim) => openLogin(sim.phone), [openLogin]);

  /**
   * Select or clear the whole matching set, not just the page on screen — the
   * point of the Drained view is removing all of them in one pass.
   */
  const toggleSelectAllVisible = useCallback(() => {
    setSelectedSims((prev) => {
      const visible = visibleSims.map((s) => s.phone);
      const allIn = visible.length > 0 && visible.every((p) => prev.includes(p));
      if (allIn) {
        const drop = new Set(visible);
        return prev.filter((p) => !drop.has(p));
      }
      return [...new Set([...prev, ...visible])];
    });
  }, [visibleSims]);

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
      load(true);
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
      // The server reports rows it actually deleted — a phone already gone from
      // another tab shouldn't be counted as removed here.
      const body = await res.json().catch(() => ({}));
      const removed = typeof body.removed === "number" ? body.removed : phones.length;
      toast.success(`${fmtAmount(removed)} ${removed === 1 ? "SIM" : "SIMs"} removed`, {
        description: "Their transfer histories stay in the log.",
      });
      setSelectedSims([]);
      setSelectionMode(false);
      setPendingBulkRemove(false);
      invalidateCache();
      load(true);
    } catch {
      toast.error("Couldn't remove the SIMs", { description: "Network error — try again." });
    } finally {
      setDeleting(false);
    }
  }

  /**
   * What a bulk removal would actually discard. Selection survives paging and
   * filter changes, so the dialog can't just say "these ones" — it has to
   * account for balance the operator may not have on screen.
   */
  const selectedSummary = useMemo(() => {
    let count = 0;
    let balance = 0;
    let unread = 0;
    let funded = 0;
    for (const s of sims) {
      if (!selectedSet.has(s.phone)) continue;
      count += 1;
      if (s.balance === null) unread += 1;
      else {
        balance += s.balance;
        if (s.balance >= LOW_BALANCE_THRESHOLD) funded += 1;
      }
    }
    return { count, balance, unread, funded };
  }, [sims, selectedSet]);

  const canSubmit = mode === "otp" ? otp.length === 6 : password.length > 0;
  /** A number already in the tray is a token refresh, not a second card. */
  const alreadyInTray = phone ? sims.find((s) => sameNumber(s.phone, phone)) : undefined;

  /**
   * Why the grid came back empty. A search that found nothing, an empty Drained
   * view and an empty Logged-out view are three different situations, and the
   * generic "no matching SIMs" made the good news (nothing is drained) read like
   * a failure.
   */
  const emptyView = searchQuery.trim()
    ? {
        title: "No matching SIMs",
        body: `Nothing in ${view === "all" ? "the tray" : "this view"} matches "${searchQuery}". Try a different number or note.`,
      }
    : view === "drained"
      ? {
          title: "Nothing is drained",
          body: `Every SIM with a balance reading is holding at least ${fmtAmount(LOW_BALANCE_THRESHOLD)} Ks.`,
        }
      : view === "inactive"
        ? {
            title: "Every SIM is logged in",
            body: "No token has expired, so nothing needs a fresh SMS code right now.",
          }
        : {
            title: "No active SIMs",
            body: "Every SIM in the tray needs logging in again before it can send.",
          };

  return (
    <div
      className={cn(
        "max-w-6xl mx-auto space-y-5",
        // The floating action bar is fixed to the viewport bottom; without this
        // it sits on top of the last row of cards instead of below them.
        selectionMode && selectedSims.length > 0 && "pb-24"
      )}
    >
      <div ref={trayTopRef} className="space-y-3 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-eyebrow font-semibold uppercase tnum text-ink-mute">
            {visibleSims.length === sims.length ? (
              <>
                {fmtAmount(sims.length)} {sims.length === 1 ? "SIM" : "SIMs"} ·{" "}
                {fmtAmount(counts.active)} active
              </>
            ) : (
              <>
                {fmtAmount(visibleSims.length)} of {fmtAmount(sims.length)}{" "}
                {sims.length === 1 ? "SIM" : "SIMs"}
              </>
            )}
            {/* The one figure worth surfacing unprompted: SIMs that can no longer
                fund a transfer. Doubles as the way into the view that clears them. */}
            {counts.drained > 0 && view !== "drained" && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setView("drained")}
                  className="inline-flex items-center gap-1 text-alert-deep underline decoration-dotted underline-offset-2 transition-colors hover:text-alert"
                >
                  <BatteryLow className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  {fmtAmount(counts.drained)} under {fmtAmount(LOW_BALANCE_THRESHOLD)} Ks
                </button>
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

        {/* Second row appears only once there's a tray to slice up. Narrow screens
            scroll the tabs sideways rather than squeezing four labels to nothing. */}
        {sims.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="-mb-px max-w-full overflow-x-auto pb-px">
              <SegmentedControl<View>
                aria-label="Filter the tray"
                value={view}
                onValueChange={setView}
                options={[
                  { value: "all", label: `All ${fmtAmount(sims.length)}` },
                  { value: "active", label: `Active ${fmtAmount(counts.active)}` },
                  { value: "inactive", label: `Needs login ${fmtAmount(counts.inactive)}` },
                  { value: "drained", label: `Drained ${fmtAmount(counts.drained)}` },
                ]}
              />
            </div>

            <div className="flex items-center gap-2">
              {selectionMode && visibleSims.length > 0 && (
                <Button variant="ghost" size="sm" onClick={toggleSelectAllVisible}>
                  {allVisibleSelected
                    ? `Clear ${fmtAmount(visibleSims.length)}`
                    : `Select all ${fmtAmount(visibleSims.length)}`}
                </Button>
              )}
              <label className="flex items-center gap-2">
                <span className="font-mono text-eyebrow font-semibold uppercase text-ink-mute">
                  Sort
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="h-8 rounded border border-hairline bg-card px-2 text-xs text-ink transition-colors focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
                >
                  <option value="recent">Last updated</option>
                  <option value="balance-asc">Balance: low to high</option>
                  <option value="balance-desc">Balance: high to low</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* A refresh that failed with cards already on screen keeps them and says so. */}
      {error && sims.length > 0 && (
        <ErrorBanner
          what="the SIM tray"
          detail={error}
          onRetry={() => load(true)}
          retrying={!loaded}
        />
      )}

      {!loaded ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SimCardSkeleton key={i} />
          ))}
        </div>
      ) : error && sims.length === 0 ? (
        // Distinguish "no SIMs" from "couldn't read the SIMs" — the empty-tray
        // illustration below made a failed read look like the tray was wiped.
        <ErrorState
          what="the SIM tray"
          detail={error}
          onRetry={() => load(true)}
          retrying={!loaded}
        />
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
      ) : loaded && visibleSims.length === 0 ? (
        <EmptyState
          icon={
            <div className="relative w-24 h-24 flex items-center justify-center">
              <div className="absolute inset-0 bg-substrate rounded-full opacity-50 blur-lg" />
              <div className="relative w-16 h-16 bg-card border border-hairline rounded-full flex items-center justify-center shadow-inner">
                {view === "drained" && !searchQuery.trim() ? (
                  <BatteryLow className="h-7 w-7 text-ink-mute" strokeWidth={1.5} />
                ) : (
                  <Search className="h-7 w-7 text-ink-mute animate-pulse" strokeWidth={1.5} />
                )}
              </div>
            </div>
          }
          title={emptyView.title}
          body={emptyView.body}
          action={
            searchQuery.trim() ? (
              <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            ) : view !== "all" ? (
              <Button variant="outline" size="sm" onClick={() => setView("all")}>
                Show the whole tray
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pageRows.map((s, i) => (
              <SimCard
                key={s.id}
                sim={s}
                refreshing={refreshing === s.phone}
                onRefresh={refreshBalance}
                onRemove={requestRemove}
                onLogin={loginAgain}
                selectionMode={selectionMode}
                selected={selectedSet.has(s.phone)}
                onSelectToggle={toggleSelection}
                className="animate-rise-in"
                style={STAGGER[Math.min(i, STAGGER.length - 1)]}
              />
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            pageCount={pageCount}
            pageSize={PAGE_SIZE}
            totalItems={visibleSims.length}
            onPageChange={goToPage}
            noun={["SIM", "SIMs"]}
          />
        </>
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
                        {cooldownActive && (
                          <span className="text-ink-faint">
                            resend in <CooldownSeconds at={loginResendAt} />s
                          </span>
                        )}
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
              <Button variant="outline" onClick={requestOtp} disabled={busy || cooldownActive}>
                {cooldownActive ? (
                  <>
                    Resend (<CooldownSeconds at={loginResendAt} />s)
                  </>
                ) : (
                  "Resend"
                )}
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
            <DialogTitle>Remove {fmtAmount(selectedSummary.count)} SIMs?</DialogTitle>
            <DialogDescription>
              This drops the selected SIMs and their stored tokens from the tray. Transfers they already made stay
              in the history, and you can log them back in any time.
            </DialogDescription>
          </DialogHeader>

          {/* Selection outlives paging and filters, so spell out what's in it —
              the balance being dropped is the part that can't be undone by a
              re-login, and it may be sitting on a page that isn't on screen. */}
          <div className="mt-1 space-y-2 rounded border border-hairline bg-substrate p-3 font-mono text-xs tnum text-ink-mute">
            <div className="flex items-center justify-between gap-4">
              <span className="uppercase text-ink-faint">Balance in these SIMs</span>
              <span className={selectedSummary.balance > 0 ? "text-brass-deep" : undefined}>
                {fmtKs(selectedSummary.balance)}
              </span>
            </div>
            {selectedSummary.funded > 0 && (
              <p className="leading-relaxed text-alert-deep">
                {fmtAmount(selectedSummary.funded)} of them still hold{" "}
                {fmtAmount(LOW_BALANCE_THRESHOLD)} Ks or more.
              </p>
            )}
            {selectedSummary.unread > 0 && (
              <p className="leading-relaxed">
                {fmtAmount(selectedSummary.unread)} have never had a balance read, so their real
                balance is unknown.
              </p>
            )}
          </div>

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

      {/* Floating Action Bar for Bulk Select — the wrapper owns the centering
          translate; the entrance animation fills with its own transform and
          would otherwise wipe the -translate-x-1/2 once it settles. */}
      {selectionMode && selectedSims.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2">
          <div className="flex animate-rise-in items-center gap-2 rounded-full border border-hairline bg-card p-2 pr-2 shadow-2xl sm:gap-4 sm:pr-4">
            <div className="flex h-10 items-center rounded-full bg-substrate px-3 font-mono text-sm font-semibold tnum sm:px-4">
              {fmtAmount(selectedSims.length)} selected
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
        </div>
      )}
    </div>
  );
}
