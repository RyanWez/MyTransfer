"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-8" />;
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      title={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="relative text-ink-mute hover:text-ink hover:bg-card border border-transparent hover:border-hairline transition-all duration-200"
    >
      <div className="relative h-4 w-4 flex items-center justify-center">
        <Sun
          className={`h-4 w-4 text-brass transition-all duration-300 ${
            resolvedTheme === "dark"
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0 absolute"
          }`}
          strokeWidth={1.8}
        />
        <Moon
          className={`h-4 w-4 text-ink-soft transition-all duration-300 ${
            resolvedTheme === "dark"
              ? "rotate-90 scale-0 opacity-0 absolute"
              : "rotate-0 scale-100 opacity-100"
          }`}
          strokeWidth={1.8}
        />
      </div>
    </Button>
  );
}
