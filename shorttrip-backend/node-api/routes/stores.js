/**
 * Stores Routes
 * GET    /api/stores              — All 10 stores with latest price data
 * GET    /api/stores/:id          — Single store with competitor list
 * PATCH  /api/stores/:id/price    — Update our current gas price (manual)
 */
const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// GET /api/stores — All stores with latest price snapshot
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        s.id, s.name, s.address, s.city, s.zip,
        s.lat, s.lng, s.hours, s.phone, s.our_price, s.active,
        -- Latest price check result for this store
        ph.comp_price       AS best_comp_price,
        ph.price_diff,
        ph.status           AS price_status,
        ph.source           AS price_source,
        ph.fetched_at       AS last_checked,
        -- Best competitor name
        c.name              AS best_comp_name,
        c.distance_mi,
        -- Active alert count
        (SELECT COUNT(*) FROM alerts a
         WHERE a.store_id = s.id AND a.acknowledged = false) AS active_alerts,
        -- Worker count
        (SELECT COUNT(*) FROM workers w
         WHERE w.store_id = s.id AND w.active = true) AS worker_count
      FROM stores s
      LEFT JOIN LATERAL (
        SELECT * FROM price_history
        WHERE store_id = s.id
        ORDER BY fetched_at DESC
        LIMIT 1
      ) ph ON true
      LEFT JOIN competitors c ON c.id = ph.comp_id
      WHERE s.active = true
      ORDER BY s.id
    `);
    res.json({ stores: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('GET /stores error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stores/:id — Single store detail with all competitors
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Store info
    const storeResult = await pool.query(
      'SELECT * FROM stores WHERE id = $1', [id]
    );
    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }
    const store = storeResult.rows[0];

    // All competitors for this store
    const compsResult = await pool.query(`
      SELECT c.*,
             ph.comp_price AS latest_price,
             ph.price_diff,
             ph.status,
             ph.fetched_at
      FROM competitors c
      LEFT JOIN LATERAL (
        SELECT * FROM price_history
        WHERE comp_id = c.id
        ORDER BY fetched_at DESC
        LIMIT 1
      ) ph ON true
      WHERE c.store_id = $1 AND c.active = true
      ORDER BY c.distance_mi
    `, [id]);

    // 7-day price history
    const historyResult = await pool.query(`
      SELECT
        DATE(fetched_at) AS date,
        our_price,
        MIN(comp_price) AS min_comp_price,
        MAX(price_diff) AS max_diff
      FROM price_history
      WHERE store_id = $1
        AND fetched_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(fetched_at), our_price
      ORDER BY date ASC
    `, [id]);

    // Workers for this store
    const workersResult = await pool.query(
      'SELECT * FROM workers WHERE store_id = $1 ORDER BY id', [id]
    );

    res.json({
      store,
      competitors: compsResult.rows,
      price_history: historyResult.rows,
      workers: workersResult.rows
    });
  } catch (err) {
    console.error(`GET /stores/${req.params.id} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/stores/:id/price — Update our current gas price
router.patch('/:id/price', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { our_price } = req.body;
    if (!our_price || isNaN(our_price)) {
      return res.status(400).json({ error: 'Valid price required' });
    }
    await pool.query(
      'UPDATE stores SET our_price = $1, updated_at = NOW() WHERE id = $2',
      [parseFloat(our_price), id]
    );
    res.json({ success: true, store_id: id, our_price: parseFloat(our_price) });
  } catch (err) {
    console.error('PATCH /stores/:id/price error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stores/:id/trigger — Manually trigger price check for this store
router.post('/:id/trigger', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const axios = require('axios');
    const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';
    const resp = await axios.post(`${PYTHON_API}/engine/run/${id}`, {}, { timeout: 5000 });
    res.json({ status: 'triggered', store_id: id, engine: resp.data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger price check: ' + err.message });
  }
});

module.exports = router;
