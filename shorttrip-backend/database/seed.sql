-- ============================================================
-- SEED DATA — All 10 Short Trip Gas Station Locations
-- South Carolina, USA
-- ============================================================

INSERT INTO stores (name, address, city, state, zip, lat, lng, hours, phone, our_price) VALUES
('614 US-78, Ridgeville',       '614 US-78, Ridgeville, SC 29472',        'Ridgeville',    'SC', '29472', 33.09760, -80.32460, 'Mon-Sat: 5am-9pm | Sun: 7am-7pm',  '+18438718119', 3.350),
('3147 State Rd, Ridgeville',   '3147 State Rd, Ridgeville, SC 29472',    'Ridgeville',    'SC', '29472', 33.10120, -80.31980, 'Mon-Sat: 5am-9pm | Sun: 8am-8pm',  NULL,           3.280),
('348 College Park Rd, Ladson', '348 College Park Rd, Ladson, SC 29456',  'Ladson',        'SC', '29456', 32.98230, -80.10120, '24 hours, 7 days',                  NULL,           3.220),
('3880 Patriot Pkwy, Sumter',   '3880 Patriot Pkwy, Sumter, SC 29154',    'Sumter',        'SC', '29154', 33.92010, -80.38760, 'Mon-Fri: 5am-10pm',                 NULL,           3.410),
('101 N Hwy 52, Moncks Corner', '101 N Hwy 52, Moncks Corner, SC 29461', 'Moncks Corner', 'SC', '29461', 33.19730, -80.01460, '5am-12am, 7 days',                  NULL,           3.300),
('3272 US-52, Moncks Corner',   '3272 US-52, Moncks Corner, SC 29461',   'Moncks Corner', 'SC', '29461', 33.21450, -80.02340, 'Mon-Fri: 6am-9pm',                  NULL,           3.290),
('117 S Boundary St, Manning',  '117 S Boundary St, Manning, SC 29102',  'Manning',        'SC', '29102', 33.69530, -80.21200, '7am-8pm, 7 days',                   NULL,           3.310),
('3022 Old Hwy 52, Moncks Cor.','3022 Old Hwy 52, Moncks Corner, SC 29461','Moncks Corner','SC', '29461', 33.20890, -80.03120, 'Mon-Sat: 6am-10pm',                 NULL,           3.320),
('3995 North Rd, Orangeburg',   '3995 North Rd, Orangeburg, SC 29118',   'Orangeburg',    'SC', '29118', 33.50120, -80.87340, 'Mon-Sat: 9am-7pm',                  NULL,           3.300),
('1010 Old Hwy 52 (Laundromat)','1010 Old Hwy 52, Moncks Corner, SC 29461','Moncks Corner','SC','29461', 33.20670, -80.02780, '7am-10pm, 7 days',                  NULL,           3.280);

-- ============================================================
-- SAMPLE WORKERS (Update with real names/phones from client)
-- ============================================================
INSERT INTO workers (store_id, name, phone, channel, is_manager, active) VALUES
(1, 'Worker - Ridgeville 1',    '+919104596499', 'sms', false, true),
(2, 'Worker - Ridgeville 2',    '+919104596499', 'sms', false, true),
(3, 'Worker - Ladson',          '+18435550103', 'whatsapp', false, true),
(4, 'Worker - Sumter',          '+18435550104', 'sms',      false, true),
(5, 'Worker - Moncks Corner 1', '+18435550105', 'whatsapp', false, true),
(6, 'Worker - Moncks Corner 2', '+18435550106', 'sms',      false, true),
(7, 'Worker - Manning',         '+18435550107', 'whatsapp', false, true),
(8, 'Worker - Moncks Corner 3', '+18435550108', 'sms',      false, true),
(9, 'Worker - Orangeburg',      '+18435550109', 'whatsapp', false, true),
(10,'Worker - Laundromat',      '+18435550110', 'sms',      false, true),
-- Manager gets daily summary email
(1, 'Manager - Short Trip',     '+18435550001', 'whatsapp', true,  true);
