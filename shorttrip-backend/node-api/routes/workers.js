/**
 * Workers Routes — Store Worker Management
 * GET    /api/workers           — All workers
 * GET    /api/workers/:store_id — Workers for a store
 * POST   /api/workers           — Add new worker
 * PATCH  /api/workers/:id       — Update worker
 * DELETE /api/workers/:id       — Deactivate worker
 */
const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// GET /api/workers — All workers with store info
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.*, s.name AS store_name, s.address AS store_address
      FROM workers w
      JOIN stores s ON s.id = w.store_id
      ORDER BY s.id, w.id
    `);
    res.json({ workers: result.rows, count: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workers/store/:store_id — Workers for specific store
router.get('/store/:store_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM workers WHERE store_id = $1 ORDER BY id',
      [req.params.store_id]
    );
    res.json({ workers: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workers — Add new worker
router.post('/', auth, async (req, res) => {
  try {
    const { store_id, name, phone, email, channel, is_manager } = req.body;
    if (!store_id || !name || !phone) {
      return res.status(400).json({ error: 'store_id, name and phone are required' });
    }
    const result = await pool.query(
      `INSERT INTO workers (store_id, name, phone, email, channel, is_manager, active)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
      [store_id, name, phone, email || null, channel || 'whatsapp', is_manager || false]
    );
    res.status(201).json({ worker: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/workers/:id — Update worker details
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, channel, active, is_manager } = req.body;
    const result = await pool.query(
      `UPDATE workers SET
        name        = COALESCE($1, name),
        phone       = COALESCE($2, phone),
        email       = COALESCE($3, email),
        channel     = COALESCE($4, channel),
        active      = COALESCE($5, active),
        is_manager  = COALESCE($6, is_manager)
       WHERE id = $7 RETURNING *`,
      [name, phone, email, channel, active, is_manager, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    res.json({ worker: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workers/:id — Soft delete (deactivate)
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('UPDATE workers SET active = false WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Worker deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
