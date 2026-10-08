import { getDb } from "./database.js";
import { runMigrations } from "./migrations.js";
import { seedDemoData } from "./seed.js";

const db = getDb();
try {
  db.exec("PRAGMA foreign_keys = OFF;");
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .all();
  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table.name}`);
  }
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations();
  seedDemoData();
  console.log("Database reset completed.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  db.close();
}
