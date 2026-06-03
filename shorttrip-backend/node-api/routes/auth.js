/**
 * Auth Routes — Login / Token
 * POST /api/auth/login
 */
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET  = process.env.JWT_SECRET  || 'shorttrip_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

// Hardcoded manager credentials (change via Settings page later)
// In production: store hashed password in DB
const MANAGER_EMAIL    = 'manager@shorttrip.com';
const MANAGER_PASSWORD = 'ShortTrip@2026'; // Change this!

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    // Simple credential check (extend to DB lookup later)
    if (email !== MANAGER_EMAIL || password !== MANAGER_PASSWORD) {
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

router.get('/me', require('../middleware/auth'), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
