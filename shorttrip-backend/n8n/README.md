# n8n Automation Setup Guide
### Short Trip Gas Price Intelligence | GarudX.AI

---

## What n8n Does Here

n8n is the **automation orchestrator** — it sits between the Python engine and notification channels:

```
Python Engine → detects alert → posts to n8n webhook
n8n → routes to → WhatsApp / SMS / Email / Dashboard
```

**Why n8n?** FREE self-hosted, visual workflow, handles retries, multiple recipients per store.

---

## Step 1 — Install n8n Locally

```powershell
# Install globally
npm install n8n -g

# Start n8n
n8n start

# Open in browser
# http://localhost:5678
```

> **First time**: Create admin account → username + password

---

## Step 2 — Import the Workflow

1. In n8n → Click **"Workflows"** in left sidebar
2. Click **"Import from File"** (or **"+ New Workflow"** → three dots → Import)
3. Select file:
   ```
   d:\Garudx.AI\Short Trip Gas Stations\shorttrip-gas-intelligence\shorttrip-backend\n8n\shorttrip_workflow.json
   ```
4. Click **"Import"** ✅

---

## Step 3 — Get Webhook URL

1. In imported workflow, click on **"Alert Webhook"** node
2. Copy the **Webhook URL** shown — it looks like:
   ```
   http://localhost:5678/webhook/shorttrip-price-check
   ```
3. Add to `.env`:
   ```env
   N8N_WEBHOOK_URL=http://localhost:5678/webhook/shorttrip-price-check
   ```

---

## Step 4 — Activate the Workflow

1. Toggle **"Active"** switch in top-right of workflow editor
2. Status should show **"Active"** (green dot)

---

## Step 5 — Test the Workflow

```powershell
# Test: Send mock alert to n8n webhook
Invoke-WebRequest -Uri "http://localhost:5678/webhook/shorttrip-price-check" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"action":"alert","priority":"HIGH","store_name":"614 US-78, Ridgeville","our_price":3.350,"comp_name":"Shell","comp_price":3.190,"price_diff":-0.160,"channels":["whatsapp","sms"],"workers":[{"phone":"+18438718119","channel":"whatsapp","name":"John Smith"}]}'
```

Check n8n Executions tab → should show the run ✅

---

## Workflow Nodes Overview

| Node | Type | Description |
|------|------|-------------|
| **Every 2 Hours** | Cron | Triggers price check at schedule |
| **Trigger Price Check** | HTTP | Calls Python engine `/engine/run` |
| **Daily 8AM Summary** | Cron | Triggers daily email |
| **Send Daily Email** | HTTP | Calls Python engine `/engine/daily-summary` |
| **Alert Webhook** | Webhook | Receives alerts FROM Python engine |
| **Is Alert?** | If | Filters only `action = alert` |
| **WhatsApp Enabled?** | If | Routes to WhatsApp if channel matches |
| **Send WhatsApp** | HTTP | Calls Meta WhatsApp Business API |
| **Send Twilio SMS** | Twilio | Sends SMS via Twilio |
| **Save to Dashboard DB** | HTTP | Posts alert to Node.js API |
| **Respond to Webhook** | Respond | Returns 200 OK to Python engine |

---

## n8n Credentials Setup (When Ready)

### Twilio Credentials (in n8n)
1. Go to **Credentials** → **"+ Add Credential"**
2. Search **"Twilio"**
3. Enter Account SID + Auth Token from twilio.com/console

### WhatsApp (via HTTP node — already set up)
- Uses `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` env vars
- Passed directly in HTTP request headers

---

## n8n vs Direct Calls

| Feature | Without n8n | With n8n |
|---------|-------------|----------|
| Dashboard alerts | ✅ Always works | ✅ Always works |
| WhatsApp | Direct call from Python | n8n routes |
| SMS | Direct call from Python | n8n routes |
| Retry on failure | ❌ No | ✅ Automatic |
| Visual monitoring | ❌ No | ✅ Execution logs |
| Multiple recipients | Code-managed | n8n workflow |
| Cost | FREE | FREE (self-hosted) |

> **Recommendation**: Use n8n only after WhatsApp/SMS is enabled. For now, dashboard alerts work without n8n.

---

## Keeping n8n Running (Production)

```powershell
# Run n8n as background process (Windows)
Start-Process powershell -ArgumentList "n8n start" -WindowStyle Hidden

# Or add to Windows Task Scheduler for auto-start
```

*GarudX.AI | June 2026*
