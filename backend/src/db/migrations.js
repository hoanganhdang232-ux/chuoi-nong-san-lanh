import { getDb } from "./database.js";

export function runMigrations() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('farm','processor','distributor')),
      address TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('farm_admin','processor_admin','distributor_admin','auditor','consumer','user','system_admin')),
      is_active INTEGER NOT NULL DEFAULT 1,
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS farms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );

    CREATE TABLE IF NOT EXISTS land_plots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farm_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      area_ha REAL NOT NULL,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (farm_id) REFERENCES farms(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      code TEXT DEFAULT (lower(hex(randomblob(6)))),
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      type TEXT NOT NULL DEFAULT 'STORE' CHECK(type IN ('STORE','WAREHOUSE','store','warehouse')),
      status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive','active','inactive','ACTIVE','INACTIVE')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );

    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_code TEXT NOT NULL UNIQUE,
      product_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      source_farm_id INTEGER,
      location_id INTEGER,
      initial_quantity REAL NOT NULL,
      remaining_quantity REAL NOT NULL,
      current_location TEXT,
      temperature_c REAL,
      status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','pending_confirmation','processed','in_transit','delivered','recalled','consumed','CONSUMED','active','ACTIVE','QUARANTINED','quarantined','RECALLED','recalling','RECALLING')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (source_farm_id) REFERENCES farms(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      organization_id INTEGER,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      ip_address TEXT,
      status_code INTEGER,
      request_body TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );

    CREATE TABLE IF NOT EXISTS event_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      actor_id INTEGER,
      data_json TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      current_hash TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES batches(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS batch_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      from_organization_id INTEGER NOT NULL,
      to_organization_id INTEGER NOT NULL,
      requester_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','cancelled')),
      note TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      overdue_notified_at TEXT,
      FOREIGN KEY (batch_id) REFERENCES batches(id),
      FOREIGN KEY (from_organization_id) REFERENCES organizations(id),
      FOREIGN KEY (to_organization_id) REFERENCES organizations(id),
      FOREIGN KEY (requester_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS batch_relations (
      parent_batch_id INTEGER NOT NULL,
      child_batch_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL CHECK(relation_type IN ('split', 'merge')),
      quantity REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (parent_batch_id, child_batch_id),
      FOREIGN KEY (parent_batch_id) REFERENCES batches(id),
      FOREIGN KEY (child_batch_id) REFERENCES batches(id)
    );

    CREATE TABLE IF NOT EXISTS temperature_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      temperature REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'sensor',
      timestamp TEXT NOT NULL,
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    );

    CREATE TABLE IF NOT EXISTS cold_chain_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL,
      message TEXT NOT NULL,
      started_at TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    );

    CREATE TABLE IF NOT EXISTS recall_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_batch_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      triggered_by INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (root_batch_id) REFERENCES batches(id),
      FOREIGN KEY (triggered_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS recall_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'opened' CHECK(status IN ('opened', 'in_progress', 'completed', 'cancelled')),
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES batches(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_recall_orders_batch ON recall_orders(batch_id);

    CREATE TABLE IF NOT EXISTS recall_items (
      recall_id INTEGER NOT NULL,
      batch_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      current_location TEXT,
      remaining_quantity REAL NOT NULL,
      consumed_quantity REAL NOT NULL,
      PRIMARY KEY (recall_id, batch_id),
      FOREIGN KEY (batch_id) REFERENCES batches(id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
  `);

  const batchColumns = db
    .prepare("PRAGMA table_info(batches)")
    .all()
    .map((column) => column.name);

  const missingBatchColumns = [
    "parent_batch_id",
    "root_batch_id",
    "source_batch_ids",
  ].filter((column) => !batchColumns.includes(column));

  for (const columnName of missingBatchColumns) {
    const columnSql = {
      parent_batch_id:
        "ALTER TABLE batches ADD COLUMN parent_batch_id INTEGER REFERENCES batches(id)",
      root_batch_id:
        "ALTER TABLE batches ADD COLUMN root_batch_id INTEGER REFERENCES batches(id)",
      source_batch_ids: "ALTER TABLE batches ADD COLUMN source_batch_ids TEXT",
    }[columnName];

    if (columnSql) {
      db.exec(columnSql);
    }
  }

  const usersTableSql =
    db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'",
      )
      .get()?.sql || "";

  if (!usersTableSql.includes("'system_admin'")) {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          organization_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('farm_admin','processor_admin','distributor_admin','auditor','consumer','user','system_admin')),
          is_active INTEGER NOT NULL DEFAULT 1,
          failed_login_count INTEGER NOT NULL DEFAULT 0,
          locked_until TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id)
        );
      `);

      db.exec(`
        INSERT INTO users_new (
          id, organization_id, name, email, password_hash, role,
          is_active, failed_login_count, locked_until, created_at, updated_at
        )
        SELECT
          id, organization_id, name, email, password_hash, role,
          is_active, failed_login_count, locked_until, created_at, updated_at
        FROM users;
      `);

      db.exec("DROP TABLE users;");
      db.exec("ALTER TABLE users_new RENAME TO users;");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  const batchTableSql =
    db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'batches'",
      )
      .get()?.sql || "";

  if (!batchTableSql.includes("'consumed'")) {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`
        CREATE TABLE batches_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_code TEXT NOT NULL UNIQUE,
          product_id INTEGER NOT NULL,
          organization_id INTEGER NOT NULL,
          source_farm_id INTEGER,
          parent_batch_id INTEGER,
          root_batch_id INTEGER,
          source_batch_ids TEXT,
          initial_quantity REAL NOT NULL,
          remaining_quantity REAL NOT NULL,
          consumed_quantity REAL NOT NULL DEFAULT 0,
          current_location TEXT,
          location_id INTEGER,
          temperature_c REAL,
          cold_chain_alert INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','pending_confirmation','processed','in_transit','delivered','recalled','consumed','CONSUMED','active','ACTIVE','QUARANTINED','quarantined','RECALLED','recalling','RECALLING')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (organization_id) REFERENCES organizations(id),
          FOREIGN KEY (source_farm_id) REFERENCES farms(id),
          FOREIGN KEY (parent_batch_id) REFERENCES batches(id),
          FOREIGN KEY (root_batch_id) REFERENCES batches(id),
          FOREIGN KEY (location_id) REFERENCES locations(id)
        );
      `);

      db.exec(`
        INSERT INTO batches_new (
          id, batch_code, product_id, organization_id, source_farm_id,
          parent_batch_id, root_batch_id, source_batch_ids,
          initial_quantity, remaining_quantity, current_location, temperature_c,
          status, created_at, updated_at
        )
        SELECT
          id, batch_code, product_id, organization_id, source_farm_id,
          parent_batch_id, root_batch_id, source_batch_ids,
          initial_quantity, remaining_quantity, current_location, temperature_c,
          status, created_at, updated_at
        FROM batches;
      `);

      db.exec("DROP VIEW IF EXISTS lots;");
      db.exec("DROP TABLE batches;");
      db.exec("ALTER TABLE batches_new RENAME TO batches;");
      db.exec("CREATE VIEW IF NOT EXISTS lots AS SELECT * FROM batches;");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  const refreshedBatchColumns = db
    .prepare("PRAGMA table_info(batches)")
    .all()
    .map((column) => column.name);
  const transferColumns = db
    .prepare("PRAGMA table_info(batch_transfers)")
    .all()
    .map((column) => column.name);
  if (!transferColumns.includes("overdue_notified_at")) {
    db.exec("ALTER TABLE batch_transfers ADD COLUMN overdue_notified_at TEXT");
  }

  const transferTableSql =
    db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'batch_transfers'",
      )
      .get()?.sql || "";

  if (transferTableSql && !transferTableSql.includes("'cancelled'")) {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`
        CREATE TABLE batch_transfers_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_id INTEGER NOT NULL,
          from_organization_id INTEGER NOT NULL,
          to_organization_id INTEGER NOT NULL,
          requester_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','cancelled')),
          note TEXT,
          reason TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          overdue_notified_at TEXT,
          FOREIGN KEY (batch_id) REFERENCES batches(id),
          FOREIGN KEY (from_organization_id) REFERENCES organizations(id),
          FOREIGN KEY (to_organization_id) REFERENCES organizations(id),
          FOREIGN KEY (requester_id) REFERENCES users(id)
        );
        INSERT INTO batch_transfers_new (
          id, batch_id, from_organization_id, to_organization_id, requester_id,
          status, note, reason, created_at, updated_at, overdue_notified_at
        )
        SELECT
          id, batch_id, from_organization_id, to_organization_id, requester_id,
          status, note, reason, created_at, updated_at, overdue_notified_at
        FROM batch_transfers;
        DROP TABLE batch_transfers;
        ALTER TABLE batch_transfers_new RENAME TO batch_transfers;
      `);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  db.exec(`
    CREATE VIEW IF NOT EXISTS lots AS SELECT * FROM batches;
    CREATE VIEW IF NOT EXISTS lot_transfers AS
    SELECT
      id,
      batch_id AS lot_id,
      from_organization_id AS sender_org_id,
      to_organization_id AS receiver_org_id,
      CASE
        WHEN status = 'pending' THEN 'PENDING'
        WHEN status = 'confirmed' THEN 'APPROVED'
        WHEN status = 'rejected' THEN 'REJECTED'
        WHEN status = 'cancelled' THEN 'CANCELLED'
        ELSE UPPER(status)
      END AS status,
      reason AS reject_reason,
      created_at,
      updated_at
    FROM batch_transfers;

    CREATE TABLE IF NOT EXISTS batch_lineage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_batch_id INTEGER NOT NULL,
      child_batch_id INTEGER NOT NULL,
      quantity_transferred REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_batch_id) REFERENCES batches(id),
      FOREIGN KEY (child_batch_id) REFERENCES batches(id)
    );
    CREATE INDEX IF NOT EXISTS idx_batch_lineage_parent ON batch_lineage(parent_batch_id);
    CREATE INDEX IF NOT EXISTS idx_batch_lineage_child ON batch_lineage(child_batch_id);

    CREATE VIEW IF NOT EXISTS events AS
    SELECT
      id,
      batch_id,
      event_type,
      actor_id,
      data_json AS payload,
      previous_hash AS prev_hash,
      current_hash AS hash,
      timestamp AS created_at
    FROM event_logs;
  `);
  if (!refreshedBatchColumns.includes("cold_chain_alert")) {
    db.exec(
      "ALTER TABLE batches ADD COLUMN cold_chain_alert INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!refreshedBatchColumns.includes("consumed_quantity")) {
    db.exec(
      "ALTER TABLE batches ADD COLUMN consumed_quantity REAL NOT NULL DEFAULT 0",
    );
  }
  if (!refreshedBatchColumns.includes("location_id")) {
    db.exec(
      "ALTER TABLE batches ADD COLUMN location_id INTEGER REFERENCES locations(id)",
    );
  }

  const locationColumns = db
    .prepare("PRAGMA table_info(locations)")
    .all()
    .map((c) => c.name);

  if (!locationColumns.includes("code")) {
    db.exec("ALTER TABLE locations ADD COLUMN code TEXT");
    const existingLocs = db.prepare("SELECT id FROM locations").all();
    for (const loc of existingLocs) {
      db.prepare("UPDATE locations SET code = ? WHERE id = ?").run(
        `CH-${String(loc.id).padStart(3, "0")}`,
        loc.id,
      );
    }
  }
  if (!locationColumns.includes("phone")) {
    db.exec("ALTER TABLE locations ADD COLUMN phone TEXT");
  }
  if (!locationColumns.includes("type")) {
    db.exec("ALTER TABLE locations ADD COLUMN type TEXT NOT NULL DEFAULT 'STORE'");
  }
  if (!locationColumns.includes("status")) {
    db.exec("ALTER TABLE locations ADD COLUMN status TEXT NOT NULL DEFAULT 'Active'");
  }
  if (!locationColumns.includes("updated_at")) {
    db.exec("ALTER TABLE locations ADD COLUMN updated_at TEXT");
    db.exec("UPDATE locations SET updated_at = datetime('now') WHERE updated_at IS NULL");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS internal_batch_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_code TEXT NOT NULL UNIQUE,
      source_batch_id INTEGER NOT NULL,
      target_batch_id INTEGER,
      location_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      note TEXT,
      actor_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_batch_id) REFERENCES batches(id),
      FOREIGN KEY (target_batch_id) REFERENCES batches(id),
      FOREIGN KEY (location_id) REFERENCES locations(id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_internal_transfers_org ON internal_batch_transfers(organization_id);
    CREATE INDEX IF NOT EXISTS idx_internal_transfers_batch ON internal_batch_transfers(source_batch_id);
    CREATE INDEX IF NOT EXISTS idx_internal_transfers_location ON internal_batch_transfers(location_id);

    CREATE TABLE IF NOT EXISTS stock_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_code TEXT NOT NULL UNIQUE,
      organization_id INTEGER NOT NULL,
      source_location_id INTEGER,
      destination_location_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('PENDING','COMPLETED','CANCELLED','pending','completed','cancelled')),
      note TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (source_location_id) REFERENCES locations(id),
      FOREIGN KEY (destination_location_id) REFERENCES locations(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_stock_transfers_org ON stock_transfers(organization_id);
    CREATE INDEX IF NOT EXISTS idx_stock_transfers_dest ON stock_transfers(destination_location_id);

    CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL,
      batch_id INTEGER NOT NULL,
      target_batch_id INTEGER,
      quantity REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
      FOREIGN KEY (batch_id) REFERENCES batches(id),
      FOREIGN KEY (target_batch_id) REFERENCES batches(id)
    );
    CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_tid ON stock_transfer_items(transfer_id);
    CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_bid ON stock_transfer_items(batch_id);
  `);

  const batchIndexes = [
    {
      name: "idx_batches_parent",
      sql: "CREATE INDEX IF NOT EXISTS idx_batches_parent ON batches(parent_batch_id)",
      present: batchColumns.includes("parent_batch_id"),
    },
    {
      name: "idx_batches_root",
      sql: "CREATE INDEX IF NOT EXISTS idx_batches_root ON batches(root_batch_id)",
      present: batchColumns.includes("root_batch_id"),
    },
  ];

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_organization_role ON users(organization_id, role);
    CREATE INDEX IF NOT EXISTS idx_batches_organization ON batches(organization_id);
    CREATE INDEX IF NOT EXISTS idx_batches_location ON batches(location_id);
    CREATE INDEX IF NOT EXISTS idx_locations_org ON locations(organization_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_event_logs_batch ON event_logs(batch_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_batch_transfers_status ON batch_transfers(status);
    CREATE INDEX IF NOT EXISTS idx_temperature_logs_batch_time ON temperature_logs(batch_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_recall_items_batch ON recall_items(batch_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_batch_relations_parent ON batch_relations(parent_batch_id);
    CREATE INDEX IF NOT EXISTS idx_batch_relations_child ON batch_relations(child_batch_id);

    CREATE TRIGGER IF NOT EXISTS event_logs_prevent_update
    BEFORE UPDATE ON event_logs
    BEGIN
      SELECT RAISE(ABORT, 'event_logs are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS event_logs_prevent_delete
    BEFORE DELETE ON event_logs
    BEGIN
      SELECT RAISE(ABORT, 'event_logs are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_logs_prevent_update
    BEFORE UPDATE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'audit_logs are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_logs_prevent_delete
    BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'audit_logs are immutable');
    END;
  `);

  for (const index of batchIndexes) {
    if (index.present) {
      db.exec(index.sql);
    }
  }

  // ─── SPRINT 5 MIGRATIONS (T-70, T-84) ──────────────────────────────────────
  const currentBatchSql =
    db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'batches'",
      )
      .get()?.sql || "";

  if (!currentBatchSql.includes("'recalling'")) {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`
        CREATE TABLE batches_v5 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_code TEXT NOT NULL UNIQUE,
          product_id INTEGER NOT NULL,
          organization_id INTEGER NOT NULL,
          source_farm_id INTEGER,
          parent_batch_id INTEGER,
          root_batch_id INTEGER,
          source_batch_ids TEXT,
          initial_quantity REAL NOT NULL,
          remaining_quantity REAL NOT NULL,
          consumed_quantity REAL NOT NULL DEFAULT 0,
          current_location TEXT,
          location_id INTEGER,
          temperature_c REAL,
          cold_chain_alert INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','pending_confirmation','processed','in_transit','delivered','recalled','consumed','CONSUMED','active','ACTIVE','QUARANTINED','quarantined','RECALLED','recalling','RECALLING')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (organization_id) REFERENCES organizations(id),
          FOREIGN KEY (source_farm_id) REFERENCES farms(id),
          FOREIGN KEY (parent_batch_id) REFERENCES batches(id),
          FOREIGN KEY (root_batch_id) REFERENCES batches(id),
          FOREIGN KEY (location_id) REFERENCES locations(id)
        );
      `);

      db.exec(`
        INSERT INTO batches_v5 (
          id, batch_code, product_id, organization_id, source_farm_id,
          parent_batch_id, root_batch_id, source_batch_ids,
          initial_quantity, remaining_quantity, consumed_quantity,
          current_location, location_id, temperature_c, cold_chain_alert,
          status, created_at, updated_at
        )
        SELECT
          id, batch_code, product_id, organization_id, source_farm_id,
          parent_batch_id, root_batch_id, source_batch_ids,
          initial_quantity, remaining_quantity, coalesce(consumed_quantity, 0),
          current_location, location_id, temperature_c, coalesce(cold_chain_alert, 0),
          status, created_at, updated_at
        FROM batches;
      `);

      db.exec("DROP VIEW IF EXISTS lots;");
      db.exec("DROP TABLE batches;");
      db.exec("ALTER TABLE batches_v5 RENAME TO batches;");
      db.exec("CREATE VIEW IF NOT EXISTS lots AS SELECT * FROM batches;");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  // T-84: Migration cho bảng notifications (org_id, type, is_read)
  const notifCols = db
    .prepare("PRAGMA table_info(notifications)")
    .all()
    .map((c) => c.name);

  if (!notifCols.includes("org_id")) {
    db.exec("ALTER TABLE notifications ADD COLUMN org_id INTEGER REFERENCES organizations(id)");
    db.exec("UPDATE notifications SET org_id = organization_id WHERE org_id IS NULL");
  }
  if (!notifCols.includes("type")) {
    db.exec("ALTER TABLE notifications ADD COLUMN type TEXT DEFAULT 'recall'");
    db.exec("UPDATE notifications SET type = kind WHERE type IS NULL");
  }
  if (!notifCols.includes("is_read")) {
    db.exec("ALTER TABLE notifications ADD COLUMN is_read INTEGER DEFAULT 0");
    db.exec("UPDATE notifications SET is_read = CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END WHERE is_read IS NULL");
  }

  // T-70: Migration cho bảng recalls và recall_affected_batches
  db.exec(`
    CREATE TABLE IF NOT EXISTS recalls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recall_code TEXT NOT NULL UNIQUE,
      root_batch_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CLOSED', 'active', 'closed')),
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (root_batch_id) REFERENCES batches(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_recalls_code ON recalls(recall_code);
    CREATE INDEX IF NOT EXISTS idx_recalls_root ON recalls(root_batch_id);
    CREATE INDEX IF NOT EXISTS idx_recalls_status ON recalls(status);

    CREATE TABLE IF NOT EXISTS recall_affected_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recall_id INTEGER NOT NULL,
      batch_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      current_location TEXT,
      remaining_quantity REAL NOT NULL,
      consumed_quantity REAL NOT NULL DEFAULT 0,
      is_blended INTEGER NOT NULL DEFAULT 0,
      quarantine_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(quarantine_status IN ('PENDING', 'QUARANTINED', 'pending', 'quarantined')),
      quarantine_location TEXT,
      quarantined_at TEXT,
      quarantined_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recall_id) REFERENCES recalls(id) ON DELETE CASCADE,
      FOREIGN KEY (batch_id) REFERENCES batches(id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (quarantined_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_recall_affected_recall ON recall_affected_batches(recall_id);
    CREATE INDEX IF NOT EXISTS idx_recall_affected_batch ON recall_affected_batches(batch_id);
    CREATE INDEX IF NOT EXISTS idx_recall_affected_org ON recall_affected_batches(organization_id);
  `);

  // Migration 007: Add harvested_at & land_plot_id to batches if not present
  const batchCols = db.prepare("PRAGMA table_info(batches)").all();
  if (!batchCols.some((c) => c.name === "harvested_at")) {
    db.exec("ALTER TABLE batches ADD COLUMN harvested_at TEXT;");
  }
  if (!batchCols.some((c) => c.name === "land_plot_id")) {
    db.exec("ALTER TABLE batches ADD COLUMN land_plot_id INTEGER REFERENCES land_plots(id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_batches_land_plot ON batches(land_plot_id);");
  }

  // Backfill harvested_at and land_plot_id from event_logs
  try {
    const harvestLogs = db
      .prepare(
        "SELECT batch_id, data_json, timestamp FROM event_logs WHERE event_type = 'batch_harvested'",
      )
      .all();
    for (const log of harvestLogs) {
      try {
        const data = JSON.parse(log.data_json);
        const hAt = data.harvested_at || log.timestamp;
        const plotId = data.land_plot_id;
        if (hAt && plotId) {
          db.prepare(
            "UPDATE batches SET harvested_at = ?, land_plot_id = ?, created_at = ? WHERE id = ?",
          ).run(hAt, plotId, hAt, log.batch_id);
        } else if (hAt) {
          db.prepare(
            "UPDATE batches SET harvested_at = ?, created_at = ? WHERE id = ?",
          ).run(hAt, hAt, log.batch_id);
        }
      } catch {
        // Skip unparsable logs
      }
    }
  } catch {
    // Ignore backfill errors
  }

  const migration = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .get();
  if (!migration) {
    db.exec(
      "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
    );
  }

  db.prepare("INSERT OR IGNORE INTO schema_migrations(name) VALUES (?)").run(
    "001_initial_schema",
  );
  db.prepare("INSERT OR IGNORE INTO schema_migrations(name) VALUES (?)").run(
    "004_sprint4_schema",
  );
  db.prepare("INSERT OR IGNORE INTO schema_migrations(name) VALUES (?)").run(
    "005_internal_batch_distribution",
  );
  db.prepare("INSERT OR IGNORE INTO schema_migrations(name) VALUES (?)").run(
    "006_sprint5_recalls_and_notifications",
  );
  db.prepare("INSERT OR IGNORE INTO schema_migrations(name) VALUES (?)").run(
    "007_batch_harvested_at_and_land_plot",
  );
}

