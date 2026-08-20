export type Tone = "signal" | "alert" | "brass" | "muted";

export function fmtKs(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US") + " Ks";
}

/** Amount without the unit, for when "Ks" is set as a separate label. */
export function fmtAmount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US");
}

/** 959... -> 09... */
export function fmtPhone(p: string): string {
  if (p.startsWith("95")) return "0" + p.slice(2);
  return p;
}

/**
 * 09 750 111 222 — grouped for scanning down a column.
 * Handles both stored forms: senders are normalized to `959…`, receivers are
 * stored raw as typed (see the plan's out-of-scope note).
 */
export function fmtPhoneGrouped(p: string): string {
  const local = fmtPhone(p);
  const digits = local.replace(/\D/g, "");
  if (digits.length < 5) return local;
  const groups = digits.slice(2).match(/.{1,3}/g) ?? [];
  return [digits.slice(0, 2), ...groups].join(" ");
}

/**
 * Do two typed-or-stored numbers mean the same SIM?
 *
 * Compares the last 9 digits, which is what survives every form the app sees:
 * `09750111222`, `+959750111222`, `959750111222`.
 */
export function sameNumber(a: string, b: string): boolean {
  const tail = (s: string) => s.replace(/\D/g, "").slice(-9);
  const ta = tail(a);
  return ta.length === 9 && ta === tail(b);
}

export function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 14:32 */
export function fmtClock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** THU 20 AUG — history day dividers */
export function fmtDayHeader(ts: number): string {
  return new Date(ts * 1000)
    .toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
    .replace(",", "")
    .toUpperCase();
}

/** 20 Aug 2026 · 14:32 — receipt footer */
export function fmtStamp(ts: number): string {
  const d = new Date(ts * 1000);
  const date = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${date} · ${fmtClock(ts)}`;
}

/** Groups history rows by calendar day. */
export function dayKey(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** 4m 12s · 42s — short countdown, for horizons under an hour */
export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 3600) {
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }
  if (s >= 60) {
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  }
  return `${s}s`;
}

/**
 * 19 Sep — a date reads better than "737h 47m" for a long-lived token.
 * The month is cut to three letters by hand: en-GB's "short" gives "Sept",
 * "June", "July", and the extra letter overflows the SIM card footer.
 */
export function fmtShortDate(ts: number): string {
  const d = new Date(ts * 1000);
  const month = d.toLocaleDateString("en-GB", { month: "short" }).slice(0, 3);
  return `${d.getDate()} ${month}`;
}

/**
 * Semantic tone per status — components map the tone to color, so the palette
 * lives in one place instead of being hardcoded here.
 */
export function statusBadge(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "active":
      return { label: "Active", tone: "signal" };
    case "logged_out":
      return { label: "Logged out", tone: "muted" };
    case "otp_pending":
      return { label: "Waiting for OTP", tone: "brass" };
    case "success":
      return { label: "Sent", tone: "signal" };
    case "failed":
      return { label: "Failed", tone: "alert" };
    case "pending":
      return { label: "Pending", tone: "brass" };
    default:
      return { label: status, tone: "muted" };
  }
}
