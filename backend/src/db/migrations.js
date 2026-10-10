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
      role TEXT NOT NULL CHECK(role IN ('farm_admin','processor_admin','distributor_admin','auditor','consumer','user')),
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

    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_code TEXT NOT NULL UNIQUE,
      product_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      source_farm_id INTEGER,
      initial_quantity REAL NOT NULL,
      remaining_quantity REAL NOT NULL,
      current_location TEXT,
      temperature_c REAL,
      status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','pending_confirmation','processed','in_transit','delivered','recalled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (source_farm_id) REFERENCES farms(id)
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

    CREATE TABLE IF NOT EXISTS recall_items (
      recall_id INTEGER NOT NULL,
      batch_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      current_location TEXT,
      remaining_quantity REAL NOT NULL,
      consumed_quantity REAL NOT NULL,
      PRIMARY KEY (recall_id, batch_id),
      FOREIGN KEY (recall_id) REFERENCES recall_cases(id),
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

  if (!usersTableSql.includes("'user'")) {
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
          role TEXT NOT NULL CHECK(role IN ('farm_admin','processor_admin','distributor_admin','auditor','consumer','user')),
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

  if (!batchTableSql.includes("pending_confirmation")) {
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
          current_location TEXT,
          temperature_c REAL,
          status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','pending_confirmation','processed','in_transit','delivered','recalled')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (organization_id) REFERENCES organizations(id),
          FOREIGN KEY (source_farm_id) REFERENCES farms(id),
          FOREIGN KEY (parent_batch_id) REFERENCES batches(id),
          FOREIGN KEY (root_batch_id) REFERENCES batches(id)
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

      db.exec("DROP TABLE batches;");
      db.exec("ALTER TABLE batches_new RENAME TO batches;");
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
  `);

  for (const index of batchIndexes) {
    if (index.present) {
      db.exec(index.sql);
    }
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
}
