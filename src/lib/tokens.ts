// Token lifecycle manager:
// - access_token is used for every API call
// - when it's expired (or a call returns 401), refresh via Keycloak refresh_token
// - if refresh fails/expired too → mark SIM as logged_out, user must re-login
import { dbApi, SimRow } from "./db";
import { refreshAccessToken } from "./mytel";

export interface TokenState {
  token: string | null;
  refreshed: boolean;
  needsLogin: boolean;
}

// In-flight refresh promise map per SIM phone to prevent concurrent refresh race conditions
const inFlightRefreshes = new Map<string, Promise<TokenState>>();

/** Get a usable access token for a SIM, refreshing if needed. */
export async function getValidToken(sim: SimRow): Promise<TokenState> {
  const nowSec = Math.floor(Date.now() / 1000);

  // Still valid (with 60s safety margin)
  if (
    sim.access_token &&
    sim.token_expires_at &&
    sim.token_expires_at > nowSec + 60
  ) {
    return { token: sim.access_token, refreshed: false, needsLogin: false };
  }

  // If a refresh is already in flight for this SIM, reuse the pending promise
  if (inFlightRefreshes.has(sim.phone)) {
    return inFlightRefreshes.get(sim.phone)!;
  }

  const refreshPromise = (async () => {
    try {
      // Re-read latest DB state in case a previous concurrent refresh just finished
      const currentSim = dbApi.getSim(sim.phone) ?? sim;
      const currentNow = Math.floor(Date.now() / 1000);
      if (
        currentSim.access_token &&
        currentSim.token_expires_at &&
        currentSim.token_expires_at > currentNow + 60
      ) {
        return { token: currentSim.access_token, refreshed: false, needsLogin: false };
      }

      // Try refresh
      if (currentSim.refresh_token) {
        const refreshed = await refreshAccessToken(currentSim.refresh_token);
        if (refreshed) {
          const freshNow = Math.floor(Date.now() / 1000);
          dbApi.upsertSim(currentSim.phone, {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token ?? currentSim.refresh_token,
            token_expires_at: freshNow + (refreshed.expires_in ?? 300),
            refresh_expires_at: freshNow + (refreshed.refresh_expires_in ?? 0),
            status: "active",
          });
          return { token: refreshed.access_token, refreshed: true, needsLogin: false };
        }
      }

      // Refresh failed → needs manual re-login
      dbApi.upsertSim(currentSim.phone, { status: "logged_out" });
      return { token: null, refreshed: false, needsLogin: true };
    } finally {
      inFlightRefreshes.delete(sim.phone);
    }
  })();

  inFlightRefreshes.set(sim.phone, refreshPromise);
  return refreshPromise;
}
