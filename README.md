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
