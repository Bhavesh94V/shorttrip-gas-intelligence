/**
 * Settings Routes — System Configuration
 * GET /api/settings     — All settings
 * PUT /api/settings     — Update settings (bulk)
 * PUT /api/settings/:key — Update single setting
 */
const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// GET /api/settings — All system settings
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings ORDER BY key');
    const settings = {};
    result.rows.forEach(row => { settings[row.key] = row.value; });
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings — Bulk update settings
router.put('/', auth, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'settings object required' });
    }
    const updates = [];
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, String(value)]
      );
      updates.push(key);
    }
    res.json({ success: true, updated: updates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/:key — Update single setting
router.put('/:key', auth, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ error: 'value required' });
    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, String(value)]
    );
    res.json({ success: true, key, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
