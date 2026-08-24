"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OPEN_COMMAND_PALETTE } from "@/components/CommandPalette";
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
    <header className="sticky top-0 z-30 flex min-h-[70px] flex-col justify-center border-b border-hairline bg-substrate/85 backdrop-blur-sm">
      <div className="flex items-center gap-4 px-5 py-2 md:px-8">
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
          <h1 className="font-mono text-[13px] font-semibold uppercase tracking-[0.12em] text-ink">
            {page.title}
          </h1>
          {/* Hidden rather than truncated on narrow screens — a subtitle clipped
              mid-word reads as a layout fault, and the title already says enough. */}
          {page.sub && (
            <p className="mt-0.5 hidden truncate text-xs text-ink-mute sm:block">{page.sub}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
          <ThemeToggle />
          {pathname !== "/transfer" && (
            <Button asChild size="sm">
              <Link href="/transfer">
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                New transfer
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
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
