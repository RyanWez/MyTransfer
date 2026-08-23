"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Covers next-themes' class flip plus the 300ms CSS crossfade in globals.css.
const ANIM_MS = 400;
let animTimer: ReturnType<typeof setTimeout> | null = null;

/** Arms the global theme crossfade for one toggle, then disarms it. */
function withThemeAnimation(apply: () => void) {
  const root = document.documentElement;
  root.classList.add("theme-anim");
  apply();
  if (animTimer) clearTimeout(animTimer);
  animTimer = setTimeout(() => root.classList.remove("theme-anim"), ANIM_MS);
}

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const armedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      // Never leave the slow-fade armed if the toggle unmounts mid-animation.
      if (armedRef.current) {
        document.documentElement.classList.remove("theme-anim");
        armedRef.current = false;
        if (animTimer) clearTimeout(animTimer);
      }
    };
  }, []);

  if (!mounted) {
    return <div className="h-8 w-8" />;
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() =>
        withThemeAnimation(() => {
          armedRef.current = true;
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
        })
      }
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
