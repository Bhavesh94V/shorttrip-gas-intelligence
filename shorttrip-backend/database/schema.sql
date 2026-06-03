-- ============================================================
-- SHORT TRIP GAS PRICE INTELLIGENCE SYSTEM
-- Database Schema — PostgreSQL
-- GarudX.AI | June 2026
-- ============================================================

-- Drop tables if re-running (development only)
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS workers CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS price_history CASCADE;
DROP TABLE IF EXISTS competitors CASCADE;
DROP TABLE IF EXISTS stores CASCADE;

-- ============================================================
-- TABLE 1: stores — All 10 Short Trip Locations
-- ============================================================
CREATE TABLE stores (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  address      VARCHAR(255) NOT NULL,
  city         VARCHAR(50),
  state        VARCHAR(10) DEFAULT 'SC',
  zip          VARCHAR(10),
  lat          DECIMAL(10, 8),
  lng          DECIMAL(11, 8),
  hours        VARCHAR(150),
  phone        VARCHAR(20),
  our_price    DECIMAL(5, 3),          -- Current gas price (manually set or POS)
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: competitors — Nearby Gas Stations per Store
-- ============================================================
CREATE TABLE competitors (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         VARCHAR(100),           -- e.g. "Shell", "BP", "Exxon"
  brand        VARCHAR(50),            -- normalized brand name
  address      VARCHAR(255),
  lat          DECIMAL(10, 8),
  lng          DECIMAL(11, 8),
  distance_mi  DECIMAL(5, 2),          -- distance from Short Trip store
  place_id     VARCHAR(255),           -- Google Maps place_id (for dedup)
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 3: price_history — Every Price Check Log
-- ============================================================
CREATE TABLE price_history (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  comp_id      INTEGER REFERENCES competitors(id) ON DELETE SET NULL,
  our_price    DECIMAL(5, 3),
  comp_price   DECIMAL(5, 3),
  price_diff   DECIMAL(5, 3),          -- negative = competitor cheaper
  fuel_type    VARCHAR(20) DEFAULT 'regular',  -- regular, midgrade, premium, diesel
  source       VARCHAR(50),            -- 'gasbuddy', 'waze', 'google_maps', 'eia', 'manual'
  status       VARCHAR(20),            -- 'alert', 'monitor', 'ok', 'skip', 'fallback'
  fetched_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 4: alerts — Alert Notification Log
-- ============================================================
CREATE TABLE alerts (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  comp_id      INTEGER REFERENCES competitors(id) ON DELETE SET NULL,
  comp_name    VARCHAR(100),           -- competitor name (denormalized for quick display)
  our_price    DECIMAL(5, 3),
  comp_price   DECIMAL(5, 3),
  price_diff   DECIMAL(5, 3),         -- negative = competitor cheaper
  priority     VARCHAR(10),            -- 'HIGH' (>$0.10), 'MED' ($0.05-$0.10)
  channel      VARCHAR(20),            -- 'whatsapp', 'sms', 'email', 'dashboard', 'n8n'
  message      TEXT,                   -- full message sent
  sent         BOOLEAN DEFAULT false,
  sent_at      TIMESTAMP,
  acknowledged BOOLEAN DEFAULT false,
  ack_at       TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- TABLE 5: workers — Store Workers (Who Gets Notified)
-- ============================================================
CREATE TABLE workers (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  phone        VARCHAR(20) NOT NULL,   -- E.164 format: +18435550101
  email        VARCHAR(150),
  channel      VARCHAR(20) DEFAULT 'whatsapp',  -- 'whatsapp' or 'sms'
  is_manager   BOOLEAN DEFAULT false,  -- manager gets daily summary email
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 6: settings — System Configuration
-- ============================================================
CREATE TABLE settings (
  key          VARCHAR(50) PRIMARY KEY,
  value        TEXT NOT NULL,
  description  VARCHAR(255),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_price_history_store_id ON price_history(store_id);
CREATE INDEX idx_price_history_fetched_at ON price_history(fetched_at DESC);
CREATE INDEX idx_alerts_store_id ON alerts(store_id);
CREATE INDEX idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX idx_competitors_store_id ON competitors(store_id);
CREATE INDEX idx_workers_store_id ON workers(store_id);

-- ============================================================
-- DEFAULT SETTINGS
-- ============================================================
INSERT INTO settings (key, value, description) VALUES
('check_frequency_hours',  '2',      'How often to run price check (in hours)'),
('alert_threshold_dollars','0.05',   'Minimum price difference to trigger alert'),
('search_radius_miles',    '1.5',    'Competitor search radius in miles'),
('quiet_hours_start',      '22:00',  'No alerts after this time (24h format)'),
('quiet_hours_end',        '06:00',  'Resume alerts after this time (24h format)'),
('daily_summary_time',     '08:00',  'Time to send daily email summary'),
('dedup_hours',            '4',      'Min hours between same-store alerts'),
('primary_channel',        'whatsapp','Primary notification channel'),
('backup_channel',         'sms',    'Backup notification channel'),
('daily_summary_email',    'true',   'Enable daily email summary'),
('n8n_webhook_url',        '',       'n8n webhook URL for trigger'),
('system_active',          'true',   'Master switch for the system');
