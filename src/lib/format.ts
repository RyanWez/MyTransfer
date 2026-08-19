export function fmtKs(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US") + " Ks";
}

export function fmtPhone(p: string): string {
  // 959... -> 09...
  if (p.startsWith("95")) return "0" + p.slice(2);
  return p;
}

export function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "active":
      return { label: "Active", cls: "bg-emerald-100 text-emerald-700" };
    case "logged_out":
      return { label: "Logged out", cls: "bg-slate-200 text-slate-600" };
    case "otp_pending":
      return { label: "OTP pending", cls: "bg-amber-100 text-amber-700" };
    case "success":
      return { label: "Success", cls: "bg-emerald-100 text-emerald-700" };
    case "failed":
      return { label: "Failed", cls: "bg-rose-100 text-rose-700" };
    case "pending":
      return { label: "Pending", cls: "bg-amber-100 text-amber-700" };
    default:
      return { label: status, cls: "bg-slate-200 text-slate-600" };
  }
}
