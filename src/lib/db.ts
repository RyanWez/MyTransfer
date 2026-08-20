import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "dashboard.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS sims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at INTEGER,
  refresh_expires_at INTEGER,
  subscription_id TEXT,
  balance INTEGER,
  balance_checked_at INTEGER,
  status TEXT DEFAULT 'logged_out',
  note TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_phone TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  amount INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  otp TEXT,
  status TEXT NOT NULL,
  error_code INTEGER,
  message TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
`);

export interface SimRow {
  id: number;
  phone: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: number | null;
  refresh_expires_at: number | null;
  subscription_id: string | null;
  balance: number | null;
  balance_checked_at: number | null;
  status: string;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface TransferRow {
  id: number;
  sender_phone: string;
  receiver_phone: string;
  amount: number;
  fee: number;
  otp: string | null;
  status: string;
  error_code: number | null;
  message: string | null;
  created_at: number;
}

const now = () => Math.floor(Date.now() / 1000);

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};

// Re-exported so server code has one import for both the DB and the limit; the
// constant itself lives in lib/constants.ts because client components need it too
// and must not pull better-sqlite3 into the browser bundle.
export { DAILY_LIMIT_PER_SIM } from "./constants";

export const dbApi = {
  listSims(): SimRow[] {
    return db.prepare("SELECT * FROM sims ORDER BY updated_at DESC").all() as SimRow[];
  },

  getSim(phone: string): SimRow | undefined {
    return db.prepare("SELECT * FROM sims WHERE phone = ?").get(phone) as SimRow | undefined;
  },

  getSimById(id: number): SimRow | undefined {
    return db.prepare("SELECT * FROM sims WHERE id = ?").get(id) as SimRow | undefined;
  },

  upsertSim(phone: string, fields: Partial<SimRow>): SimRow {
    const existing = this.getSim(phone);
    if (!existing) {
      db.prepare("INSERT INTO sims (phone) VALUES (?)").run(phone);
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (k === "phone" || k === "id") continue;
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length) {
      sets.push("updated_at = ?");
      vals.push(now());
      vals.push(phone);
      db.prepare(`UPDATE sims SET ${sets.join(", ")} WHERE phone = ?`).run(...vals);
    }
    return this.getSim(phone)!;
  },

  deleteSim(phone: string) {
    db.prepare("DELETE FROM sims WHERE phone = ?").run(phone);
  },

  addTransfer(t: {
    sender_phone: string;
    receiver_phone: string;
    amount: number;
    fee: number;
    otp?: string;
    status: string;
    error_code?: number;
    message?: string;
  }): TransferRow {
    const info = db
      .prepare(
        `INSERT INTO transfers (sender_phone, receiver_phone, amount, fee, otp, status, error_code, message)
         VALUES (@sender_phone, @receiver_phone, @amount, @fee, @otp, @status, @error_code, @message)`
      )
      .run({
        otp: null,
        error_code: null,
        message: null,
        ...t,
      });
    return db
      .prepare("SELECT * FROM transfers WHERE id = ?")
      .get(info.lastInsertRowid) as TransferRow;
  },

  updateTransfer(id: number, fields: Partial<TransferRow>) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (k === "id") continue;
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (!sets.length) return;
    vals.push(id);
    db.prepare(`UPDATE transfers SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  },

  listTransfers(limit = 200): TransferRow[] {
    return db
      .prepare("SELECT * FROM transfers ORDER BY id DESC LIMIT ?")
      .all(limit) as TransferRow[];
  },

  /**
   * Successful transfers sent per SIM since midnight, keyed by sender phone.
   * Drives the per-SIM "3 of 5 today" line and the dashboard capacity meter.
   */
  todayCountBySender(): Record<string, number> {
    const rows = db
      .prepare(
        `SELECT sender_phone, COUNT(*) as cnt
         FROM transfers WHERE created_at >= ? AND status = 'success'
         GROUP BY sender_phone`
      )
      .all(startOfToday()) as { sender_phone: string; cnt: number }[];
    return Object.fromEntries(rows.map((r) => [r.sender_phone, r.cnt]));
  },

  todayStats() {
    const ts = startOfToday();
    const rows = db
      .prepare(
        `SELECT status, COUNT(*) as cnt, COALESCE(SUM(amount),0) as total
         FROM transfers WHERE created_at >= ? GROUP BY status`
      )
      .all(ts) as { status: string; cnt: number; total: number }[];
    const simCount = (db.prepare("SELECT COUNT(*) c FROM sims").get() as { c: number }).c;
    const loggedIn = (
      db.prepare("SELECT COUNT(*) c FROM sims WHERE status = 'active'").get() as { c: number }
    ).c;
    const totalBalance = (
      db
        .prepare(
          "SELECT COALESCE(SUM(balance),0) c FROM sims WHERE status = 'active'"
        )
        .get() as { c: number }
    ).c;
    return {
      rows,
      simCount,
      loggedIn,
      totalBalance,
      perSimToday: this.todayCountBySender(),
      recent: this.listTransfers(5),
    };
  },
};
