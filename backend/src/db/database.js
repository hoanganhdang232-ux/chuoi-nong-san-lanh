import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseFile = path.resolve(__dirname, "../", config.databasePath);
const databaseDir = path.dirname(databaseFile);

if (!existsSync(databaseDir)) {
  mkdirSync(databaseDir, { recursive: true });
}

// Tự động sao lưu dữ liệu trước khi kết nối (chỉ cho database chạy thật)
if (!databaseFile.includes("test-") && existsSync(databaseFile)) {
  try {
    const backupFile = databaseFile.replace(/\.db$/, ".backup.db");
    copyFileSync(databaseFile, backupFile);
  } catch (backupErr) {
    console.warn("Không thể tạo bản sao lưu database:", backupErr.message);
  }
}

const database = new DatabaseSync(databaseFile);
database.exec("PRAGMA journal_mode = WAL;");
database.exec("PRAGMA foreign_keys = ON;");
database.exec("PRAGMA busy_timeout = 5000;");

export function getDb() {
  return database;
}
