/** Chart geometry, palette and range helpers. Client-safe — no server imports. */

/**
 * Two status hues, not a categorical pair: these encode success and failure, so they
 * come from the design system's `signal` / `alert` ramps rather than a series order.
 *
 * The green is a step deeper than the UI's `signal.deep` (#00A855). Validated against
 * the `card` surface (#FBFAF8): #00A855 sat at 2.99:1 contrast and only 6.5 CVD ΔE
 * from the red, while #008542 clears both (3.4:1, ΔE 8.5 deutan). Status colour never
 * travels alone here either — the legend, the end labels and the tooltip all name the
 * series in text.
 */
export const CHART_INK = {
  sent: "#008542",
  failed: "#DE2A20",
  /** Money, per the palette's one rule for brass. */
  volume: "#A87F28",
  grid: "#DCD8D1",
  axis: "#A9ADB5",
  surface: "#FBFAF8",
} as const;

export interface Pt {
  x: number;
  y: number;
}

/**
 * Monotone cubic (Fritsch–Carlson) path through the points.
 *
 * A plain cubic spline overshoots between a zero and a spike, dipping the curve below
 * the baseline — impossible for a transfer count, and it reads as negative volume.
 * Monotone tangents can't overshoot, so the wave stays inside the data.
 */
export function smoothPath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (n === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1].x - pts[i].x;
    dx.push(h);
    slope.push(h === 0 ? 0 : (pts[i + 1].y - pts[i].y) / h);
  }

  const tangent: number[] = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      // A local extremum: flatten so the curve turns without bulging past the point.
      tangent[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangent[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d +=
      ` C ${pts[i].x + h} ${pts[i].y + tangent[i] * h}` +
      ` ${pts[i + 1].x - h} ${pts[i + 1].y - tangent[i + 1] * h}` +
      ` ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

/** Round the y-axis top up to a clean 1/2/5×10ⁿ step so ticks read as whole numbers. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (max <= 0) return { max: ticks, step: 1 };
  const rough = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { max: step * ticks, step };
}

// ---------- date ranges ----------

export type RangeKey = "today" | "7d" | "30d" | "custom";

const DAY = 86400;

function localMidnight(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

const secs = (d: Date) => Math.floor(d.getTime() / 1000);

/** Half-open [from, to) in unix seconds, aligned to local midnight. */
export function presetRange(key: Exclude<RangeKey, "custom">): { from: number; to: number } {
  const to = secs(localMidnight(1));
  const days = key === "today" ? 1 : key === "7d" ? 7 : 30;
  return { from: secs(localMidnight(1 - days)), to };
}

/** `YYYY-MM-DD` inputs → half-open range covering both endpoint days inclusively. */
export function customRange(fromDay: string, toDay: string): { from: number; to: number } | null {
  const a = new Date(`${fromDay}T00:00:00`);
  const b = new Date(`${toDay}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const from = secs(a);
  const to = secs(b) + DAY;
  if (to <= from) return null;
  return { from, to };
}

/** `YYYY-MM-DD` for an `<input type="date">`, in local time. */
export function toDayInput(ts: number): string {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
