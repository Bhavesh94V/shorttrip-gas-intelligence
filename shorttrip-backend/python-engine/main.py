"""
SHORT TRIP GAS PRICE INTELLIGENCE
Python FastAPI — Main Entry Point
GarudX.AI | June 2026
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
import asyncio
import logging
from datetime import datetime

import os
import sys

# Fix Windows UTF-8 encoding for emoji logging
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv(dotenv_path="../.env")

from gasbuddy import fetch_gasbuddy_prices
from osm_places import find_competitors_nearby          # OpenStreetMap (FREE)
from comparator import run_price_comparison, build_daily_summary
from notifier import send_alert_notification, send_daily_summary_email
from scraper import scrape_store_locations
from database import get_all_stores, save_price_history, save_alert, get_db_connection, upsert_competitors, save_competitor_price, get_competitors_from_db

SEARCH_RADIUS = float(os.getenv("SEARCH_RADIUS_MILES", "2.0"))

# Semaphore: max 3 stores checked concurrently (avoid Overpass 429 rate limits)
_osm_semaphore = asyncio.Semaphore(3)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("shorttrip_engine.log", encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)

# ── FastAPI App ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[START] Short Trip Price Engine starting up...")
    # Launch background scheduler (auto price checks every 2 hours)
    scheduler_task = asyncio.create_task(_background_scheduler())
    yield
    scheduler_task.cancel()
    logger.info("[STOP] Short Trip Price Engine shutting down...")

app = FastAPI(
    title="Short Trip Gas Price Engine",
    description="Automated competitor gas price monitoring for Short Trip Gas Stations",
    version="1.0.0",
    lifespan=lifespan
)

# CORS — allow Node.js API + Dashboard to call this
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:4173",
        "https://shorttrip-node-api.onrender.com",
        "https://shorttrip-python-engine.onrender.com",
        "https://shorttrip-gas-intelligence.netlify.app",
        "https://shorttrip-admin.garudx.ai",
        "https://shorttrip-api.garudx.ai",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Health Check ─────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "status": "running",
        "service": "Short Trip Gas Price Engine",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

# ── Run Full Price Check (All Stores) ────────────────────────
@app.post("/engine/run")
async def run_full_check(background_tasks: BackgroundTasks):
    """
    Triggered by n8n every 2 hours.
    Fetches competitor prices for all 10 stores and sends alerts if needed.
    """
    logger.info("[RUN] Starting full price check for all stores...")
    background_tasks.add_task(execute_full_check)
    return {
        "status": "started",
        "message": "Price check triggered for all stores",
        "timestamp": datetime.now().isoformat()
    }

@app.post("/engine/run/{store_id}")
async def run_single_store_check(store_id: int, background_tasks: BackgroundTasks):
    """Run price check for a single store (manual trigger from dashboard)."""
    logger.info(f"[RUN] Starting price check for store ID: {store_id}")
    background_tasks.add_task(execute_store_check, store_id)
    return {
        "status": "started",
        "store_id": store_id,
        "message": f"Price check triggered for store {store_id}",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/engine/status")
def get_engine_status():
    """Get last run status and stats."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                COUNT(*) as total_checks,
                SUM(CASE WHEN status = 'alert' THEN 1 ELSE 0 END) as alerts_sent,
                MAX(fetched_at) as last_run,
                (SELECT source FROM price_history ORDER BY fetched_at DESC LIMIT 1) as last_source
            FROM price_history
            WHERE fetched_at > NOW() - INTERVAL '24 hours'
        """)
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return {
            "status": "ok",
            "last_24h": {
                "total_checks": row[0],
                "alerts_sent": row[1],
                "last_run": row[2].isoformat() if row[2] else None,
                "last_price_source": row[3]
            }
        }
    except Exception as e:
        logger.error(f"Status check error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/engine/test-sources")
async def test_price_sources():
    """
    Test all price sources against a real SC location (Store 1 — Ridgeville).
    Call this to debug why prices are not updating.
    Returns which sources work and which fail.
    """
    # Store 1: 614 US-78, Ridgeville, SC — real coordinates
    test_lat, test_lng = 33.0971, -80.3231

    results = {}
    import asyncio

    # Test each source independently
    async def test_source(name, coro):
        try:
            result = await asyncio.wait_for(coro, timeout=15)
            return {"status": "ok", "price": result.get("price"), "source": result.get("source")}
        except asyncio.TimeoutError:
            return {"status": "timeout"}
        except Exception as e:
            return {"status": "error", "detail": str(e)[:100]}

    from gasbuddy import (
        _fetch_from_tomtom, _fetch_from_gasbuddy, _fetch_from_waze,
        _fetch_from_aaa, _fetch_from_eia, TOMTOM_API_KEY, GASBUDDY_AVAILABLE, EIA_API_KEY
    )

    results["tomtom"]  = {"api_key_set": bool(TOMTOM_API_KEY)}
    if TOMTOM_API_KEY:
        results["tomtom"].update(await test_source("tomtom", _fetch_from_tomtom(test_lat, test_lng, "Shell")))

    results["gasbuddy"] = {"library_available": GASBUDDY_AVAILABLE}
    if GASBUDDY_AVAILABLE:
        results["gasbuddy"].update(await test_source("gasbuddy", _fetch_from_gasbuddy(test_lat, test_lng)))

    results["waze"]  = await test_source("waze",  _fetch_from_waze(test_lat, test_lng))
    results["aaa"]   = await test_source("aaa",   _fetch_from_aaa())
    results["eia"]   = await test_source("eia",   _fetch_from_eia())
    results["eia"]["api_key_set"] = bool(EIA_API_KEY)

    # Summary
    working = [k for k, v in results.items() if v.get("status") == "ok" and v.get("price")]
    results["summary"] = {
        "working_sources": working,
        "any_working": len(working) > 0,
        "recommendation": "Set EIA_API_KEY env var on Render for guaranteed prices" if not working else f"Use {working[0]} as primary source"
    }
    return results


# ── Core Execution Logic ──────────────────────────────────────
async def execute_full_check():
    """Main function: auto-discover stores → find competitors → compare prices → alert.
    Runs all stores in parallel for speed.
    """
    # Step 0: Auto-discover new Short Trip stores from shorttrip.com
    await _auto_discover_stores()

    stores = await get_all_stores()
    logger.info(f"[RUN] Processing {len(stores)} stores in parallel...")

    # Run stores with concurrency limit (3 at a time → fast but no rate-limit)
    tasks = [_checked_store(store['id']) for store in stores]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    success = sum(1 for r in results if not isinstance(r, Exception))
    errors  = sum(1 for r in results if isinstance(r, Exception))
    logger.info(f"[DONE] Full check complete. Success: {success}, Errors: {errors}")
    return [r for r in results if not isinstance(r, Exception)]


async def _checked_store(store_id: int):
    """Wrap execute_store_check with semaphore to avoid OSM rate limits."""
    async with _osm_semaphore:
        return await execute_store_check(store_id)


async def _auto_discover_stores():
    """Scrape shorttrip.com for new store locations and add them to DB automatically."""
    try:
        from scraper import scrape_store_locations
        from database import get_db_connection
        import psycopg2.extras

        logger.info("[DISCOVER] Checking shorttrip.com for new store locations...")
        scraped = await scrape_store_locations()
        if not scraped:
            return

        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        new_count = 0
        for loc in scraped:
            # Check if store already exists by address
            cursor.execute(
                "SELECT id FROM stores WHERE address ILIKE %s",
                (f"%{loc.get('address', '')}%",)
            )
            if not cursor.fetchone() and loc.get('lat') and loc.get('lng'):
                cursor.execute("""
                    INSERT INTO stores (name, address, city, state, zip, lat, lng, active)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, true)
                    ON CONFLICT DO NOTHING
                """, (
                    loc.get('name', 'Short Trip'),
                    loc.get('address', ''),
                    loc.get('city', ''),
                    loc.get('state', 'SC'),
                    loc.get('zip', ''),
                    loc.get('lat'),
                    loc.get('lng')
                ))
                if cursor.rowcount > 0:
                    new_count += 1
                    logger.info(f"  [NEW STORE] Added: {loc.get('name')} — {loc.get('address')}")
        conn.commit()
        cursor.close()
        conn.close()
        if new_count:
            logger.info(f"[DISCOVER] {new_count} new Short Trip stores added to DB!")
        else:
            logger.info("[DISCOVER] No new stores found.")
    except Exception as e:
        logger.warning(f"[DISCOVER] Store discovery skipped: {e}")


async def _background_scheduler():
    """
    Runs automatically in background:
    - First run: 45 seconds after startup (let services settle)
    - Then: every 2 hours
    This replaces the need for n8n cron triggers.
    """
    # Initial delay — let DB + all services start up
    logger.info("[SCHED] Scheduler started. First run in 45 seconds...")
    await asyncio.sleep(45)

    while True:
        try:
            logger.info("[SCHED] Auto price check starting (all stores)...")
            await execute_full_check()
            logger.info("[SCHED] Auto price check complete. Next run in 2 hours.")
        except Exception as e:
            logger.error(f"[SCHED] Scheduler error: {e}")
        # Wait 2 hours before next run
        await asyncio.sleep(7200)

async def execute_store_check(store_id: int):
    """Full pipeline for a single store."""
    try:
        stores = await get_all_stores()
        store = next((s for s in stores if s['id'] == store_id), None)
        if not store:
            raise ValueError(f"Store {store_id} not found")

        logger.info(f"[STORE] Checking store: {store['name']}")

        # Step 1: Find competitors nearby (OpenStreetMap — FREE)
        competitors = await find_competitors_nearby(
            lat=store['lat'],
            lng=store['lng'],
            radius_miles=SEARCH_RADIUS,
            store_name=store.get('name')
        )
        logger.info(f"  Found {len(competitors)} competitors nearby")

        # If 0 found at default radius, auto-retry with extended 5-mile radius
        if len(competitors) == 0:
            logger.info(f"  [RETRY] 0 found at {SEARCH_RADIUS}mi -- expanding to 5.0 miles...")
            competitors = await find_competitors_nearby(
                lat=store['lat'],
                lng=store['lng'],
                radius_miles=5.0,
                store_name=store.get('name')
            )
            logger.info(f"  [RETRY] Found {len(competitors)} competitors at 5.0 miles")

        # Step 1c: If STILL 0, load from DB cache (OSM may be rate-limited)
        if len(competitors) == 0:
            db_cached = await get_competitors_from_db(store_id)
            if db_cached:
                competitors = db_cached
                logger.info(f"  [DB] Loaded {len(competitors)} competitors from DB cache (OSM unavailable)")

        # Step 1b: Save/update competitors in DB (so dashboard can show them)
        if competitors:
            competitors = await upsert_competitors(store_id, competitors)
            logger.info(f"  Saved {len(competitors)} competitors to DB")

        # Step 2: Fetch prices — Apify (real GasBuddy prices) → TomTom → EIA fallback
        our_price = float(store.get('our_price', 0) or 0)
        store_zip = store.get('zip') or store.get('zip_code') or ''

        # Fetch regional/benchmark price ONCE per store (Apify call is cached per ZIP)
        regional_price_data = await fetch_gasbuddy_prices(
            lat=float(store['lat']),
            lng=float(store['lng']),
            station_name=None,
            zip_code=store_zip          # ← Apify uses this ZIP for real prices
        )
        regional_price  = regional_price_data.get('price')
        regional_source = regional_price_data.get('source', 'unknown')
        if regional_price:
            logger.info(f"  [PRICE] Benchmark: ${regional_price} via {regional_source}")

        saved_count = 0
        for comp in competitors:
            try:
                # Priority 1: Apify per-station (uses ZIP cache — no extra API call!)
                from gasbuddy import APIFY_API_TOKEN, _fetch_from_apify
                if APIFY_API_TOKEN and store_zip:
                    station_data = await _fetch_from_apify(
                        float(comp['lat']), float(comp['lng']),
                        comp['name'], store_zip
                    )
                    if station_data.get('price'):
                        comp['price']        = station_data['price']
                        comp['price_source'] = station_data.get('source', 'apify_gasbuddy')
                        comp['price_source_detail'] = station_data.get('station_name', '')
                    else:
                        comp['price']        = regional_price
                        comp['price_source'] = regional_source
                else:
                    # Priority 2: TomTom (if no Apify token or ZIP)
                    from gasbuddy import TOMTOM_API_KEY, _fetch_from_tomtom
                    if TOMTOM_API_KEY:
                        station_data = await _fetch_from_tomtom(
                            float(comp['lat']), float(comp['lng']), comp['name']
                        )
                        if station_data.get('price'):
                            comp['price']        = station_data['price']
                            comp['price_source'] = 'tomtom'
                        else:
                            comp['price']        = regional_price
                            comp['price_source'] = regional_source
                    else:
                        comp['price']        = regional_price
                        comp['price_source'] = regional_source

                # Save EACH competitor's price to price_history
                if comp.get('price') and comp.get('db_id'):
                    await save_competitor_price(
                        comp_id=comp['db_id'],
                        store_id=store_id,
                        our_price=our_price,
                        comp_price=comp['price'],
                        source=comp['price_source']
                    )
                    saved_count += 1
            except Exception as e:
                logger.warning(f"  Price fetch failed for {comp.get('name', 'unknown')}: {e}")
                comp['price']        = regional_price   # fallback to regional
                comp['price_source'] = regional_source

        logger.info(f"  [PRICE] Saved prices for {saved_count}/{len(competitors)} competitors")

        # Step 3: Compare prices
        comparison_result = await run_price_comparison(
            store=store,
            competitors=competitors
        )

        # Step 4: Save to DB
        await save_price_history(store_id, comparison_result)

        # Step 5: Send alert if needed
        if comparison_result['action'] == 'alert':
            # Load workers for this store (needed for SMS/WhatsApp routing)
            try:
                conn = get_db_connection()
                import psycopg2.extras
                cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cursor.execute(
                    "SELECT * FROM workers WHERE store_id = %s AND active = true",
                    (store_id,)
                )
                workers = cursor.fetchall()
                cursor.close()
                conn.close()
                store['workers'] = [dict(w) for w in workers]
                logger.info(f"  [WORKERS] Loaded {len(workers)} active workers for notifications")
            except Exception as e:
                logger.warning(f"  [WORKERS] Could not load workers: {e}")
                store['workers'] = []

            await send_alert_notification(store, comparison_result)
            await save_alert(store_id, comparison_result)

            # Send email alert for HIGH priority (immediate email in addition to dashboard)
            if comparison_result.get('priority') == 'HIGH':
                try:
                    from notifier import send_daily_summary_email
                    email_body = (
                        f"🚨 HIGH PRIORITY PRICE ALERT\n\n"
                        f"Store: {store.get('name')}\n"
                        f"Our Price: ${comparison_result.get('our_price', 0):.3f}\n"
                        f"Competitor: {comparison_result.get('best_competitor', {}).get('name', 'Unknown')}\n"
                        f"Comp Price: ${comparison_result.get('best_competitor', {}).get('price', 0):.3f}\n"
                        f"Difference: ${comparison_result.get('price_diff', 0):.3f}\n\n"
                        f"Action Required: Lower price immediately to stay competitive.\n"
                        f"Dashboard: https://shorttrip-gas-intelligence.netlify.app/stores/{store_id}\n"
                    )
                    await send_daily_summary_email(email_body)
                    logger.info(f"  [EMAIL] HIGH priority email alert sent")
                except Exception as e:
                    logger.warning(f"  [EMAIL] Alert email failed: {e}")

        logger.info(f"  [OK] Store {store['name']}: {comparison_result['action'].upper()}")
        return comparison_result

    except Exception as e:
        logger.error(f"[ERR] Error in store check {store_id}: {e}")
        raise


# ── Daily Summary Route ───────────────────────────────────────
@app.post("/engine/daily-summary")
async def trigger_daily_summary(background_tasks: BackgroundTasks):
    """Send daily summary email. Called by node-cron at 8 AM EST."""
    background_tasks.add_task(_send_daily_summary)
    return {"status": "triggered", "timestamp": datetime.now().isoformat()}

async def _send_daily_summary():
    try:
        stores = await get_all_stores()
        conn = await get_db_connection()
        results = []

        for store in stores:
            try:
                # Get latest price check for this store
                row = await conn.fetchrow("""
                    SELECT ph.our_price, ph.comp_price, ph.price_diff, ph.status, ph.source,
                           c.name AS comp_name, ph.fetched_at
                    FROM price_history ph
                    LEFT JOIN competitors c ON c.id = ph.comp_id
                    WHERE ph.store_id = $1
                    ORDER BY ph.fetched_at DESC LIMIT 1
                """, store['id'])

                # Get today's alert count
                alert_count = await conn.fetchval("""
                    SELECT COUNT(*) FROM alerts
                    WHERE store_id = $1 AND DATE(created_at) = CURRENT_DATE
                """, store['id'])

                result = {
                    "store_name": store.get("name"),
                    "store_id": store.get("id"),
                    "our_price": float(row['our_price']) if row and row['our_price'] else None,
                    "best_competitor": row['comp_name'] if row else None,
                    "comp_price": float(row['comp_price']) if row and row['comp_price'] else None,
                    "price_diff": float(row['price_diff']) if row and row['price_diff'] else None,
                    "action": row['status'] if row else "skip",
                    "source": row['source'] if row else None,
                    "today_alerts": alert_count or 0,
                }
                results.append(result)
            except Exception as e:
                logger.warning(f"  Daily summary — error for store {store.get('name')}: {e}")
                results.append({"store_name": store.get("name"), "action": "error"})

        await conn.close()
        summary_text = build_daily_summary(results)
        await send_daily_summary_email(summary_text)
        logger.info("[DONE] Daily summary email sent")
    except Exception as e:
        logger.error(f"Daily summary error: {e}")


# ── Manual Notify Route ───────────────────────────────────────
@app.post("/engine/notify")
async def manual_notify(payload: dict):
    """Manually trigger notification for an alert (from dashboard Notify button)."""
    try:
        store_id = payload.get("store_id")
        message  = payload.get("message", "")
        priority = payload.get("priority", "MED")
        stores = await get_all_stores()
        store = next((s for s in stores if s["id"] == store_id), {})
        fake_comparison = {
            "action": "alert",
            "priority": priority,
            "message": message,
            "suppress_notification": False,
            "our_price": store.get("our_price"),
            "best_competitor": {"name": "Manual", "price": 0},
            "price_diff": 0
        }
        result = await send_alert_notification(store, fake_comparison)
        return {"status": "sent", "channels": result}
    except Exception as e:
        logger.error(f"Manual notify error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    port = int(os.getenv("PYTHON_API_PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
