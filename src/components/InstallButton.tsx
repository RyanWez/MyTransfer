"use client";

import * as React from "react";
import { Download, Share } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";

/**
 * Cross-browser install affordance.
 *
 * Chromium family (Chrome, Edge, Opera, Samsung Internet) fires
 * `beforeinstallprompt`, which we capture so the console can offer its own
 * Install button instead of relying on the small browser-chrome icon.
 * iOS Safari has no prompt API — there we walk the operator through
 * Share → Add to Home Screen. Browsers that can't install standalone
 * (Firefox desktop) simply see no button.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes its own flag.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ masquerades as desktop Mac — the touch test catches it.
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/i.test(ua) && "ontouchend" in document)
  );
}

/** Firefox on Android installs via its menu — no prompt API, but it works. */
function isFirefoxAndroid(): boolean {
  const ua = window.navigator.userAgent;
  return /firefox/i.test(ua) && /android/i.test(ua);
}

export default function InstallButton() {
  // Start "installed" so the button never flashes for people who already
  // run the console standalone; the effect corrects this right after mount.
  const [installed, setInstalled] = React.useState(true);
  const [promptEvent, setPromptEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = React.useState(false);
  const [firefoxAndroid, setFirefoxAndroid] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);

  React.useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());
    setFirefoxAndroid(isFirefoxAndroid());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      toast.success("MyShare installed — find it on your home screen");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "dismissed") {
      // Keep the button around — the operator may want it later.
      setPromptEvent(null);
    }
  }

  if (installed) return null;
  // Firefox desktop cannot install PWAs at all — hide rather than mislead.
  if (!promptEvent && !ios && !firefoxAndroid) return null;

  const manual = !promptEvent; // iOS Safari / Firefox Android: guided steps

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => (manual ? setHelpOpen(true) : install())}
        aria-label="Install app"
        title={manual ? "How to install MyShare" : "Install MyShare as an app"}
        className="border border-transparent text-ink-mute hover:border-hairline hover:bg-card hover:text-ink transition-all duration-200"
      >
        <Download className="h-4 w-4" strokeWidth={1.8} />
      </Button>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install MyShare</DialogTitle>
            <DialogDescription>
              {firefoxAndroid && !ios
                ? "Firefox installs from its menu:"
                : "On iPhone, installs go through the Share sheet:"}
            </DialogDescription>
          </DialogHeader>
          {firefoxAndroid && !ios ? (
            <ol className="grid gap-2.5 text-sm text-ink-soft">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[11px] font-bold text-brass">⋮</span>
                Tap the <strong className="font-semibold text-ink">menu</strong> (three dots) beside the address bar
              </li>
              <li className="flex items-start gap-2.5">
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.8} />
                Choose <strong className="font-semibold text-ink">Install</strong> — or{" "}
                <strong className="font-semibold text-ink">Add app to Home screen</strong> under “More”
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px] font-bold text-brass">↩</span>
                Confirm — MyShare opens full-screen like a native app
              </li>
            </ol>
          ) : (
            <ol className="grid gap-2.5 text-sm text-ink-soft">
              <li className="flex items-start gap-2.5">
                <Share className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.8} />
                Tap the <strong className="font-semibold text-ink">Share</strong> button
                (square with an arrow) in Safari&apos;s toolbar
              </li>
              <li className="flex items-start gap-2.5">
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.8} />
                Choose <strong className="font-semibold text-ink">Add to Home Screen</strong>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px] font-bold text-brass">↩</span>
                Tap <strong className="font-semibold text-ink">Add</strong> — MyShare opens
                full-screen like a native app
              </li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
