/**
 * PostgreSQL Connection Pool — Supabase Compatible
 * Uses individual params (not connectionString) to avoid SSL conflicts
 * GarudX.AI | June 2026
 */
require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

const isSupabase = (process.env.DB_HOST || '').includes('supabase.com');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'postgres',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  // SSL: required for Supabase
  ssl: isSupabase ? { rejectUnauthorized: false } : false,
});

pool.on('error', err => {
  console.error('❌ DB pool error:', err.message);
});

// Test connection on startup
(async () => {
  try {
    const res = await pool.query('SELECT NOW() AS server_time');
    console.log('🗄️  DB connected to Supabase ✅ — server time:', res.rows[0].server_time);
  } catch (err) {
    console.error('❌ DB connection failed:', err.message);
    console.error('   → Check DB_HOST, DB_USER, DB_PASSWORD in .env');
  }
})();

module.exports = pool;
