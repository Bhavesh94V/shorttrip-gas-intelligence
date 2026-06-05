"""
SHORT TRIP GAS PRICE INTELLIGENCE
Price Comparison Engine
GarudX.AI | June 2026

Decision Logic:
- Competitor < Short Trip by $0.05+  → ALERT  (notify worker)
- Within $0.05 range                 → MONITOR (log, no notify)
- Short Trip cheaper                 → OK      (log only)
- No competitor data                 → SKIP    (log skipped)
"""

import logging
from typing import Optional
from datetime import datetime, time
import os

logger = logging.getLogger(__name__)

# Configurable thresholds (override via .env or DB settings)
ALERT_THRESHOLD = float(os.getenv("ALERT_THRESHOLD", "0.05"))
HIGH_PRIORITY_THRESHOLD = 0.10  # $0.10+ = HIGH priority
QUIET_HOURS_START = int(os.getenv("QUIET_HOURS_START", "22"))  # 10 PM
QUIET_HOURS_END = int(os.getenv("QUIET_HOURS_END", "6"))       # 6 AM


def is_quiet_hours() -> bool:
    """Check if current time is within quiet hours (no notifications)."""
    current_hour = datetime.now().hour
    if QUIET_HOURS_START > QUIET_HOURS_END:
        # Overnight: e.g., 22:00 to 06:00
        return current_hour >= QUIET_HOURS_START or current_hour < QUIET_HOURS_END
    else:
        return QUIET_HOURS_START <= current_hour < QUIET_HOURS_END


async def run_price_comparison(store: dict, competitors: list) -> dict:
    """
    Compare Short Trip's price against all nearby competitors.
    Returns comparison result with action decision.

    Args:
        store: Short Trip store dict (includes our_price)
        competitors: List of competitor dicts (each with price)

    Returns:
        {
            "action": "alert" | "monitor" | "ok" | "skip",
            "priority": "HIGH" | "MED" | "LOW" | None,
            "our_price": 3.35,
            "best_competitor": {...},
            "all_competitors": [...],
            "price_diff": -0.16,
            "quiet_hours": True/False,
            "timestamp": "..."
        }
    """
    our_price = store.get("our_price")
    store_name = store.get("name", "Unknown Store")

    # Filter competitors that have valid prices
    priced_competitors = [
        c for c in competitors
        if c.get("price") is not None and c.get("price", 0) > 0
    ]

    # ── No price data at all ──────────────────────────────────
    if not our_price:
        logger.warning(f"  ⚠️ {store_name}: Our price not set — skipping comparison")
        return {
            "action": "skip",
            "reason": "Our price not set — please update via dashboard",
            "our_price": None,
            "best_competitor": None,
            "all_competitors": competitors,
            "price_diff": None,
            "quiet_hours": is_quiet_hours(),
            "timestamp": datetime.now().isoformat()
        }

    # ── No competitor prices found ────────────────────────────
    if not priced_competitors:
        logger.info(f"  ℹ️  {store_name}: No competitor price data available")
        return {
            "action": "skip",
            "reason": "No competitor price data available from any source",
            "our_price": float(our_price),
            "best_competitor": None,
            "all_competitors": competitors,
            "price_diff": None,
            "quiet_hours": is_quiet_hours(),
            "timestamp": datetime.now().isoformat()
        }

    # ── Find best (cheapest) competitor ──────────────────────
    best_competitor = min(priced_competitors, key=lambda c: c["price"])
    price_diff = best_competitor["price"] - float(our_price)  # Negative = we're more expensive
    abs_diff = abs(price_diff)

    logger.info(f"  📊 {store_name}: Our=${our_price} | Best competitor={best_competitor['name']} ${best_competitor['price']} | Diff={price_diff:+.3f}")

    # ── Decision Logic ────────────────────────────────────────
    quiet = is_quiet_hours()

    # Competitor is cheaper by $0.05 or more → ALERT
    if price_diff < -ALERT_THRESHOLD:
        priority = "HIGH" if abs_diff >= HIGH_PRIORITY_THRESHOLD else "MED"

        # Check if 2+ competitors are cheaper → always HIGH
        cheaper_count = sum(1 for c in priced_competitors if c["price"] < float(our_price) - ALERT_THRESHOLD)
        if cheaper_count >= 2:
            priority = "HIGH"

        result = {
            "action": "alert",
            "priority": priority,
            "our_price": float(our_price),
            "best_competitor": best_competitor,
            "cheaper_competitors_count": cheaper_count,
            "all_competitors": priced_competitors,
            "price_diff": round(price_diff, 3),
            "abs_diff": round(abs_diff, 3),
            "message": build_alert_message(store, best_competitor, price_diff),
            "quiet_hours": quiet,
            "suppress_notification": quiet,  # Don't send notification during quiet hours
            "timestamp": datetime.now().isoformat()
        }
        logger.info(f"  🚨 ALERT [{priority}]: {best_competitor['name']} is ${abs_diff:.2f} cheaper")
        return result

    # Within $0.05 → MONITOR
    elif price_diff < 0 and abs_diff < ALERT_THRESHOLD:
        return {
            "action": "monitor",
            "priority": "LOW",
            "our_price": float(our_price),
            "best_competitor": best_competitor,
            "all_competitors": priced_competitors,
            "price_diff": round(price_diff, 3),
            "abs_diff": round(abs_diff, 3),
            "quiet_hours": quiet,
            "suppress_notification": True,  # Monitor = no notification
            "timestamp": datetime.now().isoformat()
        }

    # We're cheaper or equal → OK
    else:
        return {
            "action": "ok",
            "priority": None,
            "our_price": float(our_price),
            "best_competitor": best_competitor,
            "all_competitors": priced_competitors,
            "price_diff": round(price_diff, 3),
            "abs_diff": round(abs_diff, 3),
            "quiet_hours": quiet,
            "suppress_notification": True,  # OK = no notification
            "timestamp": datetime.now().isoformat()
        }


def build_alert_message(store: dict, competitor: dict, price_diff: float) -> str:
    """Build formatted WhatsApp/SMS alert message."""
    store_name = store.get("name", "Unknown")
    comp_name = competitor.get("name", "Competitor")
    comp_price = competitor.get("price", 0)
    our_price = store.get("our_price", 0)
    abs_diff = abs(price_diff)
    now = datetime.now().strftime("%I:%M %p EST")

    # WhatsApp format (primary)
    message = (
        f"🚨 PRICE ALERT — Short Trip\n\n"
        f"Store: {store_name}\n"
        f"Nearby {comp_name}: ${comp_price:.3f}/gal (Regular)\n"
        f"Your current price: ${our_price:.3f}/gal (Regular)\n"
        f"Difference: ${abs_diff:.2f} cheaper at competitor\n"
        f"Checked at: {now}\n\n"
        f"⚡ Action: Consider adjusting your price board."
    )
    return message


def build_sms_message(store: dict, competitor: dict, price_diff: float) -> str:
    """Build compact SMS message (160 chars max)."""
    store_addr = store.get("address", store.get("name", "Store"))[:20]
    comp_name = competitor.get("name", "Competitor")[:10]
    comp_price = competitor.get("price", 0)
    our_price = store.get("our_price", 0)
    abs_diff = abs(price_diff)

    return (
        f"SHORT TRIP ALERT: {store_addr} - "
        f"{comp_name} at ${comp_price:.2f}/gal "
        f"vs your ${our_price:.2f}/gal "
        f"(${abs_diff:.2f} cheaper). "
        f"Check price board. -ShortTrip System"
    )


def build_daily_summary(stores_results: list) -> str:
    """Build daily email summary for manager."""
    now = datetime.now().strftime("%B %d, %Y")
    alert_count = sum(1 for r in stores_results if r.get("action") == "alert")
    ok_count = sum(1 for r in stores_results if r.get("action") == "ok")
    monitor_count = sum(1 for r in stores_results if r.get("action") == "monitor")
    total_alerts_today = sum(r.get("today_alerts", 0) for r in stores_results)

    summary = f"""
SHORT TRIP — Daily Price Intelligence Summary
Date: {now}

OVERVIEW:
  🔴 Stores needing attention: {alert_count}
  🟡 Stores to monitor: {monitor_count}
  🟢 Competitive stores: {ok_count}
  📊 Total alerts today: {total_alerts_today}

STORE BREAKDOWN:
"""
    for result in stores_results:
        store_name = result.get("store_name", "Unknown")
        action = result.get("action", "skip").upper()
        our_price = result.get("our_price")

        # Handle both dict and flat formats
        best_comp = result.get("best_competitor", {})
        if isinstance(best_comp, dict):
            comp_name = best_comp.get("name", "N/A")
            comp_price = best_comp.get("price", 0)
        else:
            comp_name = best_comp or result.get("comp_name", "N/A")
            comp_price = result.get("comp_price", 0)

        diff = result.get("price_diff", 0)
        today_alerts = result.get("today_alerts", 0)
        source = result.get("source", "")
        status_icon = {"ALERT": "🔴", "MONITOR": "🟡", "OK": "🟢", "SKIP": "⚪", "FALLBACK": "🔵", "ERROR": "❌"}.get(action, "⚪")

        if our_price and comp_price:
            alert_tag = f" [{today_alerts} alerts]" if today_alerts > 0 else ""
            summary += f"  {status_icon} {store_name}: Our ${our_price:.3f} | Best: {comp_name} ${comp_price:.3f} ({diff:+.3f}){alert_tag}\n"
        elif our_price:
            summary += f"  {status_icon} {store_name}: Our ${our_price:.3f} | No competitor data\n"
        else:
            summary += f"  ⚪ {store_name}: No data available\n"

    summary += f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dashboard: https://shorttrip-gas-intelligence.netlify.app
— Short Trip Gas Price Intelligence System (GarudX.AI)
"""
    return summary

