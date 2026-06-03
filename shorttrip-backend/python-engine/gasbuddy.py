"""
SHORT TRIP GAS PRICE INTELLIGENCE
Gas Price Fetcher — Multi-Source with Automatic Fallbacks
GarudX.AI | June 2026

Price Sources (in order of priority):
  1. GasBuddy (py-gasbuddy library — unofficial GraphQL)
  2. Waze Live Map (crowdsourced, free)
  3. AAA Daily Fuel Gauge Report (free, US govt-level accuracy)
  4. MyGasFeed (if available)
  5. EIA.gov (official US gov weekly average — ALWAYS works)

All sources are FREE. No paid API keys required.
"""

import asyncio
import logging
import os
import re
import json
from typing import Optional
from datetime import datetime, timedelta

import httpx

logger = logging.getLogger(__name__)

# ── py-gasbuddy ────────────────────────────────────────────────
try:
    from gasbuddy import GasBuddy
    GASBUDDY_AVAILABLE = True
except ImportError:
    GASBUDDY_AVAILABLE = False
    logger.warning("[WARN] py-gasbuddy not installed. Run: pip install py-gasbuddy")

# ── EIA.gov Config ─────────────────────────────────────────────
EIA_API_KEY     = os.getenv("EIA_API_KEY", "")
EIA_BASE_URL    = "https://api.eia.gov/v2/petroleum/pri/gnd/data/"
EIA_SC_AREA     = "R30"   # South Atlantic region (includes SC)

# TomTom Search API (free: 2,500 req/day) — US works!
# Used to find POI fuel stations with price data
TOMTOM_API_KEY   = os.getenv("TOMTOM_API_KEY", "")
TOMTOM_SEARCH_URL = "https://api.tomtom.com/search/2/nearbySearch/.json"

# ── EIA Cache (avoid hammering API per competitor) ─────────────
_eia_cache: dict = {"price": None, "fetched_at": None}
_EIA_CACHE_TTL_HOURS = 3   # refresh every 3 hours


# ══════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════

async def fetch_gasbuddy_prices(
    lat: float,
    lng: float,
    station_name: Optional[str] = None,
    zip_code: Optional[str] = None
) -> dict:
    """
    Fetch gas price for a competitor station.
    Tries multiple sources automatically.

    Returns:
        {"price": 3.25, "source": "eia_gov", "fuel_type": "regular", ...}
    """
    lat = float(lat)
    lng = float(lng)

    # 0 — TomTom Fuel Prices (station-specific prices, free 2,500/day)
    if TOMTOM_API_KEY:
        result = await _try(
            _fetch_from_tomtom(lat, lng, station_name),
            "TomTom"
        )
        if result:
            return result

    # 1 — py-gasbuddy (unofficial GraphQL)
    if GASBUDDY_AVAILABLE:
        result = await _try(
            _fetch_from_gasbuddy(lat, lng, zip_code),
            "GasBuddy"
        )
        if result:
            return result

    # 2 — Waze crowdsourced prices
    result = await _try(_fetch_from_waze(lat, lng), "Waze")
    if result:
        return result

    # 3 — AAA Daily Fuel Gauge (free, reliable state-level data)
    result = await _try(_fetch_from_aaa(), "AAA")
    if result:
        return result

    # 4 — EIA.gov official government data (cached)
    result = await _try(_fetch_from_eia(), "EIA.gov")
    if result:
        return result

    logger.warning(f"  [WARN] All price sources failed for {station_name or f'{lat},{lng}'}")
    return {"price": None, "source": "unavailable", "error": "All sources failed"}


async def batch_fetch_prices(competitors: list) -> list:
    """Fetch prices for multiple competitors concurrently."""
    tasks = [
        fetch_gasbuddy_prices(
            lat=c.get("lat", 0),
            lng=c.get("lng", 0),
            station_name=c.get("name"),
            zip_code=c.get("zip")
        )
        for c in competitors
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            competitors[i]["price"] = None
            competitors[i]["price_source"] = "error"
        else:
            competitors[i]["price"] = result.get("price")
            competitors[i]["price_source"] = result.get("source", "unknown")
    return competitors


# ══════════════════════════════════════════════════════════════════
# PRICE SOURCES
# ══════════════════════════════════════════════════════════════════

async def _fetch_from_tomtom(lat: float, lng: float, station_name: Optional[str] = None) -> dict:
    """
    Fetch fuel price via TomTom Search API (POI nearby search).
    Free tier: 2,500 requests/day. Works in US!
    Finds nearby fuel stations and extracts price from POI additionalData.
    """
    if not TOMTOM_API_KEY:
        return {}
    params = {
        "lat":           lat,
        "lon":           lng,
        "radius":        8000,    # 5 miles in meters
        "categorySet":   7311,    # Petrol/Gas Station category
        "limit":         20,
        "key":           TOMTOM_API_KEY
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(TOMTOM_SEARCH_URL, params=params)
        if resp.status_code != 200:
            logger.debug(f"TomTom Search {resp.status_code}: {resp.text[:200]}")
            return {}
        results = resp.json().get("results", [])
        if not results:
            return {}

        # Try to match station name
        best = None
        if station_name:
            name_lower = station_name.lower()
            for r in results:
                poi_name = (r.get("poi", {}).get("name") or "").lower()
                if any(w in poi_name for w in name_lower.split() if len(w) > 3):
                    best = r
                    break
        if not best:
            best = results[0]

        # Check additionalData for price
        for item in best.get("dataSources", {}).get("additionalData", []):
            if "price" in str(item).lower() or "fuel" in str(item).lower():
                try:
                    price_val = float(str(item.get("value", "")).replace("$", ""))
                    if 2.0 < price_val < 8.0:
                        return {
                            "price": price_val,
                            "source": "tomtom_search",
                            "station_name": best.get("poi", {}).get("name", ""),
                            "last_updated": datetime.now().isoformat()
                        }
                except Exception:
                    pass
    return {}


async def _fetch_from_gasbuddy(lat: float, lng: float, zip_code: Optional[str] = None) -> dict:
    """Fetch using py-gasbuddy library (unofficial GasBuddy GraphQL API)."""
    gb = GasBuddy()
    if zip_code:
        stations = await gb.get_gas_prices(zip_code=zip_code)
    else:
        stations = await gb.get_gas_prices(lat=lat, lng=lng)
    if not stations:
        return {}
    for station in stations[:5]:
        price = station.get("price") or station.get("regular_price")
        if price:
            return {
                "price": float(price),
                "source": "gasbuddy",
                "station_name": station.get("name", "Unknown"),
                "fuel_type": "regular",
                "last_updated": station.get("updated_at", datetime.now().isoformat()),
                "place_id": station.get("id", "")
            }
    return {}


async def _fetch_from_waze(lat: float, lng: float) -> dict:
    """Fetch crowdsourced gas prices from Waze Live Map API."""
    url = "https://www.waze.com/live-map/api/georss"
    params = {
        "top":    lat + 0.02,
        "bottom": lat - 0.02,
        "left":   lng - 0.02,
        "right":  lng + 0.02,
        "ma": 600,
        "types": "gas_prices",
        "format": "JSON"
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.waze.com/",
        "Accept": "application/json"
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params=params, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            prices = (data or {}).get("gas_prices", [])
            if prices:
                price_val = prices[0].get("price")
                if price_val:
                    return {
                        "price": float(price_val) / 1000,
                        "source": "waze",
                        "fuel_type": "regular",
                        "last_updated": datetime.now().isoformat()
                    }
    return {}


async def _fetch_from_aaa() -> dict:
    """
    Fetch gas prices from AAA Daily Fuel Gauge Report.
    AAA publishes FREE daily state-level averages.
    URL: https://gasprices.aaa.com/
    """
    try:
        url = "https://gasprices.aaa.com/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml",
        }
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                html = resp.text
                # Look for South Carolina price in the page
                # AAA embeds JSON data or has a structured format
                # Pattern: "South Carolina" followed by price
                sc_match = re.search(
                    r'South Carolina[^$]*\$([\d]+\.[\d]{2,3})',
                    html, re.IGNORECASE
                )
                if sc_match:
                    price = float(sc_match.group(1))
                    if 2.0 < price < 8.0:  # sanity check
                        return {
                            "price": price,
                            "source": "aaa_gas_prices",
                            "fuel_type": "regular",
                            "note": "South Carolina state daily average from AAA",
                            "last_updated": datetime.now().isoformat()
                        }
                # Fallback: try to find any US avg price
                avg_match = re.search(
                    r'National Average[^$]*\$([\d]+\.[\d]{2,3})',
                    html, re.IGNORECASE
                )
                if avg_match:
                    price = float(avg_match.group(1))
                    if 2.0 < price < 8.0:
                        return {
                            "price": price,
                            "source": "aaa_national_avg",
                            "fuel_type": "regular",
                            "note": "US National average from AAA",
                            "last_updated": datetime.now().isoformat()
                        }
    except Exception as e:
        logger.debug(f"AAA fetch error: {e}")
    return {}


async def _fetch_from_eia() -> dict:
    """
    Fetch official weekly average from EIA.gov (US Government).
    Uses caching to avoid repeated calls during a single run.
    """
    global _eia_cache

    # Return cached result if fresh
    if _eia_cache["price"] and _eia_cache["fetched_at"]:
        age = datetime.now() - _eia_cache["fetched_at"]
        if age < timedelta(hours=_EIA_CACHE_TTL_HOURS):
            return {
                "price": _eia_cache["price"],
                "source": "eia_gov_cached",
                "fuel_type": "regular",
                "note": "South Atlantic weekly average (cached)",
                "last_updated": _eia_cache["fetched_at"].isoformat()
            }

    try:
        params = {
            "api_key": EIA_API_KEY if EIA_API_KEY else "DEMO_KEY",
            "frequency": "weekly",
            "data[0]": "value",
            "facets[product][]": "EPM0",    # Regular gasoline
            "facets[duoarea][]": EIA_SC_AREA,
            "sort[0][column]": "period",
            "sort[0][direction]": "desc",
            "length": 1,
            "offset": 0
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(EIA_BASE_URL, params=params)
            if resp.status_code == 200:
                data    = resp.json()
                records = data.get("response", {}).get("data", [])
                if records:
                    price = float(records[0].get("value", 0))
                    # Update cache
                    _eia_cache = {"price": price, "fetched_at": datetime.now()}
                    return {
                        "price": price,
                        "source": "eia_gov",
                        "fuel_type": "regular",
                        "note": "South Carolina regional weekly average (official US govt data)",
                        "period": records[0].get("period", ""),
                        "last_updated": datetime.now().isoformat()
                    }
    except Exception as e:
        logger.debug(f"EIA.gov fetch error: {e}")

    return {}


# ══════════════════════════════════════════════════════════════════
# HELPER
# ══════════════════════════════════════════════════════════════════

async def _try(coro, source_name: str) -> Optional[dict]:
    """Safely await a price source coroutine. Returns None on failure."""
    try:
        result = await coro
        if result and result.get("price"):
            logger.info(f"  [OK] {source_name} price: ${result['price']}")
            return result
    except Exception as e:
        logger.debug(f"  {source_name} error: {e}")
    return None
