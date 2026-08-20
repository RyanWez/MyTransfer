"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Check, Search, SquareStack, X } from "lucide-react";
import { Eyebrow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { OtpInput } from "@/components/ui/OtpInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimChip } from "@/components/SimCard";
import { Stepper } from "@/components/Stepper";
import { Receipt, ReceiptRow, ReceiptDivider } from "@/components/Receipt";
import { fmtKs, fmtPhoneGrouped, fmtStamp } from "@/lib/format";
import { fetchSims, invalidateCache } from "@/lib/api";
import type { Sim } from "@/lib/types";

const QUICK = [500, 800, 1000, 5000];
const RESEND_COOLDOWN = 60;
const STEPS = ["Sender", "OTP", "Confirm"];

interface Snapshot {
  sender: string;
  receiver: string;
  amount: number;
  fee: number;
  id: number | null;
  at: number;
}

export default function TransferPage() {
  const [sims, setSims] = useState<Sim[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sender, setSender] = useState("");
  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [otp, setOtp] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [stage, setStage] = useState<"form" | "otp" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Snapshot | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  const loadSims = useCallback(() => {
    return fetchSims()
      .then((all) => {
        setSims(all);
        setSender((cur) => {
          if (cur && all.some((s) => s.phone === cur && s.status === "active")) return cur;
          return all.find((s) => s.status === "active")?.phone ?? "";
        });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    loadSims();
  }, [loadSims]);

  // Resend cooldown — an OTP request costs an SMS, so don't invite double-taps.
  useEffect(() => {
    if (!resendAt) return;
    const tick = () => setCooldown(Math.max(0, resendAt - Math.floor(Date.now() / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [resendAt]);

  const selected = sims.find((s) => s.phone === sender);
  const senderBalance = selected?.balance ?? null;
  const activeSims = sims.filter((s) => s.status === "active");
  // Pickable SIMs first. Unusable ones still render — so it's clear why a SIM is
  // missing — but they belong after the choices, not above them.
  const orderedSims = useMemo(
    () => [...activeSims, ...sims.filter((s) => s.status !== "active")],
    [sims, activeSims]
  );

  const displayedSims = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().replace(/[\s-+]/g, "");
      return orderedSims.filter((s) => {
        const phoneClean = s.phone.toLowerCase().replace(/[\s-+]/g, "");
        const noteMatch = s.note ? s.note.toLowerCase().includes(searchQuery.toLowerCase()) : false;
        return phoneClean.includes(q) || noteMatch;
      });
    }

    // Default: Show up to 6 SIMs
    const top6 = orderedSims.slice(0, 6);
    if (sender && !top6.some((s) => s.phone === sender)) {
      const currentSelected = orderedSims.find((s) => s.phone === sender);
      if (currentSelected) {
        return [currentSelected, ...top6.slice(0, 5)];
      }
    }
    return top6;
  }, [orderedSims, searchQuery, sender]);
  const amt = Number(amount);
  const fee = Number.isFinite(amt) ? Math.round(amt * 0.05) : 0;
  const total = amt + fee;
  const amountValid = Number.isFinite(amt) && amt >= 500 && amt <= 5000;
  const receiverValid = receiver.replace(/\D/g, "").length >= 9;
  const short = amountValid && senderBalance !== null && total > senderBalance;

  function failToast(r: { needsLogin?: boolean; error?: string; message?: string }, fallback: string) {
    if (r.needsLogin) {
      toast.error("Token expired", {
        description: `Log in ${fmtPhoneGrouped(sender)} again, then retry.`,
        action: { label: "SIM tray", onClick: () => window.location.assign("/sims") },
      });
      return;
    }
    toast.error(fallback, { description: r.error || r.message || undefined });
  }

  async function sendOtp() {
    if (!sender || !receiverValid || !amountValid) return;
    setBusy(true);
    try {
      const r = await fetch("/api/transfer/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: sender }),
      }).then((r) => r.json());
      if (r.ok) {
        setStage("otp");
        setResendAt(Math.floor(Date.now() / 1000) + RESEND_COOLDOWN);
        toast.success("OTP sent", {
          description: `Read the 6-digit code off ${fmtPhoneGrouped(sender)}.`,
        });
      } else {
        failToast(r, "Couldn't send the OTP");
      }
    } catch {
      toast.error("Network error", { description: "The console couldn't reach Mytel. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function confirmTransfer() {
    if (otp.length !== 6) return;
    setBusy(true);
    try {
      const r = await fetch("/api/transfer/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: sender, receiver, amount: amt, otp }),
      }).then((r) => r.json());
      if (r.ok) {
        setReceipt({
          sender,
          receiver,
          amount: amt,
          fee,
          id: r.transferId ?? null,
          at: Math.floor(Date.now() / 1000),
        });
        setStage("done");
        toast.success("Transfer sent", {
          description: `${fmtKs(amt)} to ${fmtPhoneGrouped(receiver)}.`,
        });
        invalidateCache();
        loadSims();
      } else {
        failToast(r, "Transfer failed");
      }
    } catch {
      toast.error("Network error", { description: "The console couldn't reach Mytel. Try again." });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("form");
    setOtp("");
    setAmount("");
    setReceiver("");
    setReceipt(null);
    setResendAt(0);
    setCooldown(0);
    setSearchQuery("");
  }

  if (loaded && activeSims.length === 0 && stage === "form") {
    return (
      <EmptyState
        icon={<SquareStack className="h-7 w-7" strokeWidth={1.25} />}
        title="No SIM is logged in"
        body="A transfer needs a logged-in sender SIM — its OTP is what authorises the debit."
        action={
          <Button asChild>
            <Link href="/sims">
              Log in a SIM
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </Link>
          </Button>
        }
      />
    );
  }

  if (stage === "done" && receipt) {
    return (
      <div className="max-w-md mx-auto animate-rise-in">
        <Panel contentClassName="p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-signal">
              <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden="true" />
            </span>
            <Eyebrow className="text-ink">Transfer sent</Eyebrow>
          </div>

          <div className="mt-4">
            <Receipt>
              <ReceiptRow label="From" value={fmtPhoneGrouped(receipt.sender)} />
              <ReceiptRow label="To" value={fmtPhoneGrouped(receipt.receiver)} />
              <ReceiptDivider />
              <ReceiptRow label="Amount" value={fmtKs(receipt.amount)} />
              <ReceiptRow label="Fee (5%)" value={fmtKs(receipt.fee)} />
              <ReceiptDivider />
              <ReceiptRow label="Total debit" value={fmtKs(receipt.amount + receipt.fee)} emphasis />
            </Receipt>
          </div>

          <div className="mt-3 font-mono text-eyebrow uppercase tnum text-ink-faint">
            {fmtStamp(receipt.at)}
            {receipt.id !== null && ` · #${receipt.id}`}
          </div>
        </Panel>

        <div className="mt-5 flex gap-3">
          <Button onClick={reset}>New transfer</Button>
          <Button asChild variant="ghost">
            <Link href="/history">View history</Link>
          </Button>
        </div>
      </div>
    );
  }

  const locked = stage === "otp";

  return (
    <div className="max-w-4xl mx-auto space-y-7">
      <Stepper steps={STEPS} current={stage === "otp" ? 1 : 0} className="max-w-sm" />

      {/* Sender */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Eyebrow>From</Eyebrow>
            {sims.length > 6 && !searchQuery.trim() && (
              <span className="font-mono text-eyebrow uppercase text-ink-faint">
                ({Math.min(6, displayedSims.length)} of {sims.length})
              </span>
            )}
          </div>
          <div className="relative w-44 sm:w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={locked}
              placeholder="Search sender SIM..."
              className="h-8 w-full rounded border border-hairline bg-card pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint transition-colors focus:border-hairline-strong focus:outline-none focus:ring-1 focus:ring-ink disabled:opacity-50"
            />
            {searchQuery && !locked && (
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
        </div>

        <div className="mt-2.5">
          {displayedSims.length === 0 ? (
            <div className="w-full rounded border border-hairline bg-card p-6 text-center">
              <p className="text-xs text-ink-mute">
                No SIM found matching &quot;{searchQuery}&quot;
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-1 font-mono text-xs text-brass-deep underline hover:text-ink"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {displayedSims.map((s) => (
                <SimChip
                  key={s.phone}
                  sim={s}
                  selected={s.phone === sender}
                  onSelect={(sim) => !locked && setSender(sim.phone)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Receiver + amount */}
      <section className="grid gap-5 sm:grid-cols-2">
        <Input
          label="To"
          value={receiver}
          onChange={(e) => setReceiver(e.target.value.replace(/[^\d+]/g, ""))}
          disabled={locked}
          placeholder="09XXXXXXXXX"
          inputMode="numeric"
          autoComplete="off"
          className="font-mono"
          helperText="Any Mytel number, including one not in the tray."
        />
        <div>
          <Input
            label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            disabled={locked}
            placeholder="500 – 5,000"
            inputMode="numeric"
            suffix="Ks"
            className="font-mono text-base tnum"
            error={amount !== "" && !amountValid ? "Enter between 500 and 5,000 Ks." : undefined}
          />
          <div className="mt-2 flex gap-2">
            {QUICK.map((q) => (
              <Button
                key={q}
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() => setAmount(String(q))}
                className="flex-1 font-mono tnum"
              >
                {q.toLocaleString()}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Money */}
      {amountValid && (
        <section className="max-w-sm">
          <Receipt>
            <ReceiptRow label="Amount" value={fmtKs(amt)} />
            <ReceiptRow label="Fee (5%)" value={fmtKs(fee)} />
            <ReceiptDivider />
            <ReceiptRow label="Total debit" value={fmtKs(total)} emphasis />
            {selected && senderBalance !== null && (
              <ReceiptRow
                label={`${fmtPhoneGrouped(selected.phone)} after`}
                value={fmtKs(senderBalance - total)}
                muted
              />
            )}
          </Receipt>
          {short && (
            <p className="mt-2 text-xs text-alert-deep">
              That's more than the last balance read for {fmtPhoneGrouped(sender)}. Read the balance
              again from the SIM tray, or send less.
            </p>
          )}
        </section>
      )}

      {/* OTP */}
      {locked && (
        <section className="animate-rise-in border-t border-hairline pt-6">
          <Eyebrow>Enter OTP</Eyebrow>
          <p className="mt-1.5 text-sm text-ink-mute">
            Sent by SMS to {fmtPhoneGrouped(sender)}
            {cooldown > 0 && (
              <span className="font-mono tnum text-ink-faint"> · resend in {cooldown}s</span>
            )}
          </p>
          <div className="mt-3.5">
            <OtpInput value={otp} onChange={setOtp} autoFocus />
          </div>
        </section>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 border-t border-hairline pt-6">
        {stage === "form" ? (
          <Button
            size="lg"
            loading={busy}
            disabled={!sender || !receiverValid || !amountValid}
            onClick={sendOtp}
          >
            {sender ? `Send OTP to ${fmtPhoneGrouped(sender)}` : "Send OTP"}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </Button>
        ) : (
          <>
            <Button
              variant="brass"
              size="lg"
              loading={busy}
              disabled={otp.length !== 6}
              onClick={confirmTransfer}
            >
              Confirm {fmtKs(total)} debit
            </Button>
            <Button variant="outline" size="lg" disabled={busy || cooldown > 0} onClick={sendOtp}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
            </Button>
            <Button variant="ghost" size="lg" disabled={busy} onClick={reset}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
