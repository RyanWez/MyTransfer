/** Client-side shapes returned by the API routes. */

export interface Sim {
  id: number;
  phone: string;
  balance: number | null;
  balance_checked_at: number | null;
  token_expires_at: number | null;
  refresh_expires_at: number | null;
  subscription_id: string | null;
  status: string;
  note: string | null;
  /** Successful transfers sent by this SIM since midnight. */
  sent_today: number;
  created_at: number;
  updated_at: number;
}

export interface Transfer {
  id: number;
  sender_phone: string;
  receiver_phone: string;
  amount: number;
  fee: number;
  status: string;
  error_code: number | null;
  message: string | null;
  created_at: number;
}

export interface Stats {
  simCount: number;
  loggedIn: number;
  totalBalance: number;
  recent: Transfer[];
}

/** One point on the dashboard curves. `ts` is the local start of the bucket. */
export interface SeriesBucket {
  ts: number;
  sent: number;
  failed: number;
  volume: number;
}

export interface StatsResponse {
  ok: boolean;
  stats: Stats;
  series: {
    from: number;
    to: number;
    granularity: "hour" | "day";
    buckets: SeriesBucket[];
  };
  totals: { sent: number; failed: number; volume: number };
  topErrors: { reason: string; count: number }[];
}
