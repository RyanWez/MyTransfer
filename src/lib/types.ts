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
  rows: { status: string; cnt: number; total: number }[];
  simCount: number;
  loggedIn: number;
  totalBalance: number;
  perSimToday: Record<string, number>;
  recent: Transfer[];
}
