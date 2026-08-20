#!/usr/bin/env node
/**
 * Safe online backup of the SQLite database (WAL-safe, no lock needed).
 *
 * On the server (via Fly.io):
 *   flyctl ssh console -C "node scripts/backup-db.js"
 * then pull the file down:
 *   flyctl ssh sftp get /app/data/backups/<name>.db ./dashboard-backup.db
 *
 * Locally it works the same way from the project root:
 *   node scripts/backup-db.js
 *
 * Env overrides: DATA_DIR, BACKUP_DIR, BACKUP_KEEP (default 7).
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const OUT_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, "backups");
const src = path.join(DATA_DIR, "dashboard.db");

if (!fs.existsSync(src)) {
  console.error("No database found at", src);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = path.join(OUT_DIR, `dashboard-${stamp}.db`);

const db = new Database(src, { readonly: true });
db.backup(dest)
  .then(() => {
    console.log("Backup written:", dest);
    // Keep only the newest N backups so the volume doesn't fill with old copies.
    const keep = Number(process.env.BACKUP_KEEP || 7);
    const files = fs
      .readdirSync(OUT_DIR)
      .filter((f) => f.startsWith("dashboard-") && f.endsWith(".db"))
      .sort();
    while (files.length > keep) {
      const old = files.shift();
      fs.unlinkSync(path.join(OUT_DIR, old));
      console.log("Pruned old backup:", old);
    }
  })
  .catch((err) => {
    console.error("Backup failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
