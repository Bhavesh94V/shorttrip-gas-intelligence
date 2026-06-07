"""
SHORT TRIP GAS PRICE INTELLIGENCE
Gas Price Fetcher — Multi-Source with Automatic Fallbacks
GarudX.AI | June 2026

Price Sources (in order of priority):
  0. GasBuddy GraphQL Direct (custom iOS-app mimicry — per-station real prices)
  1. GasBuddy (py-gasbuddy library — unofficial GraphQL)
  2. TomTom POI Search (station-specific, free 2,500/day)
  3. Waze Live Map (crowdsourced, free)
  4. AAA Daily Fuel Gauge Report (free, US govt-level accuracy)
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

# ── Apify (johnvc/fuelprices) — Real GasBuddy prices by ZIP ─────
# ONE call per ZIP → returns ALL stations → cached 2 hours
APIFY_API_TOKEN  = os.getenv("APIFY_API_TOKEN", "")
APIFY_ACTOR_ID   = os.getenv("APIFY_ACTOR_ID", "johnvc/fuelprices")
APIFY_RUN_URL    = "https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items"

# Apify ZIP-level cache (one call per ZIP, reuse for all competitors in that ZIP)
_apify_zip_cache: dict = {}   # key: zip_code → {stations: [...], fetched_at}
_APIFY_CACHE_TTL_MINUTES = 120  # 2 hours — matches our check frequency

# ── EIA Cache (avoid hammering API per competitor) ─────────────
_eia_cache: dict = {"price": None, "fetched_at": None}
_EIA_CACHE_TTL_HOURS = 3   # refresh every 3 hours

# ── GasBuddy GraphQL Cache (station-level, 30 min TTL) ──────────
_gb_cache: dict = {}          # key: "lat,lng" → {price, fetched_at}
_GB_CACHE_TTL_MINUTES = 30

# GasBuddy GraphQL endpoint + headers (mimics Chrome browser on gasbuddy.com)
_GB_GRAPHQL_URL = "https://www.gasbuddy.com/graphql"
_GB_HEADERS = {
    "User-Agent":                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "apollographql-client-name":     "web",
    "apollographql-client-version":  "2.0.0",
    "Accept":                        "application/json",
    "Content-Type":                  "application/json",
    "Accept-Language":               "en-US,en;q=0.9",
    "Origin":                        "https://www.gasbuddy.com",
    "Referer":                        "https://www.gasbuddy.com/",
    "sec-fetch-dest":                "empty",
    "sec-fetch-mode":                "cors",
    "sec-fetch-site":                "same-origin",
}
_GB_QUERY = """
query LocationBySearchTerm($lat: Float, $lng: Float) {
  locationBySearchTerm(lat: $lat, lng: $lng) {
    stations {
      results {
        id
        name
        latitude
        longitude
        prices {
          credit {
            nickname
            postedTime
            price
          }
          cash {
            nickname
            postedTime
            price
          }
        }
      }
    }
  }
}
"""


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

    # ─── Priority 0: Apify (johnvc/fuelprices) ─────────────────────────────
    # ONE Apify call per ZIP → all competitors in that ZIP get REAL prices from cache
    if zip_code and APIFY_API_TOKEN:
        result = await _try(
            _fetch_from_apify(lat, lng, station_name, zip_code),
            "Apify-GasBuddy"
        )
        if result:
            return result

    # 0 — GasBuddy GraphQL Direct (custom iOS-app mimicry — per-station real prices)
    result = await _try(
        _fetch_from_gasbuddy_graphql(lat, lng, station_name),
        "GasBuddy-GraphQL"
    )
    if result:
        return result

    # 1 — TomTom Fuel Prices (station-specific prices, free 2,500/day)
    if TOMTOM_API_KEY:
        result = await _try(
            _fetch_from_tomtom(lat, lng, station_name),
            "TomTom"
        )
        if result:
            return result

    # 2 — py-gasbuddy (unofficial GraphQL)
    if GASBUDDY_AVAILABLE:
        result = await _try(
            _fetch_from_gasbuddy(lat, lng, zip_code),
            "GasBuddy"
        )
        if result:
            return result

    # 3 — Waze crowdsourced prices
    result = await _try(_fetch_from_waze(lat, lng), "Waze")
    if result:
        return result

    # 4 — AAA Daily Fuel Gauge (free, reliable state-level data)
    result = await _try(_fetch_from_aaa(), "AAA")
    if result:
        return result

    # 5 — EIA.gov official government data (cached) — ALWAYS works
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

async def _fetch_from_apify_zip(zip_code: str) -> list:
    """
    Fetch ALL gas station prices in a ZIP code via Apify (johnvc/fuelprices).
    ONE call per ZIP — results cached 2 hours.
    Returns list of station dicts: [{name, address, credit, cash, ...}]
    """
    global _apify_zip_cache

    # Return from cache if fresh
    if zip_code in _apify_zip_cache:
        cached = _apify_zip_cache[zip_code]
        age = datetime.now() - cached["fetched_at"]
        if age < timedelta(minutes=_APIFY_CACHE_TTL_MINUTES):
            logger.debug(f"  [Apify] Cache hit for ZIP {zip_code} ({len(cached['stations'])} stations)")
            return cached["stations"]

    if not APIFY_API_TOKEN:
        return []

    url = APIFY_RUN_URL.format(actor=APIFY_ACTOR_ID.replace("/", "~"))
    params = {
        "token": APIFY_API_TOKEN,
        "memory": 128,        # minimum RAM (cheapest run)
        "timeout": 120,       # max 2 min per run
    }
    payload = {"search": zip_code, "fuel": 1, "maxAge": 0}

    try:
        # Apify sync run can take 30-60 seconds — use generous timeout
        async with httpx.AsyncClient(timeout=130, follow_redirects=True) as client:
            logger.info(f"  [Apify] Calling API for ZIP {zip_code}...")
            resp = await client.post(url, json=payload, params=params)

            if resp.status_code not in (200, 201):
                logger.debug(f"  [Apify] HTTP {resp.status_code} for ZIP {zip_code}")
                return []

            stations = resp.json()
            if not isinstance(stations, list):
                stations = []

            # Store in cache
            _apify_zip_cache[zip_code] = {
                "stations": stations,
                "fetched_at": datetime.now()
            }
            logger.info(f"  [Apify] ✅ ZIP {zip_code}: {len(stations)} stations fetched")
            return stations

    except Exception as e:
        logger.debug(f"  [Apify] ZIP {zip_code} error: {e}")
        return []


async def _fetch_from_apify(
    lat: float, lng: float,
    station_name: Optional[str] = None,
    zip_code: Optional[str] = None
) -> dict:
    """
    Match a specific competitor station with Apify ZIP price data.
    Uses cached ZIP data — no extra API calls if ZIP already fetched.
    """
    if not zip_code or not APIFY_API_TOKEN:
        return {}

    stations = await _fetch_from_apify_zip(zip_code)
    if not stations:
        return {}

    # ── Try name-based fuzzy match ────────────────────────────────
    if stations and not hasattr(_fetch_from_apify, '_logged_zip'):
        # Log schema once (already logged per ZIP in _fetch_from_apify_zip)
        pass  # Schema logged above in ZIP fetch

    def _extract_price(s):
        """
        Apify johnvc/fuelprices returns: price_credit, price_cash (with underscore).
        Also try legacy field names for robustness.
        """
        # Primary Apify fields (price_credit, price_cash)
        raw = (
            s.get("price_credit") or s.get("price_cash") or
            s.get("regular") or s.get("credit") or s.get("price") or
            s.get("cash") or s.get("regularPrice") or s.get("price_regular") or
            s.get("gasolinePrice") or s.get("unleaded") or s.get("fuelPrice")
        )

        # Nested prices dict: {"prices": {"regular": 3.58}}
        if raw is None:
            nested = s.get("prices") or s.get("fuelPrices") or s.get("gasPrices")
            if isinstance(nested, dict):
                raw = (nested.get("regular") or nested.get("credit") or
                       nested.get("price") or (list(nested.values())[0] if nested else None))
            elif isinstance(nested, list):
                for item in nested:
                    if isinstance(item, dict):
                        ft = (item.get("fuelType") or item.get("type") or "").lower()
                        if "regular" in ft or "unleaded" in ft or ft == "":
                            raw = item.get("price") or item.get("value") or item.get("amount")
                            if raw:
                                break

        if raw is None:
            return None
        if isinstance(raw, str):
            raw = raw.replace("$", "").replace(",", "").strip()
        try:
            val = float(raw)
            return val if 2.0 < val < 8.0 else None
        except (TypeError, ValueError):
            return None

    if station_name:
        name_words = [w for w in station_name.lower().split() if len(w) > 3]
        for station in stations:
            s_name = (station.get("name") or "").lower()
            if any(word in s_name for word in name_words):
                price_float = _extract_price(station)
                if price_float:
                    logger.info(
                        f"  [Apify] ✅ Matched '{station.get('name')}' → ${price_float}"
                    )
                    return {
                        "price":        price_float,
                        "source":       "apify_gasbuddy",
                        "station_name": station.get("name", ""),
                        "fuel_type":    "regular",
                        "posted_time":  station.get("lastUpdated", ""),
                        "last_updated": datetime.now().isoformat()
                    }

    # ── Fallback: nearest station with valid price ─────────────────
    import math
    def _dist(s):
        # Apify uses 'lat'/'lng' or 'latitude'/'longitude'
        slat = float(s.get("lat") or s.get("latitude") or lat)
        slng = float(s.get("lng") or s.get("longitude") or lng)
        return math.sqrt((slat - lat) ** 2 + (slng - lng) ** 2)

    for station in sorted(stations, key=_dist)[:5]:
        price_float = _extract_price(station)
        if price_float:
            logger.info(
                f"  [Apify] ✅ Nearest match '{station.get('name')}' → ${price_float}"
            )
            return {
                "price":        price_float,
                "source":       "apify_gasbuddy_nearest",
                "station_name": station.get("name", ""),
                "fuel_type":    "regular",
                "posted_time":  station.get("lastUpdated", ""),
                "last_updated": datetime.now().isoformat()
            }

    return {}


async def _fetch_from_gasbuddy_graphql(
    lat: float, lng: float, station_name: str = None
) -> dict:
    """
    Custom GasBuddy GraphQL scraper — mimics iOS GasBuddy 7.2.0 app.
    Returns per-station real crowdsourced prices.
    Falls back gracefully if blocked (returns {}).
    """
    # Check cache first
    cache_key = f"{lat:.4f},{lng:.4f}"
    if cache_key in _gb_cache:
        cached = _gb_cache[cache_key]
        age = datetime.now() - cached["fetched_at"]
        if age < timedelta(minutes=_GB_CACHE_TTL_MINUTES):
            logger.debug(f"  [GB-GQL] Cache hit for {cache_key}")
            return cached["data"]

    payload = {
        "operationName": "LocationBySearchTerm",
        "variables": {
            "lat": lat,
            "lng": lng
        },
        "query": _GB_QUERY
    }

    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
            resp = await client.post(
                _GB_GRAPHQL_URL,
                json=payload,
                headers=_GB_HEADERS
            )

            if resp.status_code != 200:
                logger.debug(f"  [GB-GQL] HTTP {resp.status_code} — blocked or unavailable")
                return {}

            data = resp.json()

            # Navigate GraphQL response
            stations_data = (
                data.get("data", {})
                    .get("locationBySearchTerm", {})
                    .get("stations", {})
                    .get("results", [])
            )

            if not stations_data:
                logger.debug("  [GB-GQL] No stations in response")
                return {}

            # Find closest station with a valid price
            import math
            def _dist(s):
                slat = s.get("latitude") or lat
                slng = s.get("longitude") or lng
                return math.sqrt((slat - lat)**2 + (slng - lng)**2)

            stations_sorted = sorted(stations_data, key=_dist)

            for station in stations_sorted[:5]:  # Try top 5 nearest
                prices = station.get("prices", {})
                # Prefer credit price, fallback to cash
                price_obj = prices.get("credit") or prices.get("cash")
                if not price_obj:
                    continue
                price_val = price_obj.get("price")
                if not price_val:
                    continue
                try:
                    price_float = float(price_val)
                except (TypeError, ValueError):
                    continue
                if not (2.0 < price_float < 8.0):  # Sanity check
                    continue

                result = {
                    "price":        price_float,
                    "source":       "gasbuddy_graphql",
                    "station_name": station.get("name", "Unknown"),
                    "station_id":   station.get("id", ""),
                    "fuel_type":    "regular",
                    "posted_by":    price_obj.get("nickname", "anonymous"),
                    "posted_time":  price_obj.get("postedTime", ""),
                    "last_updated": datetime.now().isoformat()
                }

                # Cache the result
                _gb_cache[cache_key] = {
                    "data": result,
                    "fetched_at": datetime.now()
                }
                logger.info(
                    f"  [GB-GQL] ✅ Real price: ${price_float} "
                    f"@ {station.get('name', '?')} (posted: {price_obj.get('postedTime', '?')})"
                )
                return result

    except Exception as e:
        logger.debug(f"  [GB-GQL] Exception: {e}")

    return {}

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
