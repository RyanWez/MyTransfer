// Background-notification helpers.
//
// The console already streams every result over SSE; these helpers let a
// background tab turn those results into OS notifications + a soft chime,
// so an operator can work in Telegram while transfers run here.
//
// Preference lives in localStorage ("ms.notify") and is only ever honored
// when the browser permission is actually "granted" — revoking the permission
// in browser settings disables the feature regardless of the flag.

const KEY = "ms.notify";

export function notifSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifPermission(): NotificationPermission | "unsupported" {
  if (!notifSupported()) return "unsupported";
  return Notification.permission;
}

export function notifEnabled(): boolean {
  if (!notifSupported()) return false;
  try {
    return localStorage.getItem(KEY) === "1" && Notification.permission === "granted";
  } catch {
    return false;
  }
}

/** Ask for permission (only when still undecided) and flip the flag on. */
export async function enableNotifs(): Promise<"enabled" | "denied"> {
  if (!notifSupported()) return "denied";
  let perm = Notification.permission;
  if (perm === "default") {
    try {
      perm = await Notification.requestPermission();
    } catch {
      perm = "denied";
    }
  }
  if (perm !== "granted") return "denied";
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
  return "enabled";
}

export function disableNotifs() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/**
 * Show an OS notification, preferring the service-worker path — Android
 * Chrome only delivers notifications via the SW registration.
 */
export async function showNotif(title: string, options?: NotificationOptions) {
  if (!notifSupported() || Notification.permission !== "granted") return;
  const opts: NotificationOptions & { icon?: string } = {
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    ...options,
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, opts);
        return;
      }
    }
  } catch {}
  // Desktop fallback while no SW is registered (e.g. dev server).
  try {
    new Notification(title, opts);
  } catch {}
}

let audioCtx: AudioContext | null = null;

/**
 * Two-note confirmation chime (E5 → B5) for success, one low tone for failure.
 * Synthesized with WebAudio so there is no asset to load or cache.
 */
export function chime(ok = true) {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const ctx = audioCtx;
    const t0 = ctx.currentTime;
    const notes = ok ? [659.25, 987.77] : [311.13];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(ok ? 0.1 : 0.07, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  } catch {
    // Audio is a garnish — never let it break the flow.
  }
}
