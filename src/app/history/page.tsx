"use client";

import { useEffect, useState } from "react";
import { fmtKs, fmtPhone, fmtTime, statusBadge } from "@/lib/format";

interface Transfer {
  id: number;
  sender_phone: string;
  receiver_phone: string;
  amount: number;
  fee: number;
  status: string;
  error_code: number | null;
  message: string | null;
  created_at: number;
}

export default function HistoryPage() {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => setRows(d.transfers))
      .catch(() => {});
  }, []);

  const shown = rows.filter((r) => filter === "all" || r.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">History</h1>
          <p className="text-sm text-slate-500">All transfer attempts</p>
        </div>
        <div className="flex gap-2">
          {(["all", "success", "failed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
                filter === f
                  ? "bg-slate-900 text-white font-medium"
                  : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Sender</th>
              <th className="px-4 py-3 font-medium">Receiver</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Fee</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No transfers yet.
                </td>
              </tr>
            )}
            {shown.map((t) => {
              const badge = statusBadge(t.status);
              return (
                <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {fmtTime(t.created_at)}
                  </td>
                  <td className="px-4 py-3 font-mono">{fmtPhone(t.sender_phone)}</td>
                  <td className="px-4 py-3 font-mono">{fmtPhone(t.receiver_phone)}</td>
                  <td className="px-4 py-3 font-medium">{fmtKs(t.amount)}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtKs(t.fee)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[220px] truncate">
                    {t.message ?? (t.error_code !== null ? `code ${t.error_code}` : "—")}
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
