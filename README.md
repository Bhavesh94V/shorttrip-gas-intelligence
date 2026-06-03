# 🛢️ Short Trip Gas Price Intelligence System
### GarudX.AI | June 2026

Automated competitor gas price monitoring for all 10 **Short Trip Gas Stations** across South Carolina. Runs every 2 hours, compares prices, and alerts store workers when a nearby competitor is charging less.

---

## ✨ Features

- 🔴 **Real-time Alerts** — Price alerts when competitor is ≥$0.05 cheaper
- 📊 **Dashboard** — Beautiful dark/light mode React UI at `localhost:5173`
- 📍 **10 Store Locations** — All Short Trip SC locations pre-loaded
- 🔍 **Competitor Discovery** — OpenStreetMap finds nearby stations automatically
- 💰 **Price Tracking** — 7-day price history charts per store
- 📢 **Multi-channel Alerts** — Dashboard (always) + WhatsApp + SMS + Email
- ⏰ **Auto Scheduler** — node-cron runs checks every 2 hours
- 🤖 **n8n Integration** — Visual automation workflow (optional)
- 🆓 **100% Free Stack** — No paid APIs required to start

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Dashboard                       │
│              localhost:5173  (Vite + Tailwind)          │
└──────────────────────┬──────────────────────────────────┘
                       │ Axios (JWT)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  Node.js REST API                        │
│    localhost:3001  (Express + node-cron + JWT auth)     │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP
                       ▼
┌─────────────────────────────────────────────────────────┐
│               Python FastAPI Engine                      │
│  localhost:8000  (AsyncIO + httpx + price comparison)   │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  gasbuddy.py │  │ osm_places.py│  │ comparator.py│  │
│  │  py-gasbuddy │  │ OpenStreetMap│  │ Alert Logic  │  │
│  │  EIA.gov     │  │ Nominatim    │  │ Quiet Hours  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
┌────────────────────┐  ┌────────────────────┐
│   PostgreSQL DB    │  │    Notifications   │
│  (Supabase FREE)   │  │  Dashboard ✅ FREE │
│  6 tables          │  │  WhatsApp  ⏳ Opt. │
│  10 stores seeded  │  │  SMS       ⏳ Opt. │
└────────────────────┘  │  Gmail     ✅ FREE │
                        │  n8n       ✅ FREE │
                        └────────────────────┘
```

---

## 🆓 Free Data Sources

| Source | Purpose | Key Required |
|--------|---------|-------------|
| **py-gasbuddy** | Competitor gas prices | No |
| **OpenStreetMap Overpass** | Find nearby stations | No |
| **Nominatim** | Geocoding addresses | No |
| **EIA.gov** | State avg fallback | Yes (Free signup) |
| **Gmail SMTP** | Daily email summary | No (App Password) |
| **n8n self-hosted** | Automation | No |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- PostgreSQL (or Supabase free account)

### 1. Database Setup
```powershell
# Option A: Supabase (recommended — no local install)
# → supabase.com → New Project → SQL Editor → run schema.sql then seed.sql

# Option B: Local PostgreSQL
createdb shorttrip_db
psql shorttrip_db -f shorttrip-backend/database/schema.sql
psql shorttrip_db -f shorttrip-backend/database/seed.sql
```

### 2. Configure Environment
```powershell
# Edit .env — minimum required:
DATABASE_URL=postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres
JWT_SECRET=your_secret_here
```
> See `env_setup_guide.md` for full credential instructions

### 3. Start Everything
```powershell
# Terminal 1 — Python Engine
cd shorttrip-backend/python-engine
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Node.js API
cd shorttrip-backend/node-api
npm install
npm run dev

# Terminal 3 — Dashboard
cd shorttrip-dashboard
npm install
npm run dev
```

### 4. Login
```
URL:      http://localhost:5173
Email:    manager@shorttrip.com
Password: ShortTrip@2026
```

---

## 📁 Project Structure

```
shorttrip-gas-intelligence/
├── shorttrip-backend/
│   ├── .env                     ← All config (fill before starting)
│   ├── python-engine/
│   │   ├── main.py              ← FastAPI + scheduler
│   │   ├── gasbuddy.py          ← Price fetching (FREE)
│   │   ├── osm_places.py        ← Competitor finder (FREE)
│   │   ├── comparator.py        ← Alert decision logic
│   │   ├── notifier.py          ← Dashboard + WhatsApp + SMS + Email
│   │   ├── scraper.py           ← shorttrip.com data scraper
│   │   ├── database.py          ← PostgreSQL helpers
│   │   └── requirements.txt
│   ├── node-api/
│   │   ├── server.js            ← Express server + cron
│   │   ├── db.js                ← DB connection pool
│   │   ├── middleware/auth.js   ← JWT auth
│   │   └── routes/              ← auth, stores, prices, alerts, workers, settings
│   ├── database/
│   │   ├── schema.sql           ← Create tables
│   │   └── seed.sql             ← 10 stores + initial data
│   └── n8n/
│       ├── shorttrip_workflow.json  ← Import into n8n
│       └── README.md            ← n8n setup guide
└── shorttrip-dashboard/
    └── src/
        ├── pages/               ← Dashboard, Stores, Alerts, History, Workers, Settings
        ├── components/          ← Layout, Sidebar, Charts, Tables
        └── api/priceApi.js      ← API client
```

---

## 🔔 Alert Channels

| Channel | Status | Cost | Enable |
|---------|--------|------|--------|
| **Dashboard** | ✅ Always on | FREE | Built-in |
| **Gmail Summary** | ✅ Ready | FREE | Add SMTP_USER + SMTP_PASS |
| **n8n Automation** | ✅ Ready | FREE | `npm install n8n -g && n8n start` |
| **WhatsApp Business** | ⏳ Stub ready | ~$30-50/mo | Add WHATSAPP_TOKEN |
| **Twilio SMS** | ⏳ Stub ready | ~$0.01/SMS | Add TWILIO credentials |

---

## 🏪 Stores Covered

| # | Location                          |
|---|-----------------------------------|
| 1 | 614 US-78, Ridgeville SC          |
| 2 | 3147 State Rd, Ridgeville SC      |
| 3 | 348 College Park Rd, Ladson SC    |
| 4 | 3880 Patriot Pkwy, Sumter SC      |
| 5 | 101 N Hwy 52, Moncks Corner SC    |
| 6 | 3272 US-52, Moncks Corner SC      |
| 7 | 117 S Boundary St, Manning SC     |
| 8 | 3022 Old Hwy 52, Moncks Corner SC |
| 9 | 3995 North Rd, Orangeburg SC      |
| 10| 1010 Old Hwy 52, Moncks Corner SC |

---

*Built by GarudX.AI — June 2026 | Separate admin tool, independent of shorttrip.com*