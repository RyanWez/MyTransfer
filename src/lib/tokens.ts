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

  // Try refresh
  if (sim.refresh_token) {
    const refreshed = await refreshAccessToken(sim.refresh_token);
    if (refreshed) {
      dbApi.upsertSim(sim.phone, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? sim.refresh_token,
        token_expires_at: nowSec + (refreshed.expires_in ?? 300),
        refresh_expires_at: nowSec + (refreshed.refresh_expires_in ?? 0),
        status: "active",
      });
      return { token: refreshed.access_token, refreshed: true, needsLogin: false };
    }
  }

  // Refresh failed → needs manual re-login
  dbApi.upsertSim(sim.phone, { status: "logged_out" });
  return { token: null, refreshed: false, needsLogin: true };
}
