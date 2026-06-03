"""
SHORT TRIP GAS PRICE INTELLIGENCE
shorttrip.com Location Scraper (FREE — BeautifulSoup)
GarudX.AI | June 2026

Scrapes shorttrip.com/locations to keep store data up to date.
Also seeds the DB with all 10 store GPS coordinates.
"""

import httpx
import logging
from bs4 import BeautifulSoup
from typing import Optional

logger = logging.getLogger(__name__)

SHORTTRIP_LOCATIONS_URL = "https://www.shorttrip.com/locations"

# Hardcoded GPS coordinates for all 10 stores (from blueprint)
# These are fallback in case scraping fails or GPS not on website
STORE_GPS_FALLBACK = {
    "614 US-78":          {"lat": 33.09760, "lng": -80.32460, "zip": "29472"},
    "3147 State":         {"lat": 33.10120, "lng": -80.31980, "zip": "29472"},
    "348 College Park":   {"lat": 32.98230, "lng": -80.10120, "zip": "29456"},
    "3880 Patriot":       {"lat": 33.92010, "lng": -80.38760, "zip": "29154"},
    "101 N Hwy 52":       {"lat": 33.19730, "lng": -80.01460, "zip": "29461"},
    "3272 US-52":         {"lat": 33.21450, "lng": -80.02340, "zip": "29461"},
    "117 S Boundary":     {"lat": 33.69530, "lng": -80.21200, "zip": "29102"},
    "3022 Old Hwy 52":    {"lat": 33.20890, "lng": -80.03120, "zip": "29461"},
    "3995 North":         {"lat": 33.50120, "lng": -80.87340, "zip": "29118"},
    "1010 Old Hwy 52":    {"lat": 33.20670, "lng": -80.02780, "zip": "29461"},
}


async def scrape_store_locations() -> list:
    """
    Attempt to scrape store locations from shorttrip.com/locations.
    Falls back to hardcoded data if scrape fails.
    """
    try:
        logger.info("🌐 Scraping shorttrip.com/locations ...")
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(SHORTTRIP_LOCATIONS_URL, headers=headers)
            if resp.status_code == 200:
                stores = _parse_locations_html(resp.text)
                if stores:
                    logger.info(f"  ✅ Scraped {len(stores)} stores from website")
                    return stores
    except Exception as e:
        logger.warning(f"  ⚠️ Scrape failed: {e} — using fallback data")

    # Return hardcoded fallback
    return _get_fallback_stores()


def _parse_locations_html(html: str) -> list:
    """Parse shorttrip.com locations page HTML."""
    soup = BeautifulSoup(html, "html.parser")
    stores = []

    # Try common patterns for location pages
    # Pattern 1: Look for address containers
    location_blocks = (
        soup.find_all(class_=lambda c: c and any(
            x in c.lower() for x in ["location", "store", "station", "address"]
        )) or
        soup.find_all("article") or
        soup.find_all("li", class_=lambda c: c and "location" in (c or "").lower())
    )

    for block in location_blocks:
        text = block.get_text(separator=" ", strip=True)
        if "SC" in text and any(char.isdigit() for char in text):
            store = {
                "name": _extract_store_name(block),
                "address": _extract_address(block),
                "hours": _extract_hours(block),
                "source": "scraped"
            }
            # Enrich with GPS coords
            store = _enrich_with_gps(store)
            if store.get("lat"):
                stores.append(store)

    return stores


def _extract_store_name(block) -> str:
    """Try to extract store name from HTML block."""
    for tag in ["h2", "h3", "h4", "strong", ".name", ".title"]:
        elem = block.find(tag)
        if elem:
            return elem.get_text(strip=True)
    return "Short Trip Gas Station"


def _extract_address(block) -> str:
    """Try to extract address from HTML block."""
    text = block.get_text(separator=", ", strip=True)
    # Look for patterns like "123 Street Name, City, SC XXXXX"
    import re
    match = re.search(r'\d+[^,]+(?:Road|Rd|Street|St|Avenue|Ave|Highway|Hwy|Pkwy|Way|Blvd)[^,]*,\s*[^,]+,\s*SC\s*\d{5}', text, re.IGNORECASE)
    if match:
        return match.group(0).strip()
    return text[:100]  # Fallback: first 100 chars


def _extract_hours(block) -> str:
    """Try to extract hours from HTML block."""
    text = block.get_text(separator=" ", strip=True)
    import re
    match = re.search(r'(?:\d{1,2}(?:am|pm)\s*[-–]\s*\d{1,2}(?:am|pm)|24\s*hours?)', text, re.IGNORECASE)
    if match:
        return match.group(0).strip()
    return ""


def _enrich_with_gps(store: dict) -> dict:
    """Add GPS coordinates by matching address to known stores."""
    address = store.get("address", "").lower()
    for key, gps in STORE_GPS_FALLBACK.items():
        if key.lower() in address or any(
            part.lower() in address
            for part in key.split()
            if len(part) > 3
        ):
            store.update(gps)
            return store

    # Try geocoding via Nominatim (FREE, OpenStreetMap)
    # This runs synchronously as a simple fallback
    return store


async def geocode_address_free(address: str) -> dict:
    """
    Geocode an address using Nominatim (OpenStreetMap) — completely FREE.
    No API key required. Rate limit: 1 request/second.
    """
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": address,
            "format": "json",
            "limit": 1,
            "countrycodes": "us"
        }
        headers = {"User-Agent": "ShortTrip-GarudX-AI/1.0 (contact@garudx.ai)"}

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 200:
                results = resp.json()
                if results:
                    return {
                        "lat": float(results[0]["lat"]),
                        "lng": float(results[0]["lon"]),
                        "source": "nominatim"
                    }
    except Exception as e:
        logger.debug(f"Nominatim geocoding failed: {e}")
    return {}


def _get_fallback_stores() -> list:
    """Return hardcoded store data (from blueprint document)."""
    return [
        {"id": 1, "name": "614 US-78, Ridgeville",        "address": "614 US-78, Ridgeville, SC 29472",         "city": "Ridgeville",    "zip": "29472", "lat": 33.09760, "lng": -80.32460, "hours": "Mon-Sat: 5am-9pm | Sun: 7am-7pm",  "source": "fallback"},
        {"id": 2, "name": "3147 State Rd, Ridgeville",    "address": "3147 State Rd, Ridgeville, SC 29472",     "city": "Ridgeville",    "zip": "29472", "lat": 33.10120, "lng": -80.31980, "hours": "Mon-Sat: 5am-9pm | Sun: 8am-8pm",  "source": "fallback"},
        {"id": 3, "name": "348 College Park Rd, Ladson",  "address": "348 College Park Rd, Ladson, SC 29456",   "city": "Ladson",        "zip": "29456", "lat": 32.98230, "lng": -80.10120, "hours": "24 hours, 7 days",                  "source": "fallback"},
        {"id": 4, "name": "3880 Patriot Pkwy, Sumter",    "address": "3880 Patriot Pkwy, Sumter, SC 29154",     "city": "Sumter",        "zip": "29154", "lat": 33.92010, "lng": -80.38760, "hours": "Mon-Fri: 5am-10pm",                 "source": "fallback"},
        {"id": 5, "name": "101 N Hwy 52, Moncks Corner",  "address": "101 N Hwy 52, Moncks Corner, SC 29461",  "city": "Moncks Corner", "zip": "29461", "lat": 33.19730, "lng": -80.01460, "hours": "5am-12am, 7 days",                  "source": "fallback"},
        {"id": 6, "name": "3272 US-52, Moncks Corner",    "address": "3272 US-52, Moncks Corner, SC 29461",    "city": "Moncks Corner", "zip": "29461", "lat": 33.21450, "lng": -80.02340, "hours": "Mon-Fri: 6am-9pm",                  "source": "fallback"},
        {"id": 7, "name": "117 S Boundary St, Manning",   "address": "117 S Boundary St, Manning, SC 29102",   "city": "Manning",       "zip": "29102", "lat": 33.69530, "lng": -80.21200, "hours": "7am-8pm, 7 days",                   "source": "fallback"},
        {"id": 8, "name": "3022 Old Hwy 52, Moncks Cor.", "address": "3022 Old Hwy 52, Moncks Corner, SC 29461","city": "Moncks Corner", "zip": "29461", "lat": 33.20890, "lng": -80.03120, "hours": "Mon-Sat: 6am-10pm",                 "source": "fallback"},
        {"id": 9, "name": "3995 North Rd, Orangeburg",    "address": "3995 North Rd, Orangeburg, SC 29118",    "city": "Orangeburg",    "zip": "29118", "lat": 33.50120, "lng": -80.87340, "hours": "Mon-Sat: 9am-7pm",                  "source": "fallback"},
        {"id":10, "name": "1010 Old Hwy 52 (Laundromat)", "address": "1010 Old Hwy 52, Moncks Corner, SC 29461","city": "Moncks Corner", "zip": "29461", "lat": 33.20670, "lng": -80.02780, "hours": "7am-10pm, 7 days",                  "source": "fallback"},
    ]
