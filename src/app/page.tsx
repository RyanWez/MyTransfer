"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtKs } from "@/lib/format";

interface Stats {
  simCount: number;
  loggedIn: number;
  rows: { status: string; cnt: number; total: number }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStats(d.stats))
      .catch(() => {});
  }, []);

  const success = stats?.rows.find((r) => r.status === "success");
  const failed = stats?.rows.find((r) => r.status === "failed");

  const cards = [
    { label: "Total SIMs", value: stats ? String(stats.simCount) : "…", sub: "registered" },
    { label: "Logged in", value: stats ? String(stats.loggedIn) : "…", sub: "active tokens" },
    { label: "Transfers today", value: success ? String(success.cnt) : "0", sub: "successful" },
    { label: "Volume today", value: success ? fmtKs(success.total) : "0 Ks", sub: "transferred" },
    { label: "Failed today", value: failed ? String(failed.cnt) : "0", sub: "errors" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Dashboard</h1>
      <p className="text-sm text-slate-500 mb-6">Today at a glance</p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="text-xs text-slate-500 mb-1">{c.label}</div>
            <div className="text-2xl font-bold text-slate-800">{c.value}</div>
            <div className="text-[11px] text-slate-400 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <Link
          href="/transfer"
          className="bg-slate-900 text-white rounded-xl p-6 hover:bg-slate-800 transition-colors"
        >
          <div className="text-3xl mb-2">💸</div>
          <div className="font-semibold text-lg">Make a transfer</div>
          <div className="text-sm text-slate-300 mt-1">
            Pick a SIM, enter receiver &amp; amount, then confirm with OTP.
          </div>
        </Link>
        <Link
          href="/sims"
          className="bg-white border border-slate-200 rounded-xl p-6 hover:border-slate-300 transition-colors"
        >
          <div className="text-3xl mb-2">📇</div>
          <div className="font-semibold text-lg text-slate-800">Manage SIMs</div>
          <div className="text-sm text-slate-500 mt-1">
            Log in SIMs (OTP or password), check balances, refresh tokens.
          </div>
        </Link>
      </div>

      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>MyShare limits:</strong> 500–5,000 Ks per transfer · 5% fee · max 5
        transfers per SIM per day. OTP is always sent to the <em>sender</em> SIM.
      </div>
    </div>
  );
}
