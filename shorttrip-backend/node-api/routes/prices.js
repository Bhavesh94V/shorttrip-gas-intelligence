/**
 * Prices Routes
 * GET /api/prices/latest   — Latest price data for all stores
 * GET /api/prices/history  — Price history (filterable)
 * GET /api/prices/chart    — Chart data for dashboard
 */
const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// GET /api/prices/latest — Latest comparison for all stores
router.get('/latest', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (ph.store_id)
        ph.store_id,
        s.name AS store_name,
        s.our_price,
        ph.comp_price,
        ph.price_diff,
        ph.status,
        ph.source,
        ph.fetched_at,
        c.name AS comp_name,
        c.distance_mi
      FROM price_history ph
      JOIN stores s ON s.id = ph.store_id
      LEFT JOIN competitors c ON c.id = ph.comp_id
      WHERE s.active = true
      ORDER BY ph.store_id, ph.fetched_at DESC
    `);
    res.json({ prices: result.rows, last_updated: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prices/history — Price history with filters
router.get('/history', auth, async (req, res) => {
  try {
    const { store_id, days = 7, limit = 200 } = req.query;
    const safeDays = Math.max(1, Math.min(365, parseInt(days) || 7));
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit) || 200));
    let query = `
      SELECT
        ph.id, ph.store_id, ph.our_price, ph.comp_price,
        ph.price_diff, ph.status, ph.source, ph.fetched_at,
        s.name AS store_name,
        c.name AS comp_name
      FROM price_history ph
      JOIN stores s ON s.id = ph.store_id
      LEFT JOIN competitors c ON c.id = ph.comp_id
      WHERE ph.fetched_at > NOW() - make_interval(days => $1)
    `;
    const params = [safeDays];
    let idx = 2;
    if (store_id) {
      query += ` AND ph.store_id = $${idx++}`;
      params.push(parseInt(store_id));
    }
    query += ` ORDER BY ph.fetched_at DESC LIMIT $${idx}`;
    params.push(safeLimit);
    const result = await pool.query(query, params);
    res.json({ history: result.rows, count: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prices/chart — Weekly chart data grouped by date
router.get('/chart', auth, async (req, res) => {
  try {
    const { store_id } = req.query;
    const params = [];
    let storeFilter = '';
    if (store_id) {
      params.push(parseInt(store_id));
      storeFilter = `AND ph.store_id = $${params.length}`;
    }

    const result = await pool.query(`
      SELECT
        ph.store_id,
        s.name AS store_name,
        DATE(ph.fetched_at) AS date,
        ROUND(AVG(ph.our_price)::numeric, 3) AS our_price,
        ROUND(MIN(ph.comp_price)::numeric, 3) AS min_comp_price
      FROM price_history ph
      JOIN stores s ON s.id = ph.store_id
      WHERE ph.fetched_at > NOW() - INTERVAL '7 days'
        AND ph.our_price IS NOT NULL
        ${storeFilter}
      GROUP BY ph.store_id, s.name, DATE(ph.fetched_at)
      ORDER BY date ASC, ph.store_id
    `, params);

    // Group by store for chart series
    const series = {};
    result.rows.forEach(row => {
      if (!series[row.store_id]) {
        series[row.store_id] = {
          store_id: row.store_id,
          store_name: row.store_name,
          data: []
        };
      }
      series[row.store_id].data.push({
        date: row.date,
        our_price: parseFloat(row.our_price),
        min_comp_price: parseFloat(row.min_comp_price)
      });
    });

    res.json({ chart_data: Object.values(series) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
