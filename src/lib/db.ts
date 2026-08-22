import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "dashboard.db"));
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("temp_store = MEMORY");
db.pragma("cache_size = -64000");
db.pragma("busy_timeout = 5000");

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

CREATE INDEX IF NOT EXISTS idx_transfers_created_status ON transfers(created_at, status);
CREATE INDEX IF NOT EXISTS idx_transfers_created_id ON transfers(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_sender ON transfers(sender_phone);
CREATE INDEX IF NOT EXISTS idx_sims_status ON sims(status);
CREATE INDEX IF NOT EXISTS idx_sims_updated ON sims(updated_at DESC);
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

/** Chart bucket width. Hourly for a single day, daily for anything longer. */
export type Granularity = "hour" | "day";

export interface SeriesBucket {
  /** Unix seconds at the start of the bucket, in local time. */
  ts: number;
  sent: number;
  failed: number;
  /** Ks moved by successful transfers in this bucket, fees excluded. */
  volume: number;
}

/**
 * Bucket keys are built by SQLite in *local* time so an "hour" means the hour the
 * operator saw, not a UTC offset of it. `bucketKey` below must format identically.
 */
const BUCKET_FORMAT: Record<Granularity, string> = {
  hour: "%Y-%m-%dT%H",
  day: "%Y-%m-%d",
};

function bucketKey(d: Date, granularity: Granularity): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return granularity === "hour" ? `${day}T${p(d.getHours())}` : day;
}

function stepBucket(d: Date, granularity: Granularity) {
  if (granularity === "hour") d.setHours(d.getHours() + 1, 0, 0, 0);
  else d.setDate(d.getDate() + 1);
}

// Pre-compiled prepared statements for hot queries to avoid repeated SQL AST compilation
const stmtListSims = db.prepare("SELECT * FROM sims ORDER BY updated_at DESC");
const stmtGetSim = db.prepare("SELECT * FROM sims WHERE phone = ?");
const stmtGetSimById = db.prepare("SELECT * FROM sims WHERE id = ?");
const stmtInsertSim = db.prepare("INSERT INTO sims (phone) VALUES (?)");
const stmtDeleteSim = db.prepare("DELETE FROM sims WHERE phone = ?");

const stmtAddTransfer = db.prepare(
  `INSERT INTO transfers (sender_phone, receiver_phone, amount, fee, otp, status, error_code, message)
   VALUES (@sender_phone, @receiver_phone, @amount, @fee, @otp, @status, @error_code, @message)`
);
const stmtGetTransferById = db.prepare("SELECT * FROM transfers WHERE id = ?");
const stmtListTransfers = db.prepare("SELECT * FROM transfers ORDER BY created_at DESC, id DESC LIMIT ?");
const stmtListTransfersRange = db.prepare(
  "SELECT * FROM transfers WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC, id DESC LIMIT ?"
);
const stmtDeleteTransfer = db.prepare("DELETE FROM transfers WHERE id = ?");

const stmtTodayCountBySender = db.prepare(
  `SELECT sender_phone, COUNT(*) as cnt
   FROM transfers WHERE created_at >= ? AND status = 'success'
   GROUP BY sender_phone`
);

const stmtRangeSeriesHour = db.prepare(
  `SELECT strftime('${BUCKET_FORMAT.hour}', created_at, 'unixepoch', 'localtime') AS bucket,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS sent,
          SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) AS volume
   FROM transfers
   WHERE created_at >= ? AND created_at < ?
   GROUP BY bucket`
);

const stmtRangeSeriesDay = db.prepare(
  `SELECT strftime('${BUCKET_FORMAT.day}', created_at, 'unixepoch', 'localtime') AS bucket,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS sent,
          SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) AS volume
   FROM transfers
   WHERE created_at >= ? AND created_at < ?
   GROUP BY bucket`
);

const stmtTopErrors = db.prepare(
  `SELECT COALESCE(message, 'Error ' || error_code, 'Unknown Error') as reason, COUNT(*) as count
   FROM transfers
   WHERE status = 'failed' AND created_at >= ? AND created_at < ?
   GROUP BY reason
   ORDER BY count DESC
   LIMIT 5`
);

const stmtSimCount = db.prepare("SELECT COUNT(*) c FROM sims");
const stmtActiveSimCount = db.prepare("SELECT COUNT(*) c FROM sims WHERE status = 'active'");
const stmtActiveTotalBalance = db.prepare(
  "SELECT COALESCE(SUM(balance),0) c FROM sims WHERE status = 'active'"
);

// Re-exported so server code has one import for both the DB and the limit; the
// constant itself lives in lib/constants.ts because client components need it too
// and must not pull better-sqlite3 into the browser bundle.
export { DAILY_LIMIT_PER_SIM } from "./constants";

export const dbApi = {
  listSims(): SimRow[] {
    return stmtListSims.all() as SimRow[];
  },

  getSim(phone: string): SimRow | undefined {
    return stmtGetSim.get(phone) as SimRow | undefined;
  },

  getSimById(id: number): SimRow | undefined {
    return stmtGetSimById.get(id) as SimRow | undefined;
  },

  upsertSim(phone: string, fields: Partial<SimRow>): SimRow {
    const existing = this.getSim(phone);
    if (!existing) {
      stmtInsertSim.run(phone);
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
    stmtDeleteSim.run(phone);
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
    const info = stmtAddTransfer.run({
      otp: null,
      error_code: null,
      message: null,
      ...t,
    });
    return stmtGetTransferById.get(info.lastInsertRowid) as TransferRow;
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

  listTransfers(limit = 1000, fromTs?: number, toTs?: number): TransferRow[] {
    if (fromTs !== undefined && toTs !== undefined) {
      return stmtListTransfersRange.all(fromTs, toTs, limit) as TransferRow[];
    }
    return stmtListTransfers.all(limit) as TransferRow[];
  },

  deleteTransfer(id: number) {
    stmtDeleteTransfer.run(id);
  },

  /**
   * Successful transfers sent per SIM since midnight, keyed by sender phone.
   * Drives the per-SIM "3 of 5 today" line and the dashboard capacity meter.
   */
  todayCountBySender(): Record<string, number> {
    const rows = stmtTodayCountBySender.all(startOfToday()) as { sender_phone: string; cnt: number }[];
    return Object.fromEntries(rows.map((r) => [r.sender_phone, r.cnt]));
  },

  /**
   * Per-bucket transfer counts and volume for a time range, gap-filled so the chart
   * gets a continuous curve instead of skipping quiet hours.
   *
   * Buckets stop at the current one: drawing the rest of today as a flat zero line
   * would read as "nothing happened" rather than "hasn't happened yet".
   */
  rangeSeries(fromTs: number, toTs: number, granularity: Granularity): SeriesBucket[] {
    const query = granularity === "hour" ? stmtRangeSeriesHour : stmtRangeSeriesDay;
    const rows = query.all(fromTs, toTs) as { bucket: string; sent: number; failed: number; volume: number }[];

    const byKey = new Map(rows.map((r) => [r.bucket, r]));
    const nowSec = now();
    const out: SeriesBucket[] = [];

    const cursor = new Date(fromTs * 1000);
    if (granularity === "hour") cursor.setMinutes(0, 0, 0);
    else cursor.setHours(0, 0, 0, 0);

    // Guards a pathological range (future dates, from > to) from spinning forever.
    for (let i = 0; i < 2000; i++) {
      const ts = Math.floor(cursor.getTime() / 1000);
      // The range is half-open, so the bucket starting exactly at `to` belongs to the
      // next range — without this a full past day yields 25 hours.
      if (ts >= toTs) break;
      // And never draw past the current bucket, so an unfinished today doesn't
      // flatline to zero for the hours that haven't happened.
      if (ts > nowSec) break;
      const hit = byKey.get(bucketKey(cursor, granularity));
      out.push({
        ts,
        sent: hit?.sent ?? 0,
        failed: hit?.failed ?? 0,
        volume: hit?.volume ?? 0,
      });
      stepBucket(cursor, granularity);
    }
    return out;
  },

  /** Returns top 5 reasons for failed transfers in the time range. */
  topErrors(fromTs: number, toTs: number): { reason: string; count: number }[] {
    return stmtTopErrors.all(fromTs, toTs) as { reason: string; count: number }[];
  },

  /** Tray-wide figures that don't depend on the selected date range. */
  trayStats() {
    const simCount = (stmtSimCount.get() as { c: number }).c;
    const loggedIn = (stmtActiveSimCount.get() as { c: number }).c;
    const totalBalance = (stmtActiveTotalBalance.get() as { c: number }).c;
    return { simCount, loggedIn, totalBalance, recent: this.listTransfers(5) };
  },
};
