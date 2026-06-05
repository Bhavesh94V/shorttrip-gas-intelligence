/**
 * Auth Routes — Login / Token / Change Password
 * POST /api/auth/login
 * POST /api/auth/change-password
 * GET  /api/auth/me
 */
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const JWT_SECRET  = process.env.JWT_SECRET  || 'shorttrip_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

// Default credentials (used if DB settings not available)
const DEFAULT_EMAIL    = 'manager@shorttrip.com';
const DEFAULT_PASSWORD = 'ShortTrip@2026';

// Hash default password at startup (sync — runs once)
let defaultHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

/**
 * Get stored credentials from DB settings table (if available).
 * Falls back to defaults if not found.
 */
async function getCredentials() {
  try {
    const emailResult = await pool.query(
      "SELECT value FROM settings WHERE key = 'manager_email'"
    );
    const hashResult = await pool.query(
      "SELECT value FROM settings WHERE key = 'manager_password_hash'"
    );
    return {
      email: emailResult.rows.length > 0 ? emailResult.rows[0].value : DEFAULT_EMAIL,
      hash:  hashResult.rows.length > 0  ? hashResult.rows[0].value : defaultHash,
    };
  } catch {
    return { email: DEFAULT_EMAIL, hash: defaultHash };
  }
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const creds = await getCredentials();

    if (email !== creds.email) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, creds.hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { email, role: 'manager' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    res.json({ token, role: 'manager', email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password — Update password (requires current password)
router.post('/change-password', require('../middleware/auth'), async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const creds = await getCredentials();
    const valid = await bcrypt.compare(current_password, creds.hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('manager_password_hash', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [newHash]
    );

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', require('../middleware/auth'), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;

