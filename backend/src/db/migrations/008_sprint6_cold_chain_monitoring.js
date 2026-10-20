/**
 * DB Migration 008: Sprint 6 - Cold Chain Monitoring
 * T-89: Add min_temp, max_temp, max_allowed_delay_minutes to products table
 * T-92: Update temperature_logs with shipment_id, sensor_id, recorded_at
 * T-104: Create temperature_hourly_aggregates table
 * T-105: Create temperature_logs_archive table
 */
export function up(db) {
  // 1. T-89: Products cold chain thresholds
  const productCols = db
    .prepare("PRAGMA table_info(products)")
    .all()
    .map((col) => col.name);
  if (!productCols.includes("min_temp")) {
    db.exec("ALTER TABLE products ADD COLUMN min_temp REAL DEFAULT 2.0");
  }
  if (!productCols.includes("max_temp")) {
    db.exec("ALTER TABLE products ADD COLUMN max_temp REAL DEFAULT 8.0");
  }
  if (!productCols.includes("max_allowed_delay_minutes")) {
    db.exec("ALTER TABLE products ADD COLUMN max_allowed_delay_minutes INTEGER DEFAULT 30");
  }

  // 2. T-92: Temperature logs telemetry columns
  const tempLogCols = db
    .prepare("PRAGMA table_info(temperature_logs)")
    .all()
    .map((col) => col.name);
  if (!tempLogCols.includes("shipment_id")) {
    db.exec("ALTER TABLE temperature_logs ADD COLUMN shipment_id INTEGER");
  }
  if (!tempLogCols.includes("sensor_id")) {
    db.exec("ALTER TABLE temperature_logs ADD COLUMN sensor_id TEXT DEFAULT 'sensor'");
  }
  if (!tempLogCols.includes("recorded_at")) {
    db.exec("ALTER TABLE temperature_logs ADD COLUMN recorded_at TEXT");
    db.exec("UPDATE temperature_logs SET recorded_at = timestamp WHERE recorded_at IS NULL");
  }

  // 3. T-104 & T-105: Aggregates & Archive tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS temperature_hourly_aggregates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      hour_bucket TEXT NOT NULL,
      avg_temperature REAL NOT NULL,
      min_temperature REAL NOT NULL,
      max_temperature REAL NOT NULL,
      reading_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(batch_id, hour_bucket),
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    );
    CREATE INDEX IF NOT EXISTS idx_temp_agg_batch_bucket ON temperature_hourly_aggregates(batch_id, hour_bucket);

    CREATE TABLE IF NOT EXISTS temperature_logs_archive (
      id INTEGER PRIMARY KEY,
      batch_id INTEGER NOT NULL,
      shipment_id INTEGER,
      temperature REAL NOT NULL,
      source TEXT,
      sensor_id TEXT,
      timestamp TEXT,
      recorded_at TEXT,
      archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_temp_archive_batch ON temperature_logs_archive(batch_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_temp_logs_batch_recorded ON temperature_logs(batch_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_temp_logs_shipment ON temperature_logs(shipment_id);
  `);
}

export function down(db) {
  // SQLite does not easily drop columns in older engines; drop tables created in sprint 6
  db.exec(`
    DROP TABLE IF EXISTS temperature_hourly_aggregates;
    DROP TABLE IF EXISTS temperature_logs_archive;
  `);
}
