import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseFile = path.resolve(__dirname, "../", config.databasePath);
const databaseDir = path.dirname(databaseFile);

if (!existsSync(databaseDir)) {
  mkdirSync(databaseDir, { recursive: true });
}

const database = new DatabaseSync(databaseFile);
database.exec("PRAGMA journal_mode = WAL;");
database.exec("PRAGMA foreign_keys = ON;");

export function getDb() {
  return database;
}
