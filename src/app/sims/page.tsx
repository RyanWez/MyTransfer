"use client";

import { useEffect, useState } from "react";
import { fmtKs, fmtPhone, fmtTime, statusBadge } from "@/lib/format";

interface Sim {
  id: number;
  phone: string;
  balance: number | null;
  balance_checked_at: number | null;
  status: string;
  subscription_id: string | null;
  updated_at: number;
}

type LoginMode = "otp" | "password";

export default function SimsPage() {
  const [sims, setSims] = useState<Sim[]>([]);
  const [showLogin, setShowLogin] = useState(false);

  // login form state
  const [mode, setMode] = useState<LoginMode>("otp");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [refreshing, setRefreshing] = useState<string | null>(null);

  const load = () =>
    fetch("/api/sims")
      .then((r) => r.json())
      .then((d) => setSims(d.sims))
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  async function requestOtp() {
    if (!phone) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      }).then((r) => r.json());
      if (r.ok) {
        setOtpSent(true);
        setMsg({ ok: true, text: "OTP sent to the SIM. Read it from the phone." });
      } else {
        setMsg({ ok: false, text: r.message || "Failed to request OTP" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  async function doLogin() {
    setBusy(true);
    setMsg(null);
    try {
      const url = mode === "otp" ? "/api/auth/verify-otp" : "/api/auth/login-password";
      const body =
        mode === "otp" ? { phone, otp } : { phone, password };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (r.ok) {
        setMsg({
          ok: true,
          text: `Logged in ✅ Balance: ${r.balance !== null && r.balance !== undefined ? fmtKs(r.balance) : "unknown"}`,
        });
        resetForm();
        load();
      } else {
        setMsg({ ok: false, text: r.message || r.error || "Login failed" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setPhone("");
    setOtp("");
    setPassword("");
    setOtpSent(false);
    setShowLogin(false);
  }

  async function refreshBalance(p: string) {
    setRefreshing(p);
    try {
      const r = await fetch("/api/sims/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      }).then((r) => r.json());
      if (!r.ok && r.needsLogin) {
        setMsg({ ok: false, text: `${fmtPhone(p)}: token expired — please re-login` });
      }
      load();
    } finally {
      setRefreshing(null);
    }
  }

  async function removeSim(p: string) {
    if (!confirm(`Remove ${fmtPhone(p)}?`)) return;
    await fetch("/api/sims", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: p }),
    });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">SIMs</h1>
          <p className="text-sm text-slate-500">Log in and manage your Mytel SIMs</p>
        </div>
        <button
          onClick={() => setShowLogin((v) => !v)}
          className="px-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800"
        >
          {showLogin ? "Close" : "+ Login SIM"}
        </button>
      </div>

      {msg && !showLogin && (
        <div className="mb-4 text-sm rounded-lg px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200">
          {msg.text}
        </div>
      )}

      {/* Login panel */}
      {showLogin && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-6 max-w-md">
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => { setMode("otp"); setOtpSent(false); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                mode === "otp" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              OTP login
            </button>
            <button
              onClick={() => { setMode("password"); setOtpSent(false); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                mode === "password" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              Password
            </button>
          </div>

          <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xxxxxxxxx"
            disabled={mode === "otp" && otpSent}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
          />

          {mode === "otp" ? (
            otpSent ? (
              <>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  OTP from SMS (6 digits)
                </label>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  inputMode="numeric"
                  autoFocus
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-xl tracking-[0.4em] font-mono mb-4 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </>
            ) : null
          ) : (
            <>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">MyID password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </>
          )}

          {msg && (
            <div
              className={`text-sm rounded-lg px-4 py-3 mb-4 ${
                msg.ok
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}
            >
              {msg.text}
            </div>
          )}

          <div className="flex gap-3">
            {mode === "otp" && !otpSent ? (
              <button
                onClick={requestOtp}
                disabled={busy || !phone}
                className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-40"
              >
                {busy ? "Sending…" : "Continue → send OTP"}
              </button>
            ) : (
              <button
                onClick={doLogin}
                disabled={busy || !phone || (mode === "otp" ? otp.length !== 6 : !password)}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40"
              >
                {busy ? "Logging in…" : "Login"}
              </button>
            )}
            {mode === "otp" && otpSent && (
              <button
                onClick={requestOtp}
                disabled={busy}
                className="px-4 py-2.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                Resend
              </button>
            )}
            <button
              onClick={resetForm}
              className="px-4 py-2.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* SIM table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Balance</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Checked</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sims.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  No SIMs yet. Click “+ Login SIM” to add your first one.
                </td>
              </tr>
            )}
            {sims.map((s) => {
              const badge = statusBadge(s.status);
              return (
                <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-medium text-slate-800">
                    {fmtPhone(s.phone)}
                  </td>
                  <td className="px-4 py-3">{fmtKs(s.balance)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {s.balance_checked_at ? fmtTime(s.balance_checked_at) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => refreshBalance(s.phone)}
                      disabled={refreshing === s.phone || s.status !== "active"}
                      className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 mr-2"
                    >
                      {refreshing === s.phone ? "…" : "Refresh"}
                    </button>
                    <button
                      onClick={() => removeSim(s.phone)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
