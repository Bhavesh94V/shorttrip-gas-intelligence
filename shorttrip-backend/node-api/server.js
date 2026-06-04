/**
 * SHORT TRIP GAS PRICE INTELLIGENCE
 * Node.js Express API Server — Main Entry
 * GarudX.AI | June 2026
 */

require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = process.env.NODE_PORT || 3001;
const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';
const CHECK_FREQUENCY = parseInt(process.env.CHECK_FREQUENCY_HOURS || '2');

// ── Routes ────────────────────────────────────────────────────
const storesRouter = require('./routes/stores');
const pricesRouter = require('./routes/prices');
const alertsRouter = require('./routes/alerts');
const workersRouter = require('./routes/workers');
const settingsRouter = require('./routes/settings');
const authRouter = require('./routes/auth');

// ── Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5173',   // Vite dev server
    'http://localhost:4173',   // Vite preview
    'https://shorttrip-admin.garudx.ai',
    'https://shorttrip-gas-intelligence.netlify.app'
  ],
  credentials: true
}));
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting — 100 requests per 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/stores', storesRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/workers', workersRouter);
app.use('/api/settings', settingsRouter);

// ── Health Check ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'Short Trip Gas Price API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    python_engine: PYTHON_API
  });
});

// ── Internal Alert Push (from Python engine) ──────────────────
app.post('/api/alerts/internal', async (req, res) => {
  const internalKey = req.headers['x-internal-key'];
  if (internalKey !== process.env.JWT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized internal request' });
  }
  try {
    const pool = require('./db');
    const { store_id, our_price, comp_price, comp_name, price_diff, priority, message, action } = req.body;
    await pool.query(
      `INSERT INTO alerts (store_id, our_price, comp_price, diff, priority, channel, message, sent, sent_at)
       VALUES ($1, $2, $3, $4, $5, 'dashboard', $6, true, NOW())`,
      [store_id, our_price, comp_price, Math.abs(price_diff || 0), priority || 'MED', message || '']
    );
    res.status(201).json({ status: 'saved', action });
  } catch (err) {
    console.error('Internal alert push error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// ── Error Handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── CronJob Scheduler (Fallback if n8n not set up yet) ────────
const triggerPriceCheck = async () => {
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (n8nUrl) {
    // n8n handles it — just log
    console.log(`[CRON] n8n webhook active — skipping local trigger`);
    return;
  }
  // Fallback: trigger Python engine directly
  try {
    console.log(`[CRON] Triggering price check via Python engine...`);
    const resp = await axios.post(`${PYTHON_API}/engine/run`, {}, { timeout: 5000 });
    console.log(`[CRON] Price check triggered: ${resp.data.status}`);
  } catch (err) {
    console.error(`[CRON] Failed to trigger price check: ${err.message}`);
  }
};

// Build cron expression from frequency (every N hours)
const cronExpr = `0 */${CHECK_FREQUENCY} * * *`;
cron.schedule(cronExpr, triggerPriceCheck, { timezone: 'America/New_York' });
console.log(`[CRON] Price check scheduled: every ${CHECK_FREQUENCY} hours (EST)`);

// Daily 8 AM summary email trigger
cron.schedule('0 8 * * *', async () => {
  try {
    await axios.post(`${PYTHON_API}/engine/daily-summary`, {}, { timeout: 5000 });
    console.log('[CRON] Daily summary triggered');
  } catch (err) {
    console.error('[CRON] Daily summary trigger failed:', err.message);
  }
}, { timezone: 'America/New_York' });

// ── Start Server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Short Trip API running on http://localhost:${PORT}`);
  console.log(`   Python Engine: ${PYTHON_API}`);
  console.log(`   Price check: every ${CHECK_FREQUENCY} hours\n`);
});

module.exports = app;
