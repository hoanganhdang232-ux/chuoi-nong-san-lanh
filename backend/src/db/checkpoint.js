import { getDb } from "./database.js";

try {
  const db = getDb();
  const res = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  console.log("Database checkpointed successfully to agritrace.db:", res);
} catch (err) {
  console.error("Lỗi checkpoint database:", err);
  process.exitCode = 1;
}
