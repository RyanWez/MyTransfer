"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  CornerDownLeft,
  Gauge,
  LogOut,
  Moon,
  ScrollText,
  Search,
  Send,
  SquareStack,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

/** Window event that opens the palette from anywhere (e.g. the top-bar button). */
export const OPEN_COMMAND_PALETTE = "myshare:open-command-palette";

interface Item {
  id: string;
  label: string;
  keywords: string;
  icon: LucideIcon;
  run: () => void;
}

/**
 * ⌘K / Ctrl+K launcher: jump between pages, flip the theme, log out.
 * Arrow keys move the highlight, Enter runs, Esc closes (Radix).
 */
export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE, onOpenEvent);
    };
  }, []);

  const go = (href: string) => () => router.push(href);

  // Rebuilt per dependency change on purpose: the theme entry tracks resolvedTheme.
  const items: Item[] = React.useMemo(
    () => [
      { id: "nav-overview", label: "Overview", keywords: "dashboard home stats balance", icon: Gauge, run: go("/") },
      { id: "nav-transfer", label: "New transfer", keywords: "send money myshare otp receiver", icon: Send, run: go("/transfer") },
      { id: "nav-receivers", label: "Receivers", keywords: "contacts people numbers copy", icon: Users, run: go("/receivers") },
      { id: "nav-sims", label: "SIM tray", keywords: "sim balance token login logout refresh", icon: SquareStack, run: go("/sims") },
      { id: "nav-history", label: "History", keywords: "log transfers failed success export csv", icon: ScrollText, run: go("/history") },
      {
        id: "action-theme",
        label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        keywords: "theme dark light appearance mode toggle",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        id: "action-logout",
        label: "Log out",
        keywords: "sign out session end",
        icon: LogOut,
        run: () => {
          void fetch("/api/auth/logout", { method: "POST" }).finally(() =>
            window.location.assign("/login")
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` is a stable closure factory over router
    [router, resolvedTheme, setTheme]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.keywords}`.toLowerCase().includes(q));
  }, [query, items]);

  React.useEffect(() => {
    setActive(0);
  }, [query, open]);

  // Keep the highlighted row visible while arrowing through long lists.
  React.useEffect(() => {
    listRef.current?.querySelector("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }, [active, query]);

  function runItem(item: Item) {
    setOpen(false);
    setQuery("");
    item.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[active];
      if (item) runItem(item);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Esc, the ✕ button and overlay clicks all funnel through here.
        setOpen(o);
        if (!o) setQuery("");
      }}
    >      <DialogContent
        // self-start + top margin biases the launcher toward the upper third,
        // like a spotlight rather than a dead-center modal.
        className="mt-[12vh] max-w-lg self-start gap-0 p-0"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Jump to a page or run an action
        </DialogDescription>

        <div className="flex items-center gap-2.5 border-b border-hairline py-3 pl-4 pr-12">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.75} aria-hidden="true" />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- modal opens on intent; focus belongs here */}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page or run an action…"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            className="h-6 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded border border-hairline bg-substrate px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">
            esc
          </kbd>
        </div>

        <div ref={listRef} id="command-palette-list" role="listbox" className="max-h-72 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-ink-mute">
              Nothing matches &quot;{query}&quot;
            </p>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => runItem(item)}
              className={cn(
                "flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-sm transition-colors",
                i === active ? "bg-substrate text-ink" : "text-ink-soft"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0 text-ink-mute" strokeWidth={1.75} aria-hidden="true" />
              <span className="flex-1 truncate">{item.label}</span>
              {i === active && (
                <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
