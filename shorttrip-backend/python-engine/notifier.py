"""
SHORT TRIP GAS PRICE INTELLIGENCE
Notification System
GarudX.AI | June 2026

Current: Dashboard notifications (FREE) — always works
Future:  WhatsApp Business API + Twilio SMS (when client decides)

Architecture is plug-and-play — just set env vars to enable channels.
"""

import os
import logging
import smtplib
import httpx
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Channel Config (from .env) ────────────────────────────────
WHATSAPP_ENABLED    = os.getenv("WHATSAPP_ENABLED", "false").lower() == "true"
TWILIO_ENABLED      = os.getenv("TWILIO_ENABLED", "false").lower() == "true"
EMAIL_ENABLED       = os.getenv("EMAIL_ENABLED", "true").lower() == "true"

WHATSAPP_TOKEN      = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_ID   = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")

TWILIO_SID          = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN        = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM         = os.getenv("TWILIO_FROM_NUMBER", "")

SMTP_HOST           = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT           = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER           = os.getenv("SMTP_USER", "")
SMTP_PASS           = os.getenv("SMTP_PASS", "")
MANAGER_EMAIL       = os.getenv("MANAGER_EMAIL", "")

# Node.js API URL (for dashboard notification push)
NODE_API_URL        = os.getenv("NODE_API_URL", "http://localhost:3001")

# n8n webhook (optional automation orchestrator — FREE self-hosted)
N8N_ENABLED         = os.getenv("N8N_WEBHOOK_URL", "") != ""
N8N_WEBHOOK_URL     = os.getenv("N8N_WEBHOOK_URL", "")


async def send_alert_notification(store: dict, comparison: dict) -> dict:
    """
    Send price alert through available channels.
    Priority: Dashboard (always) → WhatsApp → SMS
    Returns dict of results per channel.
    """
    results = {}
    message = comparison.get("message", "")
    priority = comparison.get("priority", "MED")
    suppress = comparison.get("suppress_notification", False)

    # ── 1. Dashboard Alert (ALWAYS — FREE) ───────────────────
    # Push to Node.js API which stores in DB and shows on dashboard
    dashboard_result = await _push_to_dashboard(store, comparison)
    results["dashboard"] = dashboard_result

    # ── Quiet Hours Check ─────────────────────────────────────
    if suppress:
        logger.info(f"  🌙 Quiet hours — alert saved to dashboard only, no push notifications")
        results["suppressed"] = "quiet_hours"
        return results

    # ── 2. n8n Webhook (optional orchestration — FREE self-hosted) ──
    # If n8n is running, send full payload there. n8n then routes to
    # WhatsApp/SMS/etc without duplicating logic here.
    if N8N_ENABLED and N8N_WEBHOOK_URL:
        n8n_result = await _call_n8n_webhook(store, comparison)
        results["n8n"] = n8n_result
        logger.info("  🔄 n8n webhook called — routing handled by n8n")
        return results  # n8n handles WhatsApp/SMS from here

    # ── 3. WhatsApp Business API (if configured, no n8n) ─────
    if WHATSAPP_ENABLED and WHATSAPP_TOKEN:
        workers = store.get("workers", [])
        for worker in workers:
            if worker.get("channel") == "whatsapp" and worker.get("active"):
                wa_result = await _send_whatsapp(
                    phone=worker["phone"],
                    message=message,
                    priority=priority
                )
                results[f"whatsapp_{worker['phone'][-4:]}"] = wa_result
    else:
        logger.info("  📱 WhatsApp not configured — add WHATSAPP_TOKEN to .env when ready")

    # ── 4. Twilio SMS (if configured, no n8n) ────────────────
    if TWILIO_ENABLED and TWILIO_SID:
        workers = store.get("workers", [])
        for worker in workers:
            if worker.get("channel") == "sms" and worker.get("active"):
                from comparator import build_sms_message
                sms_msg = build_sms_message(
                    store,
                    comparison.get("best_competitor", {}),
                    comparison.get("price_diff", 0)
                )
                sms_result = await _send_twilio_sms(
                    phone=worker["phone"],
                    message=sms_msg
                )
                results[f"sms_{worker['phone'][-4:]}"] = sms_result
    else:
        logger.info("  📨 Twilio SMS not configured — add TWILIO credentials to .env when ready")

    return results


async def _call_n8n_webhook(store: dict, comparison: dict) -> dict:
    """
    POST alert payload to n8n webhook for routing.
    n8n then handles WhatsApp/SMS/Email routing via workflow.
    Set N8N_WEBHOOK_URL in .env to enable.
    """
    try:
        workers = store.get("workers", [])
        payload = {
            "action": comparison.get("action"),
            "priority": comparison.get("priority"),
            "store_id": store.get("id"),
            "store_name": store.get("name"),
            "our_price": comparison.get("our_price"),
            "comp_name": comparison.get("best_competitor", {}).get("name"),
            "comp_price": comparison.get("best_competitor", {}).get("price"),
            "price_diff": comparison.get("price_diff"),
            "message": comparison.get("message"),
            "channels": list({w.get("channel") for w in workers if w.get("active")}),
            "workers": [
                {"phone": w.get("phone"), "channel": w.get("channel"), "name": w.get("name")}
                for w in workers if w.get("active")
            ],
            "timestamp": datetime.now().isoformat()
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(N8N_WEBHOOK_URL, json=payload)
            if resp.status_code in [200, 201]:
                logger.info(f"  ✅ n8n webhook triggered successfully")
                return {"status": "success", "channel": "n8n"}
            else:
                logger.warning(f"  ⚠️ n8n webhook returned {resp.status_code}")
                return {"status": "warning", "code": resp.status_code}
    except Exception as e:
        logger.error(f"  ❌ n8n webhook failed: {e}")
        return {"status": "error", "error": str(e)}


async def _push_to_dashboard(store: dict, comparison: dict) -> dict:
    """
    Push alert to Node.js API → saves to DB → dashboard shows it.
    This is the FREE notification that always works.
    """
    try:
        payload = {
            "store_id": store.get("id"),
            "store_name": store.get("name"),
            "our_price": comparison.get("our_price"),
            "comp_price": comparison.get("best_competitor", {}).get("price"),
            "comp_name": comparison.get("best_competitor", {}).get("name"),
            "price_diff": comparison.get("price_diff"),
            "priority": comparison.get("priority"),
            "message": comparison.get("message"),
            "action": comparison.get("action"),
            "timestamp": datetime.now().isoformat()
        }
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                f"{NODE_API_URL}/api/alerts/internal",
                json=payload,
                headers={"X-Internal-Key": os.getenv("JWT_SECRET", "internal")}
            )
            if resp.status_code in [200, 201]:
                logger.info(f"  ✅ Dashboard alert saved successfully")
                return {"status": "success", "channel": "dashboard"}
            else:
                logger.warning(f"  ⚠️ Dashboard push returned {resp.status_code}")
                return {"status": "warning", "code": resp.status_code}
    except Exception as e:
        logger.error(f"  ❌ Dashboard push failed: {e}")
        return {"status": "error", "error": str(e)}


async def _send_whatsapp(phone: str, message: str, priority: str = "MED") -> dict:
    """
    Send WhatsApp message via Meta WhatsApp Business API.
    Enable when WHATSAPP_TOKEN is set in .env
    Cost: ~$30-50/month (when client approves)
    """
    try:
        url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_ID}/messages"
        headers = {
            "Authorization": f"Bearer {WHATSAPP_TOKEN}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": phone,
            "type": "text",
            "text": {"body": message}
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code == 200:
                logger.info(f"  ✅ WhatsApp sent to {phone[-4:]}")
                return {"status": "success", "channel": "whatsapp"}
            else:
                logger.warning(f"  ⚠️ WhatsApp failed: {resp.status_code} {resp.text}")
                return {"status": "error", "code": resp.status_code}
    except Exception as e:
        logger.error(f"  ❌ WhatsApp error: {e}")
        return {"status": "error", "error": str(e)}


async def _send_twilio_sms(phone: str, message: str) -> dict:
    """
    Send SMS via Twilio.
    Enable when TWILIO credentials set in .env
    Cost: ~$0.01/SMS (~$10-20/month)
    """
    try:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json"
        payload = {
            "From": TWILIO_FROM,
            "To": phone,
            "Body": message
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url,
                data=payload,
                auth=(TWILIO_SID, TWILIO_TOKEN)
            )
            if resp.status_code == 201:
                logger.info(f"  ✅ SMS sent to {phone[-4:]}")
                return {"status": "success", "channel": "sms"}
            else:
                logger.warning(f"  ⚠️ Twilio SMS failed: {resp.status_code}")
                return {"status": "error", "code": resp.status_code}
    except Exception as e:
        logger.error(f"  ❌ Twilio error: {e}")
        return {"status": "error", "error": str(e)}


async def send_daily_summary_email(summary_text: str, html_content: str = None) -> dict:
    """
    Send daily summary email via Gmail SMTP (FREE).
    Set SMTP_USER and SMTP_PASS (Gmail App Password) in .env
    """
    if not EMAIL_ENABLED or not SMTP_USER or not MANAGER_EMAIL:
        logger.info("  📧 Email not configured — skipping daily summary")
        return {"status": "skipped", "reason": "email not configured"}

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Short Trip Price Summary — {datetime.now().strftime('%B %d, %Y')}"
        msg["From"] = SMTP_USER
        msg["To"] = MANAGER_EMAIL

        # Plain text version
        msg.attach(MIMEText(summary_text, "plain"))

        # HTML version (if provided)
        if html_content:
            msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, MANAGER_EMAIL, msg.as_string())

        logger.info(f"  ✅ Daily summary email sent to {MANAGER_EMAIL}")
        return {"status": "success", "channel": "email", "recipient": MANAGER_EMAIL}

    except Exception as e:
        logger.error(f"  ❌ Email send failed: {e}")
        return {"status": "error", "error": str(e)}
