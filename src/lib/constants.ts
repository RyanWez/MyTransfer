/** Shared with client components — must stay free of server-only imports. */

/** MyShare limits based on volume. */
export const DAILY_VOLUME_LIMIT = 25000;
export const MONTHLY_VOLUME_LIMIT = 50000;

/**
 * A SIM under this can no longer fund a transfer worth sending, so the tray has
 * a "Drained" view that gathers them for one Select → Remove pass.
 *
 * A threshold, not an automatic sweep: `balance` is a cached figure, only as
 * fresh as the last read, and removing a SIM discards its tokens for good.
 */
export const LOW_BALANCE_THRESHOLD = 4000;
