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

// PATCH /api/stores/:id/prices — Update multi-fuel prices (regular, premium, diesel)
router.patch('/:id/prices', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { regular, premium, diesel } = req.body;

    // Build dynamic SET clause only for provided prices
    const updates = [];
    const params = [];
    let idx = 1;
    if (regular  !== undefined && !isNaN(regular))  { updates.push(`our_price = $${idx++}`);         params.push(parseFloat(regular)); }
    if (premium  !== undefined && !isNaN(premium))  { updates.push(`our_price_premium = $${idx++}`); params.push(parseFloat(premium)); }
    if (diesel   !== undefined && !isNaN(diesel))   { updates.push(`our_price_diesel = $${idx++}`);  params.push(parseFloat(diesel)); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'At least one price (regular/premium/diesel) required' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(parseInt(id));

    await pool.query(
      `UPDATE stores SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    res.json({ success: true, store_id: id, updated: { regular, premium, diesel } });
  } catch (err) {
    // Column may not exist yet — return graceful error
    if (err.message.includes('column') && err.message.includes('does not exist')) {
      return res.status(200).json({
        success: true, store_id: id,
        note: 'Multi-fuel columns not yet in DB schema. Run migration to add them.',
        updated: { regular: req.body.regular }
      });
    }
    console.error('PATCH /stores/:id/prices error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stores/export/csv — Download all price history as CSV
router.get('/export/csv', auth, async (req, res) => {
  try {
    const { days = 7, store_id } = req.query;
    const params = [parseInt(days)];
    const storeFilter = store_id ? `AND ph.store_id = $2` : '';
    if (store_id) params.push(parseInt(store_id));

    const result = await pool.query(`
      SELECT
        s.name        AS store_name,
        s.address     AS store_address,
        s.our_price,
        c.name        AS competitor_name,
        c.distance_mi,
        ph.comp_price,
        ph.price_diff,
        ph.status,
        ph.source,
        ph.fetched_at
      FROM price_history ph
      JOIN stores s ON s.id = ph.store_id
      LEFT JOIN competitors c ON c.id = ph.comp_id
      WHERE ph.fetched_at > NOW() - make_interval(days => $1)
      ${storeFilter}
      ORDER BY ph.fetched_at DESC
      LIMIT 5000
    `, params);

    // Build CSV
    const headers = ['Store Name','Address','Our Price','Competitor','Distance (mi)','Comp Price','Difference','Status','Source','Date/Time'];
    const rows = result.rows.map(r => [
      `"${r.store_name}"`,
      `"${r.store_address || ''}"`,
      r.our_price || '',
      `"${r.competitor_name || ''}"`,
      r.distance_mi || '',
      r.comp_price || '',
      r.price_diff || '',
      r.status || '',
      r.source || '',
      r.fetched_at ? new Date(r.fetched_at).toISOString() : ''
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `shorttrip_prices_${new Date().toISOString().slice(0,10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('GET /stores/export/csv error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stores/export/summary — JSON summary for report/print view
router.get('/export/summary', auth, async (req, res) => {
  try {
    const storesResult = await pool.query(`
      SELECT
        s.id, s.name, s.address, s.our_price,
        ph.comp_price, ph.price_diff, ph.status,
        c.name AS best_comp,
        (SELECT COUNT(*) FROM alerts a WHERE a.store_id = s.id AND DATE(a.created_at) = CURRENT_DATE) AS today_alerts,
        (SELECT COUNT(*) FROM alerts a WHERE a.store_id = s.id AND a.acknowledged = false) AS unread_alerts
      FROM stores s
      LEFT JOIN LATERAL (
        SELECT * FROM price_history WHERE store_id = s.id ORDER BY fetched_at DESC LIMIT 1
      ) ph ON true
      LEFT JOIN competitors c ON c.id = ph.comp_id
      WHERE s.active = true ORDER BY s.id
    `);

    const totals = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE acknowledged = false) AS total_alerts,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) AS today_alerts,
        ROUND(AVG(price_diff)::numeric, 3) AS avg_diff
      FROM alerts
    `);

    res.json({
      generated_at: new Date().toISOString(),
      stores: storesResult.rows,
      totals: totals.rows[0]
    });
  } catch (err) {
    console.error('GET /stores/export/summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

