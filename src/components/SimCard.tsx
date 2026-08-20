"use client";

import * as React from "react";
import { RefreshCw, Trash2, LogIn, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/Panel";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { TokenLife } from "@/components/TokenLife";
import { fmtAmount, fmtPhoneGrouped, fmtTime, statusBadge } from "@/lib/format";
import { DAILY_LIMIT_PER_SIM } from "@/lib/constants";
import type { Sim } from "@/lib/types";

export interface SimCardProps {
  sim: Sim;
  onRefresh?: (sim: Sim) => void;
  onRemove?: (sim: Sim) => void;
  onLogin?: (sim: Sim) => void;
  refreshing?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A SIM as a physical object: notched top-right corner, an LED for reachability,
 * balance in brass, and its access token's remaining life along the bottom.
 */
function SimCard({
  sim,
  onRefresh,
  onRemove,
  onLogin,
  refreshing,
  className,
  style,
}: SimCardProps) {
  const state = statusBadge(sim.status);
  const active = sim.status === "active";
  const atLimit = sim.sent_today >= DAILY_LIMIT_PER_SIM;

  return (
    <Panel 
      className={cn("group transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg", className)} 
      style={style} 
      contentClassName="relative flex h-full flex-col p-5 bg-gradient-to-br from-card to-substrate overflow-hidden"
    >
      {/* Decorative Gold Chip */}
      <div className="absolute right-4 top-14 opacity-20 transition-opacity duration-300 group-hover:opacity-40 pointer-events-none">
        <Cpu className="h-10 w-10 text-brass-deep" strokeWidth={1} />
      </div>

      <div className="relative z-10 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <StatusDot tone={state.tone} pulse={active} />
          <span className="font-mono text-eyebrow font-semibold uppercase text-ink-soft">
            {state.label}
          </span>
        </span>
        <span
          className={cn(
            "font-mono text-eyebrow uppercase tnum",
            atLimit ? "text-alert-deep" : "text-ink-faint"
          )}
        >
          {sim.sent_today} of {DAILY_LIMIT_PER_SIM} today
        </span>
      </div>

      <div className="mt-3 font-mono text-sm tnum text-ink-soft">
        {fmtPhoneGrouped(sim.phone)}
      </div>

      <div className="mt-1 font-mono text-title tnum text-brass-deep">
        {sim.balance === null ? <span className="text-ink-faint">—</span> : fmtAmount(sim.balance)}
        {sim.balance !== null && (
          <span className="ml-1.5 text-sm font-normal tracking-normal text-ink-mute">Ks</span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-ink-faint">
        {sim.balance_checked_at ? `Read ${fmtTime(sim.balance_checked_at)}` : "Balance not read yet"}
      </div>

      {sim.note && <div className="relative z-10 mt-2 text-xs italic text-ink-mute">{sim.note}</div>}

      <div className="relative z-10 mt-4 flex items-center justify-between gap-2 border-t border-hairline pt-3 transition-colors duration-300 group-hover:border-hairline-strong">
        {active ? (
          <>
            <TokenLife expiresAt={sim.token_expires_at} />
            <div className="flex shrink-0 items-center gap-0.5">
              {onRefresh && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRefresh(sim)}
                  disabled={refreshing}
                  aria-label={`Read balance for ${fmtPhoneGrouped(sim.phone)}`}
                  title="Read balance"
                >
                  <RefreshCw
                    className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
                    strokeWidth={1.5}
                  />
                </Button>
              )}
              {onRemove && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemove(sim)}
                  className="hover:text-alert-deep"
                  aria-label={`Remove ${fmtPhoneGrouped(sim.phone)}`}
                  title="Remove SIM"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            {onLogin && (
              <Button variant="secondary" size="sm" onClick={() => onLogin(sim)}>
                <LogIn className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                Log in again
              </Button>
            )}
            {onRemove && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onRemove(sim)}
                className="hover:text-alert-deep"
                aria-label={`Remove ${fmtPhoneGrouped(sim.phone)}`}
                title="Remove SIM"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

export interface SimChipProps {
  sim: Sim;
  selected: boolean;
  onSelect: (sim: Sim) => void;
}

/**
 * The sender picker on /transfer. Logged-out SIMs render disabled rather than
 * being filtered away, so it's clear why a SIM can't be used.
 */
function SimChip({ sim, selected, onSelect }: SimChipProps) {
  const active = sim.status === "active";
  const atLimit = sim.sent_today >= DAILY_LIMIT_PER_SIM;

  return (
    <Panel
      as="button"
      type="button"
      notch="sm"
      active={selected}
      disabled={!active}
      onClick={() => onSelect(sim)}
      aria-pressed={selected}
      contentClassName={cn("px-3.5 py-3 text-left", !active && "bg-substrate")}
      className="w-full text-left"
    >
      <div className="flex items-center gap-2">
        <StatusDot tone={active ? "signal" : "muted"} size="sm" pulse={active} />
        <span className="font-mono text-xs tnum text-ink-soft">{fmtPhoneGrouped(sim.phone)}</span>
      </div>
      <div className="mt-1.5 font-mono text-lg tnum text-brass-deep">
        {active && sim.balance !== null ? (
          fmtAmount(sim.balance)
        ) : (
          <span className="text-sm text-ink-faint">
            {active ? "No balance read" : statusBadge(sim.status).label}
          </span>
        )}
      </div>
      {active && (
        <div
          className={cn(
            "mt-0.5 font-mono text-eyebrow uppercase tnum",
            atLimit ? "text-alert-deep" : "text-ink-faint"
          )}
        >
          {atLimit ? "Daily limit reached" : `${sim.sent_today} of ${DAILY_LIMIT_PER_SIM} today`}
        </div>
      )}
    </Panel>
  );
}

export function SimCardSkeleton() {
  return (
    <Panel className="transition-all duration-300 ease-out" contentClassName="flex h-full flex-col p-5 relative overflow-hidden bg-card">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
      <div className="flex items-center justify-between gap-3">
        <div className="h-5 w-24 animate-pulse rounded bg-substrate" />
        <div className="h-4 w-16 animate-pulse rounded bg-substrate" />
      </div>
      <div className="mt-4 h-4 w-28 animate-pulse rounded bg-substrate" />
      <div className="mt-2 h-7 w-32 animate-pulse rounded bg-substrate" />
      <div className="mt-1 h-3 w-24 animate-pulse rounded bg-substrate" />
      <div className="mt-5 flex items-center justify-between border-t border-hairline pt-3">
        <div className="h-4 w-32 animate-pulse rounded bg-substrate" />
        <div className="h-8 w-16 animate-pulse rounded bg-substrate" />
      </div>
    </Panel>
  );
}

export function SimChipSkeleton() {
  return (
    <Panel className="transition-all duration-300 ease-out" notch="sm" contentClassName="flex flex-col p-3.5 relative overflow-hidden bg-card">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded-full bg-substrate animate-pulse" />
        <div className="h-4 w-24 bg-substrate rounded animate-pulse" />
      </div>
      <div className="mt-1.5 h-6 w-32 bg-substrate rounded animate-pulse" />
      <div className="mt-1 h-3 w-40 bg-substrate rounded animate-pulse" />
    </Panel>
  );
}

export { SimCard, SimChip };
