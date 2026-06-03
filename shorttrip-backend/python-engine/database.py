"""
SHORT TRIP GAS PRICE INTELLIGENCE
Database Connection & Query Helpers
GarudX.AI | June 2026
"""

import os
import ssl
import logging
import psycopg2
import psycopg2.extras
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/shorttrip_db")
IS_SUPABASE  = "supabase.com" in DATABASE_URL


def _get_connect_kwargs() -> dict:
    """Build psycopg2 connect kwargs with SSL for Supabase."""
    kwargs = {"dsn": DATABASE_URL}
    if IS_SUPABASE:
        kwargs["sslmode"] = "require"
    return kwargs


def get_db_connection():
    """Get a raw psycopg2 connection."""
    try:
        conn = psycopg2.connect(**_get_connect_kwargs())
        return conn
    except Exception as e:
        logger.error(f"DB connection failed: {e}")
        raise


async def get_all_stores() -> list:
    """Fetch all active Short Trip stores."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute("""
            SELECT s.*, 
                   array_agg(
                       json_build_object(
                           'id', w.id,
                           'name', w.name,
                           'phone', w.phone,
                           'channel', w.channel,
                           'active', w.active
                       )
                   ) FILTER (WHERE w.id IS NOT NULL) as workers
            FROM stores s
            LEFT JOIN workers w ON w.store_id = s.id AND w.active = true
            WHERE s.active = true
            GROUP BY s.id
            ORDER BY s.id
        """)
        stores = [dict(row) for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        return stores
    except Exception as e:
        logger.error(f"get_all_stores error: {e}")
        return []


async def get_store_by_id(store_id: int) -> Optional[dict]:
    """Fetch a single store with its workers."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute("""
            SELECT s.*,
                   array_agg(
                       json_build_object(
                           'id', w.id, 'name', w.name,
                           'phone', w.phone, 'channel', w.channel,
                           'active', w.active
                       )
                   ) FILTER (WHERE w.id IS NOT NULL) as workers
            FROM stores s
            LEFT JOIN workers w ON w.store_id = s.id AND w.active = true
            WHERE s.id = %s
            GROUP BY s.id
        """, (store_id,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"get_store_by_id error: {e}")
        return None


async def get_competitors_from_db(store_id: int) -> list:
    """Load cached competitors from DB for a store.
    Used as fallback when OSM API fails or returns 0 results.
    Returns competitors in same format as find_competitors_nearby().
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute("""
            SELECT
                c.id AS db_id,
                c.name,
                c.brand,
                c.address,
                c.lat,
                c.lng,
                c.distance_mi,
                c.place_id,
                ph.comp_price AS price,
                ph.source     AS price_source
            FROM competitors c
            LEFT JOIN LATERAL (
                SELECT comp_price, source
                FROM price_history
                WHERE comp_id = c.id
                ORDER BY fetched_at DESC
                LIMIT 1
            ) ph ON true
            WHERE c.store_id = %s
            ORDER BY c.distance_mi ASC
        """, (store_id,))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_competitors_from_db error: {e}")
        return []


async def save_price_history(store_id: int, comparison: dict) -> bool:
    """Save a price check result to price_history table."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        best_comp = comparison.get("best_competitor") or {}
        cursor.execute("""
            INSERT INTO price_history 
                (store_id, comp_id, our_price, comp_price, price_diff, source, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            store_id,
            best_comp.get("db_id"),
            comparison.get("our_price"),
            best_comp.get("price"),
            comparison.get("price_diff"),
            best_comp.get("price_source", "unknown"),
            comparison.get("action", "skip")
        ))
        conn.commit()
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"save_price_history error: {e}")
        return False


async def save_competitor_price(comp_id: int, store_id: int, our_price: float, comp_price: float, source: str = "unknown") -> bool:
    """Save or update an individual competitor's price in price_history.
    Called for EVERY competitor so dashboard shows each station's price.
    Uses UPDATE if recent record exists (< 3 hours), else INSERT.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Check if there's a recent record (< 3 hours)
        cursor.execute("""
            SELECT id FROM price_history
            WHERE comp_id = %s
              AND fetched_at > NOW() - INTERVAL '3 hours'
            ORDER BY fetched_at DESC
            LIMIT 1
        """, (comp_id,))
        existing = cursor.fetchone()
        if existing:
            # Update price if it changed
            cursor.execute("""
                UPDATE price_history
                SET comp_price = %s, source = %s, fetched_at = NOW()
                WHERE id = %s
            """, (comp_price, source, existing[0]))
        else:
            cursor.execute("""
                INSERT INTO price_history
                    (store_id, comp_id, our_price, comp_price, price_diff, source, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'ok')
            """, (
                store_id,
                comp_id,
                our_price,
                comp_price,
                round(float(comp_price or 0) - float(our_price or 0), 3),
                source
            ))
        conn.commit()
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"save_competitor_price error: {e}")
        return False


async def save_alert(store_id: int, comparison: dict) -> bool:
    """Save an alert record to alerts table."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        best_comp = comparison.get("best_competitor") or {}
        cursor.execute("""
            INSERT INTO alerts
                (store_id, comp_id, comp_name, our_price, comp_price, price_diff, priority, channel, message, sent, sent_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            store_id,
            best_comp.get("db_id"),
            best_comp.get("name"),           # comp_name (denormalized)
            comparison.get("our_price"),
            best_comp.get("price"),
            comparison.get("price_diff"),    # was abs_diff / diff — now price_diff
            comparison.get("priority", "MED"),
            "dashboard",
            comparison.get("message", ""),
            True,
            datetime.now()
        ))
        conn.commit()
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"save_alert error: {e}")
        return False


async def upsert_competitors(store_id: int, competitors: list) -> list:
    """Insert or update competitor records, return with DB IDs."""
    result = []
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        for comp in competitors:
            place_id = str(comp.get("osm_id", f"osm_{comp.get('lat')}_{comp.get('lng')}"))
            # Check if competitor already exists
            cursor.execute(
                "SELECT id FROM competitors WHERE store_id = %s AND place_id = %s",
                (store_id, place_id)
            )
            existing = cursor.fetchone()
            if existing:
                # Update existing
                cursor.execute("""
                    UPDATE competitors
                    SET name = %s, distance_mi = %s, lat = %s, lng = %s, active = true
                    WHERE id = %s
                    RETURNING id
                """, (
                    comp.get("name"),
                    comp.get("distance_mi"),
                    comp.get("lat"),
                    comp.get("lng"),
                    existing["id"]
                ))
                comp["db_id"] = existing["id"]
            else:
                # Insert new
                cursor.execute("""
                    INSERT INTO competitors
                        (store_id, name, brand, address, lat, lng, distance_mi, place_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    store_id,
                    comp.get("name"),
                    comp.get("brand", comp.get("name")),
                    comp.get("address"),
                    comp.get("lat"),
                    comp.get("lng"),
                    comp.get("distance_mi"),
                    place_id
                ))
                row = cursor.fetchone()
                comp["db_id"] = row["id"] if row else None
            result.append(comp)
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        logger.error(f"upsert_competitors error: {e}")
    return result


async def get_setting(key: str, default: str = "") -> str:
    """Get a system setting from DB."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = %s", (key,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return row[0] if row else default
    except Exception as e:
        logger.error(f"get_setting error: {e}")
        return default
