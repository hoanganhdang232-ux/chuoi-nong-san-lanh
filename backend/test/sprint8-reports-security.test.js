import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { createApp } = await import("../src/app.js");
const { getDb } = await import("../src/db/database.js");
const { runMigrations } = await import("../src/db/migrations.js");
const { seedDemoData } = await import("../src/db/seed.js");
const { createToken, findUserByEmail } = await import("../src/services/authService.js");
const { generateInspectionDossierPdf } = await import("../src/services/sprint8PdfService.js");
const { runSystemIntegrityScan } = await import("../src/services/sprint8IntegrityWorker.js");
const { performBackup } = await import("../../scripts/backup_db.js");
const { performRestore } = await import("../../scripts/restore_db.js");

let server;
let baseUrl;
const db = getDb();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resetDatabase() {
  runMigrations();
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(`
    DROP TRIGGER IF EXISTS event_logs_prevent_update;
    DROP TRIGGER IF EXISTS event_logs_prevent_delete;
    DROP TRIGGER IF EXISTS audit_logs_prevent_update;
    DROP TRIGGER IF EXISTS audit_logs_prevent_delete;
  `);
  for (const table of [
    "system_integrity_logs",
    "privacy_anonymization_requests",
    "transporters",
    "certifications",
    "notifications",
    "recall_items",
    "recall_cases",
    "cold_chain_alerts",
    "temperature_logs",
    "event_logs",
    "batch_transfers",
    "batches",
    "products",
    "land_plots",
    "farms",
    "users",
    "organizations",
  ]) {
    try {
      db.exec(`DELETE FROM ${table}`);
    } catch {
      // ignore
    }
  }
  db.exec("DELETE FROM sqlite_sequence;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations();
  seedDemoData();
}

function authHeaders(user) {
  return {
    Authorization: `Bearer ${createToken(user)}`,
    "Content-Type": "application/json",
  };
}

describe("SPRINT 8 - Reports, Inspector Dossier & Security Test Suite", () => {
  before(async () => {
    resetDatabase();
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test("T-124: GET /api/v1/inspector/trace/:batch_code tra cứu toàn diện liên tổ chức", async () => {
    const auditorUser = findUserByEmail("auditor@agritrace.demo");
    const batch = db.prepare("SELECT id, batch_code, public_code FROM batches LIMIT 1").get();
    assert.ok(batch);

    // 1. Thử gọi unauthenticated -> phải 401
    const unauthRes = await fetch(`${baseUrl}/api/v1/inspector/trace/${batch.batch_code}`);
    assert.equal(unauthRes.status, 401);

    // 2. Thử gọi với tài khoản consumer -> phải 403
    const consumerUser = findUserByEmail("consumer@agritrace.demo");
    const forbiddenRes = await fetch(`${baseUrl}/api/v1/inspector/trace/${batch.batch_code}`, {
      headers: authHeaders(consumerUser),
    });
    assert.equal(forbiddenRes.status, 403);

    // 3. Gọi với tài khoản cán bộ kiểm tra (auditor / inspector) -> 200 OK
    const res = await fetch(`${baseUrl}/api/v1/inspector/trace/${batch.batch_code}`, {
      headers: authHeaders(auditorUser),
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(data.dossierCode.startsWith("DOSSIER-"));
    assert.equal(data.batch.batchCode, batch.batch_code);
    assert.ok(data.origin.farmName);
    assert.ok(Array.isArray(data.organizationsInvolved));
    assert.ok(Array.isArray(data.transfers));
    assert.ok(data.coldChain.thresholds);
    assert.ok(data.hashChain.isChainValid);
    assert.ok(data.hashChain.blockCount >= 1);
    assert.ok(data.inspectorMeta.regulationCompliance.includes("13/2023"));
  });

  test("T-126 & T-127 & T-128: Xuất hồ sơ PDF và đóng dấu xác thực Hash Chain (VALID/INVALID)", async () => {
    const auditorUser = findUserByEmail("auditor@agritrace.demo");
    const batch = db.prepare("SELECT id, batch_code FROM batches LIMIT 1").get();
    assert.ok(batch);

    // Test service trực tiếp
    const pdfBuffer = await generateInspectionDossierPdf(batch.batch_code, {
      actorName: "Thanh tra viên Nguyễn Văn A",
      actorRole: "Trưởng đoàn kiểm tra",
    });

    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.ok(pdfBuffer.length > 1000, "PDF phải có dung lượng lớn hơn 1KB");
    // Kiểm tra định dạng PDF magic bytes: %PDF-
    assert.equal(pdfBuffer.slice(0, 4).toString(), "%PDF");

    // Test REST API GET /api/v1/inspector/export-pdf/:batch_code
    const res = await fetch(`${baseUrl}/api/v1/inspector/export-pdf/${batch.batch_code}`, {
      headers: authHeaders(auditorUser),
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.ok(res.headers.get("content-disposition")?.includes(`Ho_So_Kiem_Tra_${batch.batch_code}.pdf`));

    const apiBuffer = Buffer.from(await res.arrayBuffer());
    assert.equal(apiBuffer.slice(0, 4).toString(), "%PDF");
  });

  test("T-129: GET /api/v1/analytics/transporter-violations trả về thống kê tỷ lệ vi phạm theo nhà xe", async () => {
    const auditorUser = findUserByEmail("auditor@agritrace.demo");

    const res = await fetch(`${baseUrl}/api/v1/analytics/transporter-violations`, {
      headers: authHeaders(auditorUser),
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(data.kpis);
    assert.ok(data.kpis.totalTransporters >= 4, "Phải có ít nhất 4 nhà xe được cấu hình");
    assert.ok(Array.isArray(data.transporters));

    const first = data.transporters[0];
    assert.ok(first.code);
    assert.ok(first.name);
    assert.ok(first.complianceTier);
    assert.ok(typeof first.violationRatePct === "number");

    // Kiểm tra API lấy danh sách transporters
    const listRes = await fetch(`${baseUrl}/api/v1/transporters`, {
      headers: authHeaders(auditorUser),
    });
    assert.equal(listRes.status, 200);
    const transportersList = await listRes.json();
    assert.ok(transportersList.length >= 4);
  });

  test("T-131 & T-132: Quét toàn vẹn Hash Chain hệ thống và phát hiện xâm nhập/can thiệp trái phép", async () => {
    const auditorUser = findUserByEmail("auditor@agritrace.demo");

    // 1. Quét ban đầu khi hệ thống nguyên vẹn -> VALID
    const cleanScan = runSystemIntegrityScan({ triggeredBy: "UNIT_TEST_CLEAN" });
    assert.equal(cleanScan.status, "VALID");
    assert.equal(cleanScan.corruptedCount, 0);
    assert.ok(cleanScan.validCount >= 1);

    // 2. Cố tình can thiệp trái phép vào 1 khối sự kiện để kiểm tra cơ chế chống giả mạo
    const event = db.prepare("SELECT id, previous_hash FROM event_logs WHERE id > 1 LIMIT 1").get();
    if (event) {
      db.exec("DROP TRIGGER IF EXISTS event_logs_prevent_update;");
      db.prepare("UPDATE event_logs SET previous_hash = ? WHERE id = ?").run(
        "TAMPERED_PREVIOUS_HASH_HEX_12345",
        event.id,
      );

      // 3. Quét lại -> Hệ thống phải phát hiện ra CORRUPTED và lưu nhật ký cảnh báo đỏ
      const corruptedScan = runSystemIntegrityScan({ triggeredBy: "UNIT_TEST_TAMPER" });
      assert.equal(corruptedScan.status, "CORRUPTED");
      assert.ok(corruptedScan.corruptedCount >= 1);
      assert.ok(corruptedScan.corruptedBatches.length >= 1);

      // Khôi phục lại dữ liệu để các bài test sau không bị ảnh hưởng
      db.prepare("UPDATE event_logs SET previous_hash = ? WHERE id = ?").run(
        event.previous_hash,
        event.id,
      );
      runMigrations();
    }

    // 4. Kiểm tra API GET /api/v1/system/integrity-runs
    const runsRes = await fetch(`${baseUrl}/api/v1/system/integrity-runs`, {
      headers: authHeaders(auditorUser),
    });
    assert.equal(runsRes.status, 200);
    const history = await runsRes.json();
    assert.ok(history.total >= 1);
    assert.ok(Array.isArray(history.runs));
  });

  test("T-133, T-134 & T-135: Ẩn danh hóa dữ liệu nông hộ tuân thủ NĐ 13/2023 mà không làm vỡ Hash Chain", async () => {
    const auditorUser = findUserByEmail("auditor@agritrace.demo");
    const farmer = db.prepare("SELECT id, name, email FROM users WHERE role = 'user' LIMIT 1").get();
    assert.ok(farmer);

    // Gọi API ẩn danh hóa
    const res = await fetch(`${baseUrl}/api/v1/privacy/anonymize-farmer`, {
      method: "POST",
      headers: authHeaders(auditorUser),
      body: JSON.stringify({
        targetType: "user",
        targetId: farmer.id,
        reason: "Yêu cầu xóa/ẩn danh dữ liệu cá nhân theo Điều 16 Nghị định 13/2023/NĐ-CP",
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.success, true);
    assert.ok(data.pseudonym.startsWith("Hộ nông dân PII-"));
    assert.equal(data.isHashIntegrityPreserved, true, "Hash Chain phải được bảo toàn 100%");

    // Kiểm tra CSDL đã cập nhật trường ẩn danh
    const updatedUser = db.prepare("SELECT name, email, is_anonymized, pseudonym FROM users WHERE id = ?").get(farmer.id);
    assert.equal(updatedUser.is_anonymized, 1);
    assert.ok(updatedUser.name.startsWith("Hộ nông dân PII-"));
    assert.ok(updatedUser.email.includes("@privacy.agritrace.internal"));

    // Kiểm tra API lấy danh sách yêu cầu ẩn danh
    const listRes = await fetch(`${baseUrl}/api/v1/privacy/anonymization-requests`, {
      headers: authHeaders(auditorUser),
    });
    assert.equal(listRes.status, 200);
    const reqList = await listRes.json();
    assert.ok(reqList.total >= 1);
  });

  test("T-136 & T-137: Tự động sao lưu và khôi phục CSDL an toàn (Backup & Disaster Recovery)", async () => {
    const testBackupDir = path.resolve(__dirname, "../../test-backups-temp");

    // 1. Thực hiện sao lưu
    const backupResult = performBackup({
      customBackupDir: testBackupDir,
      retentionDays: 7,
    });

    assert.ok(backupResult.fileName.endsWith(".db.gz"));
    assert.ok(fs.existsSync(backupResult.filePath));
    assert.ok(backupResult.checksumSha256);

    // Kiểm tra tệp .sha256 được tạo kèm
    const checksumFile = `${backupResult.filePath}.sha256`;
    assert.ok(fs.existsSync(checksumFile));

    // 2. Thực hiện khôi phục
    const tempTargetDb = path.join(testBackupDir, "agritrace_restored_test.db");
    const restoreResult = await performRestore({
      backupFilePath: backupResult.filePath,
      targetDbPath: tempTargetDb,
    });

    assert.equal(restoreResult.success, true);
    assert.equal(restoreResult.checksumSha256, backupResult.checksumSha256);
    assert.ok(fs.existsSync(tempTargetDb));

    // Dọn dẹp thư mục test tạm
    try {
      fs.rmSync(testBackupDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });
});
