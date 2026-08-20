import {
  listSubscriptions,
  getBalance,
  normalizeMsisdn,
  type LoginResult,
} from "@/lib/mytel";
import { dbApi } from "@/lib/db";

/**
 * Store a fresh token pair for a SIM and best-effort read its subscription id + balance.
 *
 * Shared by all three ways in: OTP login, password login, and first-time registration.
 * The subscription lookup is deliberately non-fatal — the tokens are the valuable part,
 * and the SIM Tray can refresh a missing balance later.
 */
export async function persistLogin(
  msisdn: string,
  lr: LoginResult,
  /**
   * Subscription id already known from the calling flow. `v2/register/confirm` is
   * preceded by a response that carries it, and a brand-new account sometimes isn't
   * listed by the subscription endpoint yet.
   */
  subscriptionIdHint?: string | null
): Promise<{ subscriptionId: string | null; balance: number | null }> {
  const nowSec = Math.floor(Date.now() / 1000);

  let subscriptionId: string | null = subscriptionIdHint ?? null;
  let balance: number | null = null;
  try {
    if (subscriptionId) {
      // If subscriptionId is already known from registration/check, read balance directly
      const bal = await getBalance(lr.access_token, msisdn);
      if (bal) balance = bal.mainAmount;
    } else {
      const subs = await listSubscriptions(lr.access_token);
      const mine = subs.find((s) => normalizeMsisdn(s.isdn) === msisdn) ?? subs[0];
      if (mine) {
        subscriptionId = mine.id;
        const bal = await getBalance(lr.access_token, normalizeMsisdn(mine.isdn));
        if (bal) balance = bal.mainAmount;
      }
    }
  } catch {
    // non-fatal: balance can be refreshed later
  }

  dbApi.upsertSim(msisdn, {
    access_token: lr.access_token,
    refresh_token: lr.refresh_token,
    token_expires_at: nowSec + (lr.expires_in ?? 300),
    refresh_expires_at: nowSec + (lr.refresh_expires_in ?? 0),
    subscription_id: subscriptionId,
    balance,
    balance_checked_at: balance !== null ? nowSec : null,
    status: "active",
  });

  return { subscriptionId, balance };
}
