-- Smart Kitchen Safety: schema PostgreSQL untuk Supabase
CREATE TABLE IF NOT EXISTS telemetry (
  id BIGSERIAL PRIMARY KEY,
  sample_id TEXT UNIQUE NOT NULL,
  device_id TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  temperature_c DOUBLE PRECISION,
  humidity_pct DOUBLE PRECISION,
  mq2_adc INTEGER,
  mq2_status TEXT NOT NULL,
  gas_threshold_adc INTEGER,
  system_status TEXT NOT NULL,
  mode TEXT NOT NULL,
  servo_target_deg INTEGER NOT NULL,
  led_red_on BOOLEAN NOT NULL,
  led_green_on BOOLEAN NOT NULL,
  buzzer_on BOOLEAN NOT NULL,
  alarm_active BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry(device_id,recorded_at DESC);
CREATE TABLE IF NOT EXISTS device_events (
  id BIGSERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_id TEXT NOT NULL,
  sample_id TEXT NOT NULL,
  type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  mode TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_events_device_time ON device_events(device_id,recorded_at DESC);
-- Backend menggunakan koneksi database server-side dengan kredensial privat.
-- Jangan mengaktifkan akses publik/anonymous langsung ke dua tabel ini.
ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_events ENABLE ROW LEVEL SECURITY;
