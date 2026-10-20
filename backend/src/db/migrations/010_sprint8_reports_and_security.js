/**
 * DB Migration 010: Sprint 8 - Báo cáo, Hồ sơ kiểm tra & Bảo mật vận hành CSDL
 * T-124 / T-129: Transporters & Violation Analytics
 * T-131 / T-132: System Integrity Logs
 * T-133 / T-134: ND 13/2023 Data Anonymization
 */

export function up(db) {
  // 1. T-129: Bảng đơn vị vận chuyển / nhà xe chuyên dụng (Transporters)
  db.exec(`
    CREATE TABLE IF NOT EXISTS transporters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      contact_phone TEXT,
      license_plate TEXT,
      temperature_control_type TEXT DEFAULT 'Thùng lạnh chuyên dụng (-18°C đến +10°C)',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_transporters_code ON transporters(code);
  `);

  // Bổ sung cột transporter_id vào temperature_logs và batch_transfers nếu chưa có
  const tempLogCols = db
    .prepare("PRAGMA table_info(temperature_logs)")
    .all()
    .map((c) => c.name);
  if (!tempLogCols.includes("transporter_id")) {
    db.exec("ALTER TABLE temperature_logs ADD COLUMN transporter_id INTEGER REFERENCES transporters(id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_temp_logs_transporter ON temperature_logs(transporter_id)");
  }

  const transferCols = db
    .prepare("PRAGMA table_info(batch_transfers)")
    .all()
    .map((c) => c.name);
  if (!transferCols.includes("transporter_id")) {
    db.exec("ALTER TABLE batch_transfers ADD COLUMN transporter_id INTEGER REFERENCES transporters(id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_batch_transfers_transporter ON batch_transfers(transporter_id)");
  }

  // 2. T-131 & T-132: Bảng lịch sử kiểm tra toàn vẹn Hash toàn hệ thống (System Integrity Logs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_integrity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total_batches INTEGER NOT NULL DEFAULT 0,
      valid_count INTEGER NOT NULL DEFAULT 0,
      corrupted_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('VALID', 'CORRUPTED', 'WARNING')),
      details_json TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      triggered_by TEXT DEFAULT 'CRONJOB'
    );
    CREATE INDEX IF NOT EXISTS idx_integrity_logs_run_at ON system_integrity_logs(run_at);
  `);

  // 3. T-133: Bảng quản lý yêu cầu ẩn danh hóa dữ liệu cá nhân theo NĐ 13/2023/NĐ-CP
  db.exec(`
    CREATE TABLE IF NOT EXISTS privacy_anonymization_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_code TEXT NOT NULL UNIQUE,
      target_type TEXT NOT NULL CHECK(target_type IN ('farmer', 'user', 'farm')),
      target_id INTEGER NOT NULL,
      original_identifier TEXT,
      pseudonym TEXT NOT NULL,
      reason TEXT NOT NULL,
      requested_by INTEGER,
      anonymized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'COMPLETED'
    );
    CREATE INDEX IF NOT EXISTS idx_privacy_req_target ON privacy_anonymization_requests(target_type, target_id);
  `);

  // Bổ sung cờ ẩn danh vào bảng users và farms
  const userCols = db
    .prepare("PRAGMA table_info(users)")
    .all()
    .map((c) => c.name);
  if (!userCols.includes("is_anonymized")) {
    db.exec("ALTER TABLE users ADD COLUMN is_anonymized INTEGER NOT NULL DEFAULT 0");
  }
  if (!userCols.includes("anonymized_at")) {
    db.exec("ALTER TABLE users ADD COLUMN anonymized_at TEXT");
  }
  if (!userCols.includes("pseudonym")) {
    db.exec("ALTER TABLE users ADD COLUMN pseudonym TEXT");
  }

  const farmCols = db
    .prepare("PRAGMA table_info(farms)")
    .all()
    .map((c) => c.name);
  if (!farmCols.includes("is_anonymized")) {
    db.exec("ALTER TABLE farms ADD COLUMN is_anonymized INTEGER NOT NULL DEFAULT 0");
  }
  if (!farmCols.includes("anonymized_at")) {
    db.exec("ALTER TABLE farms ADD COLUMN anonymized_at TEXT");
  }
  if (!farmCols.includes("pseudonym")) {
    db.exec("ALTER TABLE farms ADD COLUMN pseudonym TEXT");
  }

  // 4. Seed dữ liệu mặc định cho Transporters nếu chưa có
  const existingTransporters = db.prepare("SELECT COUNT(*) AS cnt FROM transporters").get().cnt;
  if (existingTransporters === 0) {
    const insertTransporter = db.prepare(`
      INSERT INTO transporters (code, name, contact_phone, license_plate, temperature_control_type)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertTransporter.run(
      "TRP-001",
      "Công ty TNHH Vận tải Lạnh Hoàng Long",
      "0912345678",
      "29C-888.66",
      "Xe tải lạnh Carrier Supra 850 (-20°C đến +15°C)",
    );
    insertTransporter.run(
      "TRP-002",
      "Logistics Chuỗi Lạnh Mekong Express",
      "0933221100",
      "51D-999.22",
      "Xe tải bảo ôn Thermo King T-1000R (-18°C đến +10°C)",
    );
    insertTransporter.run(
      "TRP-003",
      "Đội xe Lạnh Nông sản Việt Xanh",
      "0987654321",
      "47C-123.45",
      "Xe thùng lạnh cách nhiệt 3 lớp cảm biến IoT (-5°C đến +12°C)",
    );
    insertTransporter.run(
      "TRP-004",
      "Vận tải Bắc Nam Fresh Trans",
      "0909112233",
      "30A-555.77",
      "Xe đầu kéo container lạnh Daikin 40ft (-25°C đến +25°C)",
    );
  }
}
