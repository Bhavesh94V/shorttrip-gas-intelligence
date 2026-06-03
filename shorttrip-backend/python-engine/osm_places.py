"""
SHORT TRIP GAS PRICE INTELLIGENCE
Competitor Finder — OpenStreetMap Overpass API (100% FREE, No API Key)
Replaces Google Maps Places API entirely.
GarudX.AI | June 2026

Uses: https://overpass-api.de/api/interpreter
- Completely free
- No API key required
- No credit card needed
- Finds all gas stations within any radius
"""

import httpx
import asyncio
import logging
import math
from typing import Optional

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT = 30  # seconds


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in miles between two GPS coordinates."""
    R = 3958.8  # Earth radius in miles
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def miles_to_meters(miles: float) -> int:
    """Convert miles to meters for Overpass API."""
    return int(miles * 1609.34)


async def find_competitors_nearby(
    lat: float,
    lng: float,
    radius_miles: float = 2.0,
    store_name: Optional[str] = None
) -> list:
    """
    Find nearby gas/fuel stations using OpenStreetMap Overpass API.
    Completely FREE — no API key, no credit card.

    Args:
        lat: Store latitude
        lng: Store longitude
        radius_miles: Search radius (configurable from dashboard)
        store_name: Short Trip store name (to exclude itself)

    Returns:
        List of competitor dicts with name, address, lat, lng, distance_mi
    """
    radius_miles = float(radius_miles)
    lat = float(lat)
    lng = float(lng)
    radius_meters = miles_to_meters(radius_miles)

    # Overpass QL query to find all fuel/gas stations within radius
    query = f"""
    [out:json][timeout:{OVERPASS_TIMEOUT}];
    (
      node["amenity"="fuel"](around:{radius_meters},{lat},{lng});
      way["amenity"="fuel"](around:{radius_meters},{lat},{lng});
      node["shop"="gas"](around:{radius_meters},{lat},{lng});
    );
    out center tags;
    """

    try:
        logger.info(f"  🗺️  Searching for competitors within {radius_miles} miles via OpenStreetMap...")

        async with httpx.AsyncClient(timeout=OVERPASS_TIMEOUT + 5) as client:
            resp = await client.post(
                OVERPASS_URL,
                content=f"data={query}",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "ShortTripGasIntelligence/1.0",
                    "Accept": "application/json"
                }
            )
            resp.raise_for_status()
            data = resp.json()

        competitors = []
        elements = data.get("elements", [])
        logger.info(f"  Found {len(elements)} stations in OSM data")

        for elem in elements:
            tags = elem.get("tags", {})

            # Get coordinates (node vs way)
            if elem["type"] == "node":
                comp_lat = elem.get("lat", 0)
                comp_lng = elem.get("lon", 0)
            else:  # way with center
                center = elem.get("center", {})
                comp_lat = center.get("lat", 0)
                comp_lng = center.get("lon", 0)

            if not comp_lat or not comp_lng:
                continue

            # Calculate actual distance
            distance = haversine_distance(lat, lng, comp_lat, comp_lng)

            # Skip if too far (double-check)
            if distance > radius_miles + 0.1:
                continue

            # Get station name (use brand or name)
            station_name = (
                tags.get("brand") or
                tags.get("name") or
                tags.get("operator") or
                "Unknown Station"
            )

            # Skip if it's a Short Trip station itself
            if store_name and "short trip" in station_name.lower():
                continue

            # Build address
            address_parts = []
            if tags.get("addr:housenumber"):
                address_parts.append(tags["addr:housenumber"])
            if tags.get("addr:street"):
                address_parts.append(tags["addr:street"])
            if tags.get("addr:city"):
                address_parts.append(tags["addr:city"])
            if tags.get("addr:state"):
                address_parts.append(tags["addr:state"])
            address = ", ".join(address_parts) if address_parts else "Address not available"

            competitors.append({
                "osm_id": elem.get("id"),
                "name": station_name,
                "brand": tags.get("brand", station_name),
                "address": address,
                "lat": comp_lat,
                "lng": comp_lng,
                "distance_mi": round(distance, 2),
                "zip": tags.get("addr:postcode", ""),
                "phone": tags.get("phone", ""),
                "fuel_types": _parse_fuel_types(tags),
                "source": "openstreetmap"
            })

        # Sort by distance (closest first)
        competitors.sort(key=lambda x: x["distance_mi"])

        logger.info(f"  ✅ {len(competitors)} competitor stations found within {radius_miles} miles")
        return competitors

    except httpx.TimeoutException:
        logger.error("  [ERR] OpenStreetMap API timeout -- trying backup...")
        return await _overpass_backup_endpoint(lat, lng, radius_meters, radius_miles, store_name)
    except Exception as e:
        logger.error(f"  [ERR] OpenStreetMap error: {e}")
        logger.info("  Trying backup Overpass mirrors...")
        return await _overpass_backup_endpoint(lat, lng, radius_meters, radius_miles, store_name)


async def _overpass_backup_endpoint(lat: float, lng: float, radius_meters: int, radius_miles: float = 3.0, store_name: str = None) -> list:
    """Use backup Overpass API mirror if main endpoint fails."""
    BACKUP_URLS = [
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.openstreetmap.ru/api/interpreter",
    ]
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="fuel"](around:{radius_meters},{lat},{lng});
      way["amenity"="fuel"](around:{radius_meters},{lat},{lng});
    );
    out center tags;
    """
    for url in BACKUP_URLS:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    url,
                    content=f"data={query}",
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "User-Agent": "ShortTripGasIntelligence/1.0",
                        "Accept": "application/json"
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    elements = data.get("elements", [])
                    logger.info(f"  [OK] Backup OSM ({url.split('/')[2]}) found {len(elements)} stations")
                    parsed = _parse_elements(elements, lat, lng)
                    # Filter out Short Trip stores
                    if store_name:
                        parsed = [c for c in parsed if "short trip" not in c.get("name", "").lower()]
                    return parsed
                else:
                    logger.warning(f"  Backup {url.split('/')[2]} returned {resp.status_code}")
        except Exception as e:
            logger.warning(f"  Backup {url.split('/')[2]} failed: {e}")
    logger.error("  [ERR] All Overpass mirrors failed. No competitor data.")
    return []


def _parse_elements(elements: list, ref_lat: float, ref_lng: float) -> list:
    """Parse Overpass API elements into competitor dicts."""
    result = []
    for elem in elements:
        tags = elem.get("tags", {})
        comp_lat = float(elem.get("lat", 0))
        comp_lng = float(elem.get("lon", 0))
        if not comp_lat or not comp_lng:
            continue
        distance = haversine_distance(ref_lat, ref_lng, comp_lat, comp_lng)
        result.append({
            "osm_id": elem.get("id"),
            "name": tags.get("brand") or tags.get("name") or "Unknown",
            "brand": tags.get("brand", ""),
            "address": tags.get("addr:full", ""),
            "lat": comp_lat,
            "lng": comp_lng,
            "distance_mi": round(distance, 2),
            "zip": tags.get("addr:postcode", ""),
            "fuel_types": _parse_fuel_types(tags),
            "source": "openstreetmap_backup"
        })
    return sorted(result, key=lambda x: x["distance_mi"])


def _parse_fuel_types(tags: dict) -> list:
    """Parse available fuel types from OSM tags."""
    fuel_types = []
    if tags.get("fuel:octane_87") == "yes":
        fuel_types.append("regular")
    if tags.get("fuel:octane_89") == "yes":
        fuel_types.append("midgrade")
    if tags.get("fuel:octane_91") == "yes" or tags.get("fuel:octane_93") == "yes":
        fuel_types.append("premium")
    if tags.get("fuel:diesel") == "yes":
        fuel_types.append("diesel")
    if not fuel_types:
        fuel_types = ["regular"]  # Default assumption
    return fuel_types
