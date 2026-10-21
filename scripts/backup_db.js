#!/usr/bin/env node
/**
 * SCRUM Sprint 8 - DevOps Automated Database Backup Script (T-136)
 * Tự động sao lưu an toàn CSDL (SQLite / PostgreSQL), nén gzip, tính checksum SHA-256
 * và quản lý xoay vòng vòng đời bản sao lưu (Retention policy 30 ngày).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(ROOT_DIR, "backups");
const DB_PATH = process.env.DB_PATH || path.resolve(ROOT_DIR, "backend/src/data/agritrace.db");
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10);

export function performBackup({ customDbPath = DB_PATH, customBackupDir = BACKUP_DIR, retentionDays = RETENTION_DAYS } = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupBaseName = `agritrace_backup_${timestamp}`;
  const rawBackupPath = path.join(customBackupDir, `${backupBaseName}.db`);
  const gzBackupPath = `${rawBackupPath}.gz`;
  const checksumPath = `${gzBackupPath}.sha256`;
  const manifestPath = path.join(customBackupDir, "backup_manifest.json");

  console.log(`[BACKUP] Bắt đầu quy trình sao lưu CSDL Agritrace...`);
  console.log(`[BACKUP] CSDL nguồn: ${customDbPath}`);
  console.log(`[BACKUP] Thư mục lưu trữ: ${customBackupDir}`);

  if (!fs.existsSync(customDbPath)) {
    throw new Error(`Tệp tin CSDL nguồn không tồn tại tại '${customDbPath}'.`);
  }

  if (!fs.existsSync(customBackupDir)) {
    fs.mkdirSync(customBackupDir, { recursive: true });
  }

  // 1. Sao chép snapshot an toàn: Đồng bộ WAL vào file .db trước khi đọc
  if (customDbPath.endsWith(".db")) {
    try {
      const syncDb = new DatabaseSync(customDbPath);
      syncDb.exec("PRAGMA wal_checkpoint(PASSIVE);");
    } catch {
      // Bỏ qua nếu CSDL đang mở hoặc môi trường không hỗ trợ
    }
  }

  // Đọc dữ liệu nhị phân của CSDL hiện tại
  const dbBuffer = fs.readFileSync(customDbPath);
  const rawSize = dbBuffer.length;

  // 2. Nén tệp tin CSDL bằng gzip mức nén tối ưu (level 9)
  console.log(`[BACKUP] Đang nén dữ liệu (Dung lượng gốc: ${(rawSize / 1024).toFixed(2)} KB)...`);
  const compressedBuffer = zlib.gzipSync(dbBuffer, { level: 9 });
  fs.writeFileSync(gzBackupPath, compressedBuffer);
  const compressedSize = compressedBuffer.length;
  console.log(`[BACKUP] Nén thành công: ${(compressedSize / 1024).toFixed(2)} KB (Tỷ lệ: ${((compressedSize / rawSize) * 100).toFixed(1)}%)`);

  // 3. Tính toán Checksum SHA-256 xác thực tính toàn vẹn
  const sha256 = crypto.createHash("sha256").update(compressedBuffer).digest("hex");
  fs.writeFileSync(checksumPath, `${sha256}  ${path.basename(gzBackupPath)}\n`);
  console.log(`[BACKUP] Checksum SHA-256: ${sha256}`);

  // 4. Cập nhật Manifest bản sao lưu
  let manifest = { backups: [] };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      manifest = { backups: [] };
    }
  }

  const backupInfo = {
    id: `bck-${Date.now()}`,
    fileName: path.basename(gzBackupPath),
    filePath: gzBackupPath,
    checksumSha256: sha256,
    rawSizeBytes: rawSize,
    compressedSizeBytes: compressedSize,
    createdAt: new Date().toISOString(),
    retentionUntil: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString(),
    cloudSyncStatus: process.env.S3_BUCKET ? "PENDING_SYNC" : "LOCAL_ONLY",
  };

  manifest.backups.unshift(backupInfo);

  // 5. Quản lý vòng đời (Retention Policy - Xoá bản sao lưu quá hạn)
  const now = Date.now();
  const keptBackups = [];
  for (const item of manifest.backups) {
    const ageMs = now - new Date(item.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > retentionDays) {
      console.log(`[BACKUP-RETENTION] Xoá bản sao lưu quá hạn (${ageDays.toFixed(1)} ngày): ${item.fileName}`);
      try {
        if (fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath);
        const itemChecksum = `${item.filePath}.sha256`;
        if (fs.existsSync(itemChecksum)) fs.unlinkSync(itemChecksum);
      } catch (e) {
        console.warn(`[BACKUP-RETENTION] Không thể xoá tệp cũ: ${e.message}`);
      }
    } else {
      keptBackups.push(item);
    }
  }
  manifest.backups = keptBackups;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`[BACKUP] Hoàn tất sao lưu thành công! Tệp tin: ${gzBackupPath}`);
  return backupInfo;
}

// Chạy trực tiếp qua CLI: node scripts/backup_db.js
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    performBackup();
  } catch (err) {
    console.error(`[BACKUP-ERROR] Lỗi sao lưu CSDL:`, err.message);
    process.exit(1);
  }
}
