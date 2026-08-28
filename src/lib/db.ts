import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { sse } from "./events";
import { phoneSearchKeys } from "./format";
import { decryptSecret, encryptSecret, isEncrypted } from "./crypto";

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
  status: string;
  error_code: number | null;
  message: string | null;
  created_at: number;
}

/**
 * Every transfer row read through this module is serialised straight to the
 * browser by /api/history and /api/stats, so the column list is explicit rather
 * than `*`: the legacy `otp` column must never travel with it. Nothing writes
 * that column any more either — a single-use SMS code has no value once the
 * transfer has settled.
 */
const TRANSFER_COLUMNS =
  "id, sender_phone, receiver_phone, amount, fee, status, error_code, message, created_at";

const now = () => Math.floor(Date.now() / 1000);

// ---- Token encryption at rest ----------------------------------------------
//
// The two token columns are the only secrets in the file, and they are wrapped and
// unwrapped here rather than at the call sites: every read of a SIM goes through
// one of the three accessors below, so callers keep seeing plain tokens and cannot
// forget to decrypt one. See lib/crypto.ts for the format and key derivation.

const ENCRYPTED_SIM_COLUMNS = ["access_token", "refresh_token"] as const;

/** Hand a SIM row to the rest of the app with its tokens usable. */
function decodeSim<T extends SimRow | undefined>(row: T): T {
  if (!row) return row;
  row.access_token = decryptSecret(row.access_token);
  row.refresh_token = decryptSecret(row.refresh_token);
  return row;
}

// ---- Filtered listing (History) --------------------------------------------

export interface TransfersFilter {
  fromTs?: number;
  toTs?: number;
  status?: string;
  /**
   * Free-text query. Mirrors the historical client-side semantics: phones
   * match in any digit form (959… / 09… / 9…), plus message substring,
   * amount substring and error-code substring.
   */
  q?: string;
}

/** Escape LIKE wildcards so a query like "50%" matches literally. */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
}

/**
 * Shared WHERE fragment for listing and counting. SQLite's LIKE is already
 * case-insensitive for ASCII, which covers the English messages we store.
 */
function transfersWhereClause(f: TransfersFilter): { sql: string; args: unknown[] } {
  const clauses: string[] = [];
  const args: unknown[] = [];

  if (f.fromTs !== undefined) {
    clauses.push("created_at >= ?");
    args.push(f.fromTs);
  }
  if (f.toTs !== undefined) {
    clauses.push("created_at <= ?");
    args.push(f.toTs);
  }
  if (f.status) {
    clauses.push("status = ?");
    args.push(f.status);
  }

  const q = f.q?.trim();
  if (q) {
    // Same cleaning the old client-side search used for numbers.
    const qClean = q.toLowerCase().replace(/[\s-+]/g, "");
    const qLower = q.toLowerCase();

    const ors = [
      "lower(message) LIKE ? ESCAPE '\\'",
      "CAST(amount AS TEXT) LIKE ? ESCAPE '\\'",
      "(error_code IS NOT NULL AND CAST(error_code AS TEXT) LIKE ? ESCAPE '\\')",
    ];
    const orArgs: unknown[] = [likePattern(qLower), likePattern(qClean), likePattern(qClean)];

    // A number typed in any form must hit rows stored in another form —
    // senders live as 959…, receivers as whatever was typed.
    for (const key of phoneSearchKeys(q)) {
      ors.push("sender_phone LIKE ? ESCAPE '\\'", "receiver_phone LIKE ? ESCAPE '\\'");
      orArgs.push(likePattern(key), likePattern(key));
    }

    clauses.push(`(${ors.join(" OR ")})`);
    args.push(...orArgs);
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", args };
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};

const startOfThisMonth = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
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
const stmtDebitSimBalance = db.prepare(
  `UPDATE sims SET balance = balance - ?, updated_at = ?
   WHERE phone = ? AND balance IS NOT NULL`
);

const stmtAddTransfer = db.prepare(
  `INSERT INTO transfers (sender_phone, receiver_phone, amount, fee, status, error_code, message)
   VALUES (@sender_phone, @receiver_phone, @amount, @fee, @status, @error_code, @message)`
);
const stmtGetTransferById = db.prepare(`SELECT ${TRANSFER_COLUMNS} FROM transfers WHERE id = ?`);
const stmtListTransfers = db.prepare(
  `SELECT ${TRANSFER_COLUMNS} FROM transfers ORDER BY created_at DESC, id DESC LIMIT ?`
);
const stmtListTransfersRange = db.prepare(
  `SELECT ${TRANSFER_COLUMNS} FROM transfers WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC, id DESC LIMIT ?`
);
const stmtDeleteTransfer = db.prepare("DELETE FROM transfers WHERE id = ?");

const stmtCountTransfersAll = db.prepare("SELECT COUNT(*) c FROM transfers");
const stmtCountTransfersRange = db.prepare(
  "SELECT COUNT(*) c FROM transfers WHERE created_at >= ? AND created_at <= ?"
);

const stmtTodayVolumeBySender = db.prepare(
  `SELECT sender_phone, SUM(amount) as volume
   FROM transfers WHERE created_at >= ? AND status = 'success'
   GROUP BY sender_phone`
);

const stmtThisMonthVolumeBySender = db.prepare(
  `SELECT sender_phone, SUM(amount) as volume
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

/**
 * One-time pass to wrap tokens that predate encryption.
 *
 * Deliberately eager rather than waiting for each SIM's next write: a tray that is
 * only read from would keep its plaintext tokens indefinitely. `updated_at` is left
 * alone so the tray does not reshuffle itself on the first boot after deploying.
 */
function encryptLegacyTokens() {
  const rows = db
    .prepare(
      `SELECT id, access_token, refresh_token FROM sims
       WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL`
    )
    .all() as Pick<SimRow, "id" | "access_token" | "refresh_token">[];

  const pending = rows.filter((r) =>
    ENCRYPTED_SIM_COLUMNS.some((c) => r[c] && !isEncrypted(r[c]!))
  );
  if (!pending.length) return;

  const update = db.prepare(
    "UPDATE sims SET access_token = ?, refresh_token = ? WHERE id = ?"
  );
  db.transaction(() => {
    for (const row of pending) {
      update.run(encryptSecret(row.access_token), encryptSecret(row.refresh_token), row.id);
    }
  })();
  console.log(`[db] Encrypted stored tokens for ${pending.length} SIM(s).`);
}

encryptLegacyTokens();

// Re-exported so server code has one import for both the DB and the limit; the
// constant itself lives in lib/constants.ts because client components need it too
// and must not pull better-sqlite3 into the browser bundle.
export { DAILY_VOLUME_LIMIT, MONTHLY_VOLUME_LIMIT } from "./constants";

export const dbApi = {
  getTransferById(id: number): TransferRow | undefined {
    return stmtGetTransferById.get(id) as TransferRow | undefined;
  },

  listSims(): SimRow[] {
    return (stmtListSims.all() as SimRow[]).map(decodeSim);
  },

  getSim(phone: string): SimRow | undefined {
    return decodeSim(stmtGetSim.get(phone) as SimRow | undefined);
  },

  getSimById(id: number): SimRow | undefined {
    return decodeSim(stmtGetSimById.get(id) as SimRow | undefined);
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
      // Callers pass tokens in the clear; they are never written that way.
      vals.push(
        ENCRYPTED_SIM_COLUMNS.includes(k as (typeof ENCRYPTED_SIM_COLUMNS)[number])
          ? encryptSecret(v as string | null)
          : v
      );
    }
    if (sets.length) {
      sets.push("updated_at = ?");
      vals.push(now());
      vals.push(phone);
      db.prepare(`UPDATE sims SET ${sets.join(", ")} WHERE phone = ?`).run(...vals);
    }
    sse.emit("update");
    return this.getSim(phone)!;
  },

  deleteSim(phone: string) {
    stmtDeleteSim.run(phone);
    sse.emit("update");
  },

  /**
   * Subtract a settled transfer from the cached balance in one statement.
   *
   * A transfer confirm reads the SIM before awaiting Mytel, which can take up to
   * 20s — long enough for a balance refresh or a second transfer to land. Doing
   * the arithmetic in SQL means the newer figure is debited, not overwritten by
   * one derived from the pre-await snapshot. A SIM whose balance was never read
   * (NULL) is left alone.
   */
  debitSimBalance(phone: string, amount: number) {
    const info = stmtDebitSimBalance.run(amount, now(), phone);
    if (info.changes > 0) sse.emit("update");
  },

  addTransfer(t: {
    sender_phone: string;
    receiver_phone: string;
    amount: number;
    fee: number;
    status: string;
    error_code?: number;
    message?: string;
  }): TransferRow {
    const info = stmtAddTransfer.run({
      error_code: null,
      message: null,
      ...t,
    });
    sse.emit("update");
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
    // A settled result (success/failed) is broadcast with its details so a
    // background tab can raise an OS notification without re-fetching.
    if (fields.status === "success" || fields.status === "failed") {
      const row = stmtGetTransferById.get(id) as TransferRow | undefined;
      sse.emit("update", {
        kind: "transfer:result",
        id,
        status: fields.status,
        sender: row?.sender_phone ?? "",
        receiver: row?.receiver_phone ?? "",
        amount: row?.amount ?? 0,
        message: fields.message ?? row?.message ?? null,
      });
    } else {
      sse.emit("update");
    }
  },

  listTransfers(limit = 1000, fromTs?: number, toTs?: number): TransferRow[] {
    if (fromTs !== undefined && toTs !== undefined) {
      return stmtListTransfersRange.all(fromTs, toTs, limit) as TransferRow[];
    }
    return stmtListTransfers.all(limit) as TransferRow[];
  },

  /** Total transfers matching the same filter listTransfers uses — lets the
   *  client know when the LIMIT trimmed older rows out of its view. */
  countTransfers(fromTs?: number, toTs?: number): number {
    if (fromTs !== undefined && toTs !== undefined) {
      return (stmtCountTransfersRange.get(fromTs, toTs) as { c: number }).c;
    }
    return (stmtCountTransfersAll.get() as { c: number }).c;
  },

  /**
   * Filtered + paged listing for the History page. Search, status and range
   * all resolve in SQL, so results stay correct no matter how large the log
   * grows — the page never needs to hold every row in memory.
   *
   * The WHERE clause is built dynamically, but every value is a bound
   * parameter; only the clause shape varies with which filters are present.
   */
  listTransfersFiltered(
    f: TransfersFilter,
    limit: number,
    offset: number
  ): { rows: TransferRow[]; total: number } {
    const { sql, args } = transfersWhereClause(f);
    const rows = db
      .prepare(
        `SELECT ${TRANSFER_COLUMNS} FROM transfers ${sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
      )
      .all(...args, limit, offset) as TransferRow[];
    const total = (db
      .prepare(`SELECT COUNT(*) c FROM transfers ${sql}`)
      .get(...args) as { c: number }).c;
    return { rows, total };
  },

  deleteTransfer(id: number) {
    stmtDeleteTransfer.run(id);
    sse.emit("update");
  },

  /**
   * Successful volume sent per SIM since midnight, keyed by sender phone.
   */
  todayVolumeBySender(): Record<string, number> {
    const rows = stmtTodayVolumeBySender.all(startOfToday()) as { sender_phone: string; volume: number }[];
    return Object.fromEntries(rows.map((r) => [r.sender_phone, r.volume]));
  },

  /**
   * Successful volume sent per SIM since start of this month, keyed by sender phone.
   */
  thisMonthVolumeBySender(): Record<string, number> {
    const rows = stmtThisMonthVolumeBySender.all(startOfThisMonth()) as { sender_phone: string; volume: number }[];
    return Object.fromEntries(rows.map((r) => [r.sender_phone, r.volume]));
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
