"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, Send, SquareStack, ScrollText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/ui/StatusDot";
import type { Stats } from "@/lib/types";

const items = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/transfer", label: "Transfer", icon: Send },
  { href: "/sims", label: "SIM tray", icon: SquareStack },
  { href: "/history", label: "History", icon: ScrollText },
];

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [fleet, setFleet] = React.useState<{ total: number; active: number } | null>(null);

  // Refetch per navigation so the footer count reflects a login that just happened.
  React.useEffect(() => {
    let alive = true;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d: { ok?: boolean; stats?: Stats }) => {
        if (alive && d?.stats) {
          setFleet({ total: d.stats.simCount, active: d.stats.loggedIn });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  return (
    <>
      {/* Mobile scrim */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-ink/40 transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col bg-ink text-substrate transition-transform duration-200 md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-5">
          <div>
            <div className="font-mono text-sm font-semibold uppercase tracking-[0.16em]">
              My<span className="text-brass">Share</span>
            </div>
            <div className="mt-1 text-[11px] text-white/45">Mytel transfer console</div>
          </div>
          <button
            onClick={onClose}
            className="-mr-1 rounded p-1 text-white/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <nav className="flex-1 py-3">
          {items.map((it) => {
            const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 py-2.5 pl-5 pr-4 font-mono text-eyebrow font-semibold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass",
                  active ? "text-substrate" : "text-white/50 hover:text-white/85"
                )}
              >
                {/* 2px brass marker instead of a filled block — the rail stays quiet. */}
                <span
                  className={cn(
                    "absolute inset-y-1 left-0 w-[2px] rounded-r transition-colors",
                    active ? "bg-brass" : "bg-transparent"
                  )}
                  aria-hidden="true"
                />
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <div className="flex items-center gap-2 font-mono text-eyebrow uppercase text-white/60">
            <StatusDot tone={fleet?.active ? "signal" : "muted"} size="sm" />
            {fleet ? (
              <span className="tnum">
                {fleet.active} of {fleet.total} SIMs active
              </span>
            ) : (
              <span className="text-white/35">Reading tray…</span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
