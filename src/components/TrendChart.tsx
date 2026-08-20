"use client";

import * as React from "react";
import { niceScale, smoothPath, CHART_INK, type Pt } from "@/lib/chart";
import { cn } from "@/lib/utils";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

export interface TrendChartProps {
  /** Bucket tick text, one per point; the chart thins them to fit. */
  labels: string[];
  /** Fuller bucket name, for the tooltip and the table. */
  longLabels: string[];
  series: TrendSeries[];
  format?: (n: number) => string;
  height?: number;
  /** Changing this replays the draw-in — e.g. a newly selected range. */
  replayKey?: string | number;
  /** Names what the screen-reader table describes. */
  caption: string;
  className?: string;
}

const PAD = { top: 16, right: 58, bottom: 26, left: 48 };
const TICK_MIN_PX = 58;
const fmtDefault = (n: number) => n.toLocaleString("en-US");

/**
 * Smooth multi-series curve with a crosshair readout.
 *
 * Rendered at measured pixel width rather than a scaled viewBox: a `viewBox` stretched
 * to the container would scale the 2px strokes and the label type with it.
 */
export function TrendChart({
  labels,
  longLabels,
  series,
  format = fmtDefault,
  height = 208,
  replayKey,
  caption,
  className,
}: TrendChartProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [armed, setArmed] = React.useState(false);
  const [hover, setHover] = React.useState<number | null>(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Two frames: one to paint the curve fully offset, one to start the transition.
  React.useEffect(() => {
    setArmed(false);
    setHover(null);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setArmed(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [replayKey]);

  const n = labels.length;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);

  const peak = series.reduce((m, s) => Math.max(m, ...s.values, 0), 0);
  const { max, step } = niceScale(peak);

  const yTicks = React.useMemo(() => {
    const out: number[] = [];
    for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v));
    return out;
  }, [max, step]);

  const xAt = React.useCallback(
    (i: number) => (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW),
    [n, plotW]
  );
  const yAt = React.useCallback((v: number) => plotH - (v / max) * plotH, [plotH, max]);

  // Keep tick text from colliding: draw every k-th label, always including the last.
  const stride = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / TICK_MIN_PX))));

  const paths = React.useMemo(
    () =>
      series.map((s) => {
        const pts: Pt[] = s.values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
        const line = smoothPath(pts);
        // Close down to the baseline for the wash; `L` back along the floor is enough
        // because the curve already ends on the last point.
        const area = pts.length
          ? `${line} L ${pts[pts.length - 1].x} ${plotH} L ${pts[0].x} ${plotH} Z`
          : "";
        return { ...s, pts, line, area };
      }),
    [series, xAt, yAt, plotH]
  );

  function pick(clientX: number) {
    const el = wrapRef.current;
    if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left - PAD.left;
    const i = n <= 1 ? 0 : Math.round((x / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (n === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      setHover((h) => Math.min(n - 1, Math.max(0, (h ?? (dir > 0 ? -1 : n)) + dir)));
    } else if (e.key === "Escape") {
      setHover(null);
    }
  }

  const ready = width > 0 && plotW > 0;
  const multi = series.length > 1;

  // Direct end-labels are the secondary encoding the status palette requires, so they
  // must stay readable: nudge apart the pair that would otherwise overprint.
  const endLabels = paths
    .map((p) => ({
      key: p.key,
      value: p.values[p.values.length - 1] ?? 0,
      y: p.pts.length ? p.pts[p.pts.length - 1].y : plotH,
    }))
    .sort((a, b) => a.y - b.y);
  if (endLabels.length === 2 && Math.abs(endLabels[0].y - endLabels[1].y) < 13) {
    endLabels[0].y -= 6;
    endLabels[1].y += 7;
  }

  return (
    <div className={cn("relative", className)}>
      {multi && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-ink-soft">
              <span
                className="h-[2px] w-3.5 rounded-full"
                style={{ background: s.color }}
                aria-hidden="true"
              />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div ref={wrapRef} className="relative" style={{ height }}>
        {ready && n > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={caption}
            tabIndex={0}
            onPointerMove={(e) => pick(e.clientX)}
            onPointerDown={(e) => pick(e.clientX)}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={onKeyDown}
            className="block touch-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <g transform={`translate(${PAD.left},${PAD.top})`}>
              {yTicks.map((v) => (
                <g key={v}>
                  <line
                    x1={0}
                    x2={plotW}
                    y1={yAt(v)}
                    y2={yAt(v)}
                    stroke={CHART_INK.grid}
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <text
                    x={-8}
                    y={yAt(v)}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-ink-faint font-mono tnum"
                    fontSize={10}
                  >
                    {format(v)}
                  </text>
                </g>
              ))}

              {labels.map((label, i) =>
                i % stride === 0 || i === n - 1 ? (
                  <text
                    key={i}
                    x={xAt(i)}
                    y={plotH + 16}
                    textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                    className="fill-ink-faint font-mono tnum"
                    fontSize={10}
                  >
                    {label}
                  </text>
                ) : null
              )}

              {/* The wash is a single-series device: two overlapping 10% fills muddy
                  the region where the curves cross, so a multi-series chart is lines
                  only and the legend carries identity. */}
              {!multi &&
                paths.map((p) => (
                  <path
                    key={`${p.key}-area`}
                    d={p.area}
                    fill={p.color}
                    // Animated values go in `style`, not as attributes: a CSS transition
                    // needs the property set through the style origin to be sure it
                    // observes the change.
                    style={{
                      fillOpacity: armed ? 0.1 : 0,
                      transition: "fill-opacity 700ms ease-out 160ms",
                    }}
                  />
                ))}

              {paths.map((p) => (
                <path
                  key={`${p.key}-line`}
                  d={p.line}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  // pathLength normalises the curve to 1 unit, so the wipe works
                  // without measuring the DOM.
                  pathLength={1}
                  strokeDasharray={1}
                  style={{
                    strokeDashoffset: armed ? 0 : 1,
                    transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)",
                  }}
                />
              ))}

              {hover !== null && (
                <line
                  x1={xAt(hover)}
                  x2={xAt(hover)}
                  y1={0}
                  y2={plotH}
                  stroke={CHART_INK.axis}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
              )}

              {paths.map((p) => {
                const i = hover ?? p.pts.length - 1;
                const pt = p.pts[i];
                if (!pt) return null;
                return (
                  <circle
                    key={`${p.key}-dot`}
                    cx={pt.x}
                    cy={pt.y}
                    r={4}
                    fill={p.color}
                    stroke={CHART_INK.surface}
                    strokeWidth={2}
                    style={{ opacity: armed ? 1 : 0, transition: "opacity 300ms ease-out 700ms" }}
                  />
                );
              })}

              {hover === null &&
                endLabels.map((e) => (
                  <text
                    key={`${e.key}-end`}
                    x={plotW + 10}
                    y={e.y}
                    dy="0.32em"
                    className="fill-ink-soft font-mono tnum"
                    fontSize={11}
                    style={{ opacity: armed ? 1 : 0, transition: "opacity 300ms ease-out 760ms" }}
                  >
                    {format(e.value)}
                  </text>
                ))}
            </g>
          </svg>
        )}

        {ready && n === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-ink-faint">
            No transfers in this range.
          </div>
        )}

        {hover !== null && n > 0 && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[8.5rem] rounded border border-hairline bg-card px-2.5 py-2 shadow-lift"
            style={{
              left: PAD.left + xAt(hover),
              // Flip the card to the other side of the hairline near the right edge so
              // it never spills out of the plot.
              transform:
                xAt(hover) > plotW - 96 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
            role="status"
          >
            <div className="font-mono text-eyebrow font-semibold uppercase text-ink-mute">
              {longLabels[hover]}
            </div>
            <div className="mt-1.5 space-y-1">
              {series.map((s) => (
                <div key={s.key} className="flex items-baseline gap-2">
                  <span
                    className="mt-1 h-[2px] w-3 shrink-0 rounded-full"
                    style={{ background: s.color }}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-sm tnum text-ink">
                    {format(s.values[hover] ?? 0)}
                  </span>
                  <span className="ml-auto text-xs text-ink-mute">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Every plotted value stays reachable without hovering, and without colour. */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Bucket</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {longLabels.map((label, i) => (
            <tr key={i}>
              <th scope="row">{label}</th>
              {series.map((s) => (
                <td key={s.key}>{format(s.values[i] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
