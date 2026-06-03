/**
 * Alerts Routes
 * GET   /api/alerts               — All active alerts
 * GET   /api/alerts/summary       — Today's summary stats
 * POST  /api/alerts/internal      — Python engine pushes alerts (no JWT, uses X-Internal-Key)
 * POST  /api/alerts/:id/notify    — Manually trigger notification
 * PATCH /api/alerts/:id/acknowledge — Mark as read
 * PATCH /api/alerts/acknowledge-all — Mark all as read
 */
const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// POST /api/alerts/internal — Python engine internal push (no JWT)
router.post('/internal', async (req, res) => {
  try {
    const internalKey = req.headers['x-internal-key'];
    const expectedKey = process.env.JWT_SECRET || 'internal';
    if (internalKey !== expectedKey) {
      return res.status(403).json({ error: 'Forbidden — invalid internal key' });
    }

    const {
      store_id, store_name, our_price, comp_price,
      comp_name, price_diff, priority, message, action, timestamp
    } = req.body;

    if (!store_id || !action) {
      return res.status(400).json({ error: 'store_id and action required' });
    }

    // Only save to DB if it's an alert
    if (action !== 'alert') {
      return res.json({ status: 'skipped', reason: `action=${action} does not create alert` });
    }

    // Find competitor ID by name (optional — null is ok)
    let comp_id = null;
    if (comp_name && store_id) {
      const compResult = await pool.query(
        'SELECT id FROM competitors WHERE store_id = $1 AND name ILIKE $2 LIMIT 1',
        [store_id, `%${comp_name}%`]
      );
      if (compResult.rows.length > 0) comp_id = compResult.rows[0].id;
    }

    // Dedup — skip if same alert within last N hours
    const dedupHours = parseInt(process.env.DEDUP_HOURS || '4');
    const existing = await pool.query(`
      SELECT id FROM alerts
      WHERE store_id = $1
        AND comp_name = $2
        AND acknowledged = false
        AND created_at > NOW() - INTERVAL '${dedupHours} hours'
      LIMIT 1
    `, [store_id, comp_name || '']);

    if (existing.rows.length > 0) {
      return res.json({ status: 'deduped', alert_id: existing.rows[0].id });
    }

    // Insert alert
    const insertResult = await pool.query(`
      INSERT INTO alerts
        (store_id, comp_id, comp_name, our_price, comp_price, price_diff, priority, message, acknowledged)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
      RETURNING id
    `, [store_id, comp_id, comp_name, our_price, comp_price, price_diff, priority || 'MED', message]);

    const alertId = insertResult.rows[0].id;
    console.log(`✅ Alert #${alertId} saved for store ${store_id} (${store_name})`);
    res.status(201).json({ status: 'created', alert_id: alertId });

  } catch (err) {
    console.error('POST /alerts/internal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// GET /api/alerts — All alerts (with filters)
router.get('/', auth, async (req, res) => {
  try {
    const { acknowledged, store_id, priority, limit = 50 } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (acknowledged !== undefined) {
      where.push(`a.acknowledged = $${idx++}`);
      params.push(acknowledged === 'true');
    }
    if (store_id) {
      where.push(`a.store_id = $${idx++}`);
      params.push(parseInt(store_id));
    }
    if (priority) {
      where.push(`a.priority = $${idx++}`);
      params.push(priority.toUpperCase());
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    params.push(parseInt(limit));

    const result = await pool.query(`
      SELECT
        a.id, a.store_id, a.comp_id, a.our_price, a.comp_price,
        a.price_diff, a.priority, a.channel, a.message,
        a.sent, a.sent_at, a.acknowledged, a.ack_at, a.created_at,
        s.name  AS store_name,
        s.address AS store_address,
        COALESCE(c.name, a.comp_name) AS comp_name,
        c.distance_mi
      FROM alerts a
      JOIN stores s ON s.id = a.store_id
      LEFT JOIN competitors c ON c.id = a.comp_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${idx}
    `, params);


    res.json({ alerts: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('GET /alerts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alerts/summary — Today's stats for metric cards
router.get('/summary', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE acknowledged = false) AS active_alerts,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) AS today_count,
        COUNT(*) FILTER (WHERE priority = 'HIGH' AND acknowledged = false) AS high_priority,
        COUNT(*) FILTER (WHERE priority = 'MED' AND acknowledged = false) AS med_priority
      FROM alerts
    `);

    const storesOk = await pool.query(`
      SELECT COUNT(*) AS ok_stores
      FROM (
        SELECT store_id
        FROM price_history
        WHERE fetched_at > NOW() - INTERVAL '3 hours'
          AND status = 'ok'
        GROUP BY store_id
      ) t
    `);

    const avgPrice = await pool.query(`
      SELECT ROUND(AVG(our_price)::numeric, 3) AS avg_price
      FROM stores WHERE active = true AND our_price IS NOT NULL
    `);

    res.json({
      active_alerts: parseInt(result.rows[0].active_alerts) || 0,
      today_count: parseInt(result.rows[0].today_count) || 0,
      high_priority: parseInt(result.rows[0].high_priority) || 0,
      med_priority: parseInt(result.rows[0].med_priority) || 0,
      ok_stores: parseInt(storesOk.rows[0].ok_stores) || 0,
      avg_price: parseFloat(avgPrice.rows[0].avg_price) || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alerts/:id/notify — Manually send notification for an alert
router.post('/:id/notify', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const alertResult = await pool.query(
      'SELECT a.*, s.name as store_name FROM alerts a JOIN stores s ON s.id = a.store_id WHERE a.id = $1',
      [id]
    );
    if (alertResult.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    const alert = alertResult.rows[0];

    // Trigger Python notifier
    const axios = require('axios');
    const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';
    try {
      await axios.post(`${PYTHON_API}/engine/notify`, {
        store_id: alert.store_id,
        alert_id: alert.id,
        message: alert.message,
        priority: alert.priority
      }, { timeout: 5000 });
    } catch (e) {
      console.warn('Python notify call failed (notifications may not be configured):', e.message);
    }

    // Update sent status
    await pool.query(
      'UPDATE alerts SET sent = true, sent_at = NOW(), channel = $1 WHERE id = $2',
      ['manual', id]
    );
    res.json({ success: true, alert_id: id, message: 'Notification triggered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/alerts/:id/acknowledge
router.patch('/:id/acknowledge', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE alerts SET acknowledged = true, ack_at = NOW() WHERE id = $1',
      [id]
    );
    res.json({ success: true, alert_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/alerts/acknowledge-all — Acknowledge all unread alerts
router.patch('/acknowledge-all', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE alerts SET acknowledged = true, ack_at = NOW() WHERE acknowledged = false RETURNING id'
    );
    res.json({ success: true, acknowledged: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
