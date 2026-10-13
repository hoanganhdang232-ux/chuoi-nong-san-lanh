import { getDb } from "./database.js";
import { runMigrations } from "./migrations.js";

console.log("Applying database migrations...");
const db = getDb();
try {
  runMigrations();
  console.log("Database migrations applied successfully.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  db.close();
}
