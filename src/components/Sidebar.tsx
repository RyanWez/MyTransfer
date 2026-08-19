"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/transfer", label: "Transfer", icon: "💸" },
  { href: "/sims", label: "SIMs", icon: "📇" },
  { href: "/history", label: "History", icon: "📜" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 bg-slate-900 text-slate-100 flex flex-col">
      <div className="px-5 py-6 border-b border-slate-700">
        <div className="text-lg font-bold tracking-tight">MyShare</div>
        <div className="text-xs text-slate-400 mt-1">Mytel Transfer Dashboard</div>
      </div>
      <nav className="flex-1 py-4">
        {items.map((it) => {
          const active =
            it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                active
                  ? "bg-slate-700 text-white font-semibold"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span>{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 text-[11px] text-slate-500 border-t border-slate-700">
        v0.1 · reverse-engineered APIs
      </div>
    </aside>
  );
}
