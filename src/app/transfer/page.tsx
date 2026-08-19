"use client";

import { useEffect, useState } from "react";
import { fmtKs, fmtPhone } from "@/lib/format";

interface Sim {
  phone: string;
  balance: number | null;
  status: string;
  subscription_id: string | null;
}

const QUICK = [500, 800, 1000, 5000];

export default function TransferPage() {
  const [sims, setSims] = useState<Sim[]>([]);
  const [sender, setSender] = useState("");
  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [otp, setOtp] = useState("");

  const [stage, setStage] = useState<"form" | "otp" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadSims = () =>
    fetch("/api/sims")
      .then((r) => r.json())
      .then((d) => {
        const active = (d.sims as Sim[]).filter((s) => s.status === "active");
        setSims(active);
        if (active.length && !sender) setSender(active[0].phone);
      })
      .catch(() => {});

  useEffect(() => {
    loadSims();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = sims.find((s) => s.phone === sender);
  const amt = Number(amount);
  const fee = Number.isFinite(amt) ? Math.round(amt * 0.05) : 0;
  const amountValid = Number.isFinite(amt) && amt >= 500 && amt <= 5000;

  async function sendOtp() {
    if (!sender || !receiver || !amountValid) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/transfer/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: sender }),
      }).then((r) => r.json());
      if (r.ok) {
        setStage("otp");
        setMsg({ ok: true, text: "OTP sent to sender SIM. Read it from the phone and enter below." });
      } else {
        setMsg({ ok: false, text: r.error || r.message || "Failed to send OTP" });
      }
    } catch (e) {
      setMsg({ ok: false, text: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!otp) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/transfer/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: sender, receiver, amount: amt, otp }),
      }).then((r) => r.json());
      if (r.ok) {
        setStage("done");
        setMsg({ ok: true, text: r.message || "Transfer successful ✅" });
        loadSims();
      } else {
        setMsg({ ok: false, text: r.error || r.message || "Transfer failed" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("form");
    setOtp("");
    setAmount("");
    setReceiver("");
    setMsg(null);
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Transfer</h1>
      <p className="text-sm text-slate-500 mb-6">Mytel → Mytel balance transfer (MyShare)</p>

      {stage === "done" ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm">
          <div className="text-5xl mb-3">✅</div>
          <div className="text-lg font-semibold text-slate-800">Transfer complete</div>
          <div className="text-sm text-slate-500 mt-1">
            {fmtKs(amt)} → {fmtPhone(receiver)}
          </div>
          {msg && <div className="text-sm text-slate-400 mt-2">{msg.text}</div>}
          <button
            onClick={reset}
            className="mt-6 px-5 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
          >
            New transfer
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
          {/* Sender */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Sender SIM</label>
            <select
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              disabled={stage === "otp"}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
            >
              {sims.length === 0 && <option value="">No active SIMs — log one in first</option>}
              {sims.map((s) => (
                <option key={s.phone} value={s.phone}>
                  {fmtPhone(s.phone)} · {fmtKs(s.balance)}
                </option>
              ))}
            </select>
            {selected && (
              <div className="text-xs text-slate-500 mt-1">
                Available: <span className="font-semibold">{fmtKs(selected.balance)}</span>
              </div>
            )}
          </div>

          {/* Receiver */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Receiver number</label>
            <input
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              disabled={stage === "otp"}
              placeholder="09xxxxxxxxx"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount (Ks)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              disabled={stage === "otp"}
              placeholder="500 – 5000"
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
            />
            <div className="flex gap-2 mt-2">
              {QUICK.map((q) => (
                <button
                  key={q}
                  disabled={stage === "otp"}
                  onClick={() => setAmount(String(q))}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {q.toLocaleString()}
                </button>
              ))}
            </div>
            {amountValid && (
              <div className="text-xs text-slate-500 mt-2">
                Fee (5%): <span className="font-semibold">{fmtKs(fee)}</span> · Total debit:{" "}
                <span className="font-semibold">{fmtKs(amt + fee)}</span>
              </div>
            )}
          </div>

          {/* OTP stage */}
          {stage === "otp" && (
            <div className="border-t border-slate-200 pt-5">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                OTP (6 digits, sent to sender SIM)
              </label>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                inputMode="numeric"
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          )}

          {/* Message */}
          {msg && (
            <div
              className={`text-sm rounded-lg px-4 py-3 ${
                msg.ok
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            {stage === "form" && (
              <button
                onClick={sendOtp}
                disabled={busy || !sender || !receiver || !amountValid}
                className="flex-1 px-5 py-3 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? "Sending…" : "Send → request OTP"}
              </button>
            )}
            {stage === "otp" && (
              <>
                <button
                  onClick={confirm}
                  disabled={busy || otp.length !== 6}
                  className="flex-1 px-5 py-3 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? "Confirming…" : "Confirm transfer"}
                </button>
                <button
                  onClick={sendOtp}
                  disabled={busy}
                  className="px-4 py-3 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-40"
                >
                  Resend
                </button>
                <button
                  onClick={reset}
                  disabled={busy}
                  className="px-4 py-3 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-40"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
