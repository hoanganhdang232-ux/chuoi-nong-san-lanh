import { getDb } from "./database.js";
import { runMigrations } from "./migrations.js";

console.log("Starting database migrations...");

try {
  runMigrations();
  console.log("Database migrations completed successfully.");
} catch (error) {
  console.error("Database migration failed:", error);
  process.exit(1);
} finally {
  const db = getDb();
  if (db && typeof db.close === "function") {
    db.close();
  }
}
