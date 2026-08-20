# MyShare Dashboard

A Next.js dashboard for managing Mytel → Mytel balance transfers (the **MyShare**
feature of the MyID app), reverse-engineered from `MyID.apk` v2.0.19.

See `../MyShare-API-Analysis.md` for the full API trace.

## Run

```bash
cd dashboard
npm install
npm run dev        # http://localhost:3100
```

## Deploy (Fly.io, free tier)

The console runs in Docker with the SQLite database on a persistent volume, so
no code changes are needed for deployment. Sized for Fly.io's free allowance
(one shared-cpu-1x / 256MB VM, 1GB volume).

### 1. One-time setup

```bash
# Install the CLI: https://fly.io/docs/hands-on/install-flyctl/
flyctl auth login

# Create the app (name must match `app` in fly.toml)
flyctl apps create myshare

# Persistent storage for the database (1GB is plenty)
flyctl volumes create myshare_data --region sin --size 1

# Secrets — the console refuses to start open in production.
# Pick a strong password; generate the secret with openssl:
flyctl secrets set \
  AUTH_PASSWORD='<your-strong-password>' \
  AUTH_SECRET="$(openssl rand -hex 32)"
```

### 2. Deploy

```bash
flyctl deploy
flyctl open          # → https://myshare-console.fly.dev
```

Every later deploy is just `flyctl deploy` (or wire up `flyctl deploy` in CI).
The database on the volume survives redeploys and restarts.

### 3. Backups

The DB holds live SIM tokens — keep a copy off the volume:

```bash
flyctl ssh console -C "node scripts/backup-db.js"
flyctl ssh sftp get /app/data/backups/dashboard-<timestamp>.db ./dashboard-backup.db
```

`scripts/backup-db.js` keeps the 7 newest backups in `/app/data/backups`.

### Auth

- Every page and API route is gated by `src/middleware.ts`; only `/login`
  is public. The session is an httpOnly cookie signed with `AUTH_SECRET`.
- In **production** the gate fails closed: no `AUTH_PASSWORD` → nothing gets in.
- In **dev** (`npm run dev`) the console stays open unless you set
  `AUTH_PASSWORD` locally.
- Log out from the top bar; sessions last 7 days.

### Notes

- Region is `sin` (Singapore) — closest to Myanmar with the free-tier
  bandwidth allowance. Change `primary_region` and recreate the volume to move.
- If 256MB ever feels tight, bump `[[vm]] memory` to `512mb` in `fly.toml`
  (still inside the free allowance, but it uses more of it).
- `TZ=Asia/Yangon` is baked into the image so "today" in the stats matches the
  operator's day.

## Pages

| Page | Purpose |
|---|---|
| `/` | Dashboard — today's stats at a glance |
| `/transfer` | Make a transfer: pick SIM → receiver + amount → OTP → confirm |
| `/sims` | Log in SIMs (OTP or password), view balances, refresh tokens |
| `/history` | All transfer attempts with status |

## How a transfer works

1. Pick a logged-in **sender SIM**, enter receiver number + amount (500–5000 Ks).
2. **Send** → dashboard calls the Mytel API, which SMS a 6-digit OTP to the *sender* SIM.
3. Read the OTP from the phone, type it into the dashboard.
4. **Confirm** → dashboard submits the transfer. Result shown + logged in History.

## MyShare limits (from the app)

- 500 – 5,000 Ks per transfer
- 5% fee on top
- Max 5 transfers per SIM per day

## Data

SQLite database at `data/dashboard.db` (auto-created). Stores SIM tokens and
transfer history. **Tokens are sensitive — keep this folder private.**

## Logging in a SIM

`login/method/otp/*` only works for a number that already has a **verified** MyID
account, so a SIM that has never opened the MyID app cannot log in through it. The
dashboard therefore checks the number first, exactly like the app does:

```
GET  myid/authen/v1.0/v2/login/action/check-account?phoneNumber=<msisdn>
  → 200, result.verify = true      → existing account   → login/method/otp/get-otp
  → 200, result.verify = false     → needs registering  ─┐
  → 400, message "Dont have account"                     ─┴→ v2/register/request
```

The registration path sends the same 6-digit SMS and returns a `reqId`; posting that
`reqId` plus the code to `v2/register/confirm` creates the account **and** returns the
usual token pair. One code, no detour through the MyID app. If the check itself is
inconclusive the dashboard tries login first, then registration.

## Token lifecycle

- Each SIM stores `access_token` + `refresh_token` + expiry.
- Before every API call the dashboard checks the access token; if expired it
  refreshes via Keycloak (`id.mytel.com.mm`, `grant_type=refresh_token`).
- If the refresh token is also expired, the SIM is marked **Logged out** and
  must be logged in again (OTP or password).

## ⚠️ Disclaimer

This automates a carrier service. Bulk/automated transfers may violate Mytel's
terms of service and could lead to SIM/account suspension. Use responsibly and
only for legitimate purposes.
