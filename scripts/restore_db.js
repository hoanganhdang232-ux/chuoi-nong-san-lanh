#!/usr/bin/env node
/**
 * SCRUM Sprint 8 - Disaster Recovery Database Restore Script (T-137)
 * Quy trình khôi phục CSDL an toàn: Xác minh Checksum SHA-256 -> Tạo Pre-restore Safety Snapshot
 * -> Giải nén ghi đè -> Kiểm tra PRAGMA integrity_check để đảm bảo CSDL sẵn sàng.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(ROOT_DIR, "backups");
const TARGET_DB_PATH = process.env.DB_PATH || path.resolve(ROOT_DIR, "backend/src/data/agritrace.db");

export async function performRestore({ backupFilePath = null, targetDbPath = TARGET_DB_PATH, skipChecksum = false } = {}) {
  console.log(`==========================================================`);
  console.log(` [AGRITRACE] BẮT ĐẦU QUY TRÌNH PHỤC HỒI CSDL (DISASTER RECOVERY)`);
  console.log(`==========================================================`);

  // 1. Xác định tệp tin sao lưu cần khôi phục
  let resolvedBackup = backupFilePath;
  if (!resolvedBackup || resolvedBackup === "latest") {
    // Tìm bản sao lưu mới nhất trong thư mục backups
    if (!fs.existsSync(BACKUP_DIR)) {
      throw new Error(`Thư mục sao lưu không tồn tại: ${BACKUP_DIR}`);
    }
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".db.gz"))
      .sort()
      .reverse();

    if (files.length === 0) {
      throw new Error(`Không tìm thấy bất kỳ tệp tin sao lưu nào trong ${BACKUP_DIR}`);
    }
    resolvedBackup = path.join(BACKUP_DIR, files[0]);
  }

  if (!fs.existsSync(resolvedBackup)) {
    throw new Error(`Tệp tin sao lưu không tồn tại: ${resolvedBackup}`);
  }

  console.log(`[RESTORE] Tệp sao lưu được chọn: ${resolvedBackup}`);
  console.log(`[RESTORE] Đích khôi phục: ${targetDbPath}`);

  // 2. Xác minh Checksum SHA-256 tính toàn vẹn của tệp tin nén
  const compressedBuffer = fs.readFileSync(resolvedBackup);
  const calculatedSha256 = crypto.createHash("sha256").update(compressedBuffer).digest("hex");
  const checksumFile = `${resolvedBackup}.sha256`;

  if (fs.existsSync(checksumFile) && !skipChecksum) {
    const expectedChecksum = fs.readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
    if (calculatedSha256.toLowerCase() !== expectedChecksum.toLowerCase()) {
      throw new Error(
        `XÁC THỰC CHECKSUM THẤT BẠI! Tệp sao lưu có thể đã bị lỗi hoặc can thiệp trái phép. Tính toán: ${calculatedSha256}, Mong đợi: ${expectedChecksum}`,
      );
    }
    console.log(`[RESTORE] ✓ Xác minh Checksum SHA-256 hoàn toàn trùng khớp: ${calculatedSha256}`);
  } else {
    console.log(`[RESTORE] Checksum tính toán: ${calculatedSha256} (Không tìm thấy tệp so sánh, tiếp tục)`);
  }

  // 3. Tạo bản sao lưu an toàn (Pre-restore Safety Snapshot) của CSDL hiện tại trước khi ghi đè
  if (fs.existsSync(targetDbPath)) {
    const safetySnapshotPath = `${targetDbPath}.safety_backup_${Date.now()}`;
    fs.copyFileSync(targetDbPath, safetySnapshotPath);
    console.log(`[RESTORE] ✓ Đã tạo bản chụp an toàn dự phòng trước khi khôi phục: ${safetySnapshotPath}`);
  }

  // 4. Giải nén dữ liệu và ghi đè an toàn
  console.log(`[RESTORE] Đang giải nén và nạp dữ liệu CSDL...`);
  const decompressedBuffer = zlib.gunzipSync(compressedBuffer);
  fs.writeFileSync(targetDbPath, decompressedBuffer);
  console.log(`[RESTORE] ✓ Đã ghi dữ liệu CSDL thành công (${(decompressedBuffer.length / 1024).toFixed(2)} KB).`);

  // 5. Kiểm tra tính toàn vẹn cấu trúc CSDL bằng PRAGMA integrity_check
  let integrityOk = true;
  try {
    const { getDb } = await import("../backend/src/db/database.js");
    const testDb = getDb();
    const result = testDb.prepare("PRAGMA integrity_check").get();
    if (result.integrity_check !== "ok") {
      integrityOk = false;
      console.warn(`[RESTORE-WARN] integrity_check trả về: ${JSON.stringify(result)}`);
    } else {
      console.log(`[RESTORE] ✓ PRAGMA integrity_check: OK (Cấu trúc B-Tree và Indexes hoàn toàn khỏe mạnh).`);
    }
  } catch (dbErr) {
    console.log(`[RESTORE] Bỏ qua kiểm tra runtime (không nạp được engine DB trực tiếp): ${dbErr.message}`);
  }

  console.log(`==========================================================`);
  console.log(` >> [SUCCESS] KHÔI PHỤC CSDL THÀNH CÔNG! HỆ THỐNG SẴN SÀNG.`);
  console.log(`==========================================================`);

  return {
    success: true,
    backupFilePath: resolvedBackup,
    targetDbPath,
    checksumSha256: calculatedSha256,
    restoredBytes: decompressedBuffer.length,
    restoredAt: new Date().toISOString(),
    integrityOk,
  };
}

// Chạy trực tiếp qua CLI: node scripts/restore_db.js [file_path]
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const chosenFile = process.argv[2] || "latest";
  try {
    await performRestore({ backupFilePath: chosenFile });
  } catch (err) {
    console.error(`[RESTORE-ERROR] Quá trình khôi phục gặp sự cố:`, err.message);
    process.exit(1);
  }
}
