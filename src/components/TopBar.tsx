"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";

const PAGES: Record<string, { title: string; sub: string }> = {
  "/": { title: "Overview", sub: "Balances, daily capacity, and today's transfers" },
  "/transfer": { title: "New transfer", sub: "Send balance from one SIM to any Mytel number" },
  "/sims": { title: "SIM tray", sub: "Logged-in SIMs and how long each token has left" },
  "/history": { title: "History", sub: "Every transfer this console has attempted" },
};

/** The only place a page title appears — pages start straight into content. */
export default function TopBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const page = PAGES[pathname] ?? { title: "MyShare", sub: "" };

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-substrate/85 backdrop-blur-sm">
      <div className="flex items-center gap-4 px-5 py-3.5 md:px-8">
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
          {page.sub && (
            <p className="mt-0.5 truncate text-xs text-ink-mute">{page.sub}</p>
          )}
        </div>

        {pathname !== "/transfer" && (
          <Button asChild size="sm" className="shrink-0">
            <Link href="/transfer">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              New transfer
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}
