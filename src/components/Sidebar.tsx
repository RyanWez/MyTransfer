"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, Send, SquareStack, ScrollText, X, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/ui/StatusDot";
import { useLiveStatus, type LiveStatus } from "@/lib/liveEvents";
import type { Stats } from "@/lib/types";

import { fetchStats } from "@/lib/api";

const items = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/transfer", label: "Transfer", icon: Send },
  { href: "/sims", label: "SIM tray", icon: SquareStack },
  { href: "/receivers", label: "Receivers", icon: Users },
  { href: "/history", label: "History", icon: ScrollText },
];

/** How the shared SSE channel reads as an LED. */
const liveLed: Record<LiveStatus, { tone: "signal" | "alert" | "muted"; pulse?: boolean; title: string }> = {
  online: { tone: "signal", title: "Live — connected" },
  connecting: { tone: "muted", title: "Connecting to live updates…" },
  offline: { tone: "alert", pulse: true, title: "Live updates lost — reconnecting…" },
};

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ open, onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [fleet, setFleet] = React.useState<{ total: number; active: number } | null>(null);
  const liveStatus = useLiveStatus();
  const led = liveLed[liveStatus];

  // ---- Sliding active marker ---------------------------------------------
  // One brass bar that glides between nav items instead of each item owning
  // a marker that pops in and out — same device as the segmented-control pill,
  // rotated vertical. Measured against the real DOM so it survives collapse,
  // resize and font swaps.
  const navRef = React.useRef<HTMLElement>(null);
  const [marker, setMarker] = React.useState<{ top: number; height: number } | null>(null);

  const measureMarker = React.useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const activeIdx = items.findIndex((it) =>
      it.href === "/" ? pathname === "/" : pathname.startsWith(it.href)
    );
    const links = nav.querySelectorAll<HTMLElement>("a[data-nav]");
    const el = activeIdx >= 0 ? links[activeIdx] : undefined;
    if (!el) {
      setMarker(null);
      return;
    }
    // Inset by 4px top and bottom — the old marker's `inset-y-1` rhythm.
    setMarker({ top: el.offsetTop + 4, height: el.offsetHeight - 8 });
  }, [pathname]);

  React.useEffect(() => {
    measureMarker();
  }, [measureMarker]);

  React.useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureMarker());
    ro.observe(nav);
    document.fonts?.ready.then(() => measureMarker()).catch(() => {});
    return () => ro.disconnect();
  }, [measureMarker]);

  // Uses deduplicated cached fetchStats so route navigation shares in-flight requests with Dashboard
  React.useEffect(() => {
    let alive = true;
    fetchStats()
      .then((d) => {
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
          "fixed inset-0 z-40 bg-black/60 transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col bg-[#1A1D28] text-[#F2F5FC] border-r border-hairline/50 transition-all duration-300 ease-in-out md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "w-20" : "w-60"
        )}
      >
        {/* Toggle Button */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="absolute -right-3 top-12 z-50 hidden md:flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#1c1f26] text-white shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
        )}

        <div className={cn("flex min-h-[70px] items-center border-b border-white/10", collapsed ? "justify-center px-2" : "justify-between px-5")}>
          <div className={cn("transition-opacity duration-200", collapsed ? "hidden opacity-0" : "opacity-100")}>
            <div className="font-mono text-[15px] font-bold uppercase tracking-[0.16em] text-white">
              My<span className="text-brass">Share</span>
            </div>
          </div>
          {collapsed && (
            <div className="font-mono text-sm font-semibold uppercase text-brass" aria-hidden="true">
              MS
            </div>
          )}
          <button
            onClick={onClose}
            className={cn("-mr-1 rounded p-1 text-white/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass md:hidden", collapsed && "hidden")}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <nav ref={navRef} className="relative flex-1 overflow-y-auto py-3">
          {/* The shared marker — glides to whichever link is active. */}
          <span
            aria-hidden="true"
            className={cn(
              "absolute left-0 w-[2px] rounded-r bg-brass transition-[top,height] duration-300 ease-out",
              !marker && "opacity-0"
            )}
            style={{ top: marker?.top ?? 0, height: marker?.height ?? 0 }}
          />
          {items.map((it) => {
            const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                data-nav
                onClick={onClose}
                title={collapsed ? it.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center py-2.5 font-mono text-eyebrow font-semibold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass",
                  collapsed ? "justify-center px-0" : "gap-3 pl-5 pr-4",
                  active ? "text-white bg-white/[0.08]" : "text-white/50 hover:text-white/90 hover:bg-white/[0.03]"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                {!collapsed && <span className="truncate">{it.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className={cn("border-t border-white/10 py-4 transition-all duration-300", collapsed ? "px-2" : "px-5")}>
          <div
            className={cn(
              "flex items-center font-mono text-[10px] tracking-wider uppercase text-white/60",
              collapsed ? "justify-center" : "gap-2"
            )}
            title={led.title}
          >
            <StatusDot tone={led.tone} size="sm" pulse={led.pulse} />
            {!collapsed && (
              fleet ? (
                <span className="tnum truncate text-white/70">
                  {fleet.active} of {fleet.total} SIMs active
                </span>
              ) : (
                <span className="text-white/35 truncate">Reading tray…</span>
              )
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
