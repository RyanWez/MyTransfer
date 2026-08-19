const Database = require("better-sqlite3");
const db = new Database("data/dashboard.db");

console.log("=== SIMS ===");
const sims = db.prepare("SELECT * FROM sims").all();
for (const r of sims) {
  console.log(
    `phone=${r.phone}  balance=${r.balance}  status=${r.status}  subId=${r.subscription_id}  checked=${r.balance_checked_at ? new Date(r.balance_checked_at * 1000).toLocaleString() : "-"}`
  );
}

console.log("\n=== TRANSFERS ===");
const transfers = db.prepare("SELECT * FROM transfers ORDER BY id DESC LIMIT 10").all();
for (const r of transfers) {
  console.log(
    `#${r.id}  ${r.sender_phone} -> ${r.receiver_phone}  amount=${r.amount}  fee=${r.fee}  status=${r.status}  code=${r.error_code}  msg=${r.message}  time=${new Date(r.created_at * 1000).toLocaleString()}`
  );
}
