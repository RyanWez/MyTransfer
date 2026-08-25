"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellOff, BellRing, LogOut, Menu, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import InstallButton from "@/components/InstallButton";
import { OPEN_COMMAND_PALETTE } from "@/components/CommandPalette";
import {
  chime,
  disableNotifs,
  enableNotifs,
  notifEnabled,
  notifPermission,
  notifSupported,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const PAGES: Record<string, { title: string; sub: string }> = {
  "/": { title: "Overview", sub: "Balances, daily capacity, and today's transfers" },
  "/transfer": { title: "New transfer", sub: "Send balance from one SIM to any Mytel number" },
  "/sims": { title: "SIM tray", sub: "Logged-in SIMs and how long each token has left" },
  "/history": { title: "History", sub: "Every transfer this console has attempted" },
};

/** The only place a page title appears — pages start straight into content. */
export default function TopBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const page = PAGES[pathname] ?? { title: "MyShare", sub: "" };
  // Feedback for the round-trip — a slow link must not look like a dead one.
  const [loggingOut, setLoggingOut] = React.useState(false);

  // Background notifications: off by default, opted in via the bell.
  const [notifOn, setNotifOn] = React.useState(false);
  const [notifSupportedState, setNotifSupportedState] = React.useState(false);
  const [notifBusy, setNotifBusy] = React.useState(false);

  React.useEffect(() => {
    setNotifSupportedState(notifSupported());
    setNotifOn(notifEnabled());
  }, []);

  async function toggleNotifications() {
    if (notifBusy) return;
    setNotifBusy(true);
    try {
      if (notifOn) {
        disableNotifs();
        setNotifOn(false);
        toast("Background notifications off");
        return;
      }
      const result = await enableNotifs();
      setNotifOn(notifEnabled());
      if (result === "enabled") {
        chime(true); // audible confirmation of the exact sound to expect
        toast.success("Background notifications on — alerts while the tab is hidden");
      } else {
        toast.error("Notification permission denied — allow it from this site in your browser settings");
      }
    } finally {
      setNotifBusy(false);
    }
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-[70px] transform-gpu flex-col justify-center border-b border-hairline bg-substrate/70 backdrop-blur-[8px]">
      <div className="flex items-center gap-3 px-4 py-2 sm:gap-4 sm:px-5 md:px-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenu}
          className="-ml-2 shrink-0 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" strokeWidth={1.5} />
        </Button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-mono text-[13px] font-semibold uppercase tracking-[0.12em] text-ink">
            {page.title}
          </h1>
          {/* Hidden rather than truncated on narrow screens — a subtitle clipped
              mid-word reads as a layout fault, and the title already says enough. */}
          {page.sub && (
            <p className="mt-0.5 hidden truncate text-xs text-ink-mute sm:block">{page.sub}</p>
          )}
        </div>

        {/* gap-1 on phones: six controls must share the row with the title. */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE))}
            aria-label="Search"
            title="Search (Ctrl K)"
            className="text-ink-mute hover:text-ink hover:bg-card border border-transparent hover:border-hairline transition-all duration-200"
          >
            <Search className="h-4 w-4" strokeWidth={1.8} />
          </Button>
          {notifSupportedState && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleNotifications}
              disabled={notifBusy}
              aria-label={notifOn ? "Notifications on" : "Notifications off"}
              title={
                notifOn
                  ? "Background notifications on — click to turn off"
                  : "Get notified when transfers finish while this tab is hidden"
              }
              className={cn(
                "border transition-all duration-200",
                notifOn
                  ? "border-brass/40 text-brass hover:bg-brass-wash hover:text-brass-deep"
                  : "text-ink-mute hover:text-ink hover:bg-card border-transparent hover:border-hairline"
              )}
            >
              {notifOn ? (
                <BellRing className="h-4 w-4" strokeWidth={1.8} />
              ) : (
                <BellOff className="h-4 w-4" strokeWidth={1.8} />
              )}
            </Button>
          )}
          <InstallButton />
          <ThemeToggle />
          {pathname !== "/transfer" && (
            <Button asChild size="sm" className="px-2.5 sm:px-3">
              <Link href="/transfer" aria-label="New transfer">
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                {/* Icon-only on phones — the label alone would push the row
                    past a 360px viewport. */}
                <span className="hidden sm:inline">New transfer</span>
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={logout}
            disabled={loggingOut}
            aria-label="Log out"
            title={loggingOut ? "Logging out…" : "Log out"}
          >
            <LogOut
              className={cn("h-4 w-4", loggingOut && "animate-pulse")}
              strokeWidth={1.5}
            />
          </Button>
        </div>
      </div>
    </header>
  );
}
