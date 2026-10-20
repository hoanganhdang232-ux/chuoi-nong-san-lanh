/**
 * SCRUM Sprint 8: System Integrity Worker & Alerting Service
 * Sub-tasks T-131 & T-132:
 * - T-131: Background Integrity Worker / Cronjob quét toàn hệ thống
 * - T-132: Audit Logging & Alerting Service lưu system_integrity_logs và phát cảnh báo đỏ
 */
import { getDb } from "../db/database.js";
import { sendNotificationToOrg } from "./notificationService.js";

/**
 * Quét toàn bộ CSDL kiểm tra tính toàn vẹn của chuỗi Hash Chain của tất cả các lô hàng
 * @param {object} options
 * @param {number|null} options.actorId - ID người kích hoạt (hoặc null nếu cronjob tự động)
 * @param {string} options.triggeredBy - 'CRONJOB' | 'MANUAL_ADMIN' | 'INSPECTOR_AUDIT'
 * @returns {object} Kết quả đợt kiểm tra
 */
export function runSystemIntegrityScan({ actorId = null, triggeredBy = "CRONJOB" } = {}) {
  const db = getDb();
  const startTime = Date.now();

  const batches = db
    .prepare("SELECT id, batch_code, public_code, organization_id FROM batches ORDER BY id ASC")
    .all();

  const corruptedBatches = [];
  let validBatchesCount = 0;

  for (const batch of batches) {
    const events = db
      .prepare(
        `SELECT id, batch_id, event_type, previous_hash, current_hash, timestamp
         FROM event_logs
         WHERE batch_id = ?
         ORDER BY id ASC`,
      )
      .all(batch.id);

    if (events.length === 0) {
      validBatchesCount++;
      continue;
    }

    let batchIntact = true;
    let brokenStep = null;

    for (let i = 1; i < events.length; i++) {
      if (events[i].previous_hash !== events[i - 1].current_hash) {
        batchIntact = false;
        brokenStep = {
          brokenAtBlock: i + 1,
          eventId: events[i].id,
          expectedPreviousHash: events[i - 1].current_hash,
          actualPreviousHash: events[i].previous_hash,
        };
        break;
      }
    }

    if (batchIntact) {
      validBatchesCount++;
    } else {
      corruptedBatches.push({
        batchId: batch.id,
        batchCode: batch.batch_code,
        publicCode: batch.public_code,
        organizationId: batch.organization_id,
        ...brokenStep,
      });
    }
  }

  const durationMs = Date.now() - startTime;
  const isAllValid = corruptedBatches.length === 0;
  const status = isAllValid ? "VALID" : "CORRUPTED";

  const detailsJson = JSON.stringify({
    totalBatches: batches.length,
    validBatchesCount,
    corruptedBatchesCount: corruptedBatches.length,
    corruptedBatches,
    scannedAt: new Date().toISOString(),
  });

  // Ghi nhật ký vào bảng system_integrity_logs
  const insertLog = db.prepare(`
    INSERT INTO system_integrity_logs (
      run_at, total_batches, valid_count, corrupted_count, status, details_json, duration_ms, triggered_by
    ) VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = insertLog.run(
    batches.length,
    validBatchesCount,
    corruptedBatches.length,
    status,
    detailsJson,
    durationMs,
    triggeredBy,
  );

  const logId = res.lastInsertRowid;

  // T-132: Nếu phát hiện bất kỳ bản ghi nào bị can thiệp trái phép -> Phát Cảnh báo đỏ
  if (!isAllValid) {
    console.error(
      `🚨 [SECURITY ALERT] System integrity violation detected! ${corruptedBatches.length} corrupted batches found.`,
    );

    // Gửi cảnh báo đỏ đến tất cả các tổ chức và tài khoản auditor / admin
    const adminOrgs = db.prepare("SELECT DISTINCT organization_id FROM users WHERE role IN ('auditor', 'farm_admin')").all();
    for (const org of adminOrgs) {
      sendNotificationToOrg({
        orgId: org.organization_id,
        title: `🚨 BÁO ĐỘNG ĐỎ: Phát hiện ${corruptedBatches.length} lô hàng bị vi phạm Hash Chain!`,
        message: `Hệ thống quét an ninh tự động phát hiện dấu hiệu can thiệp trái phép vào chuỗi Hash của các lô hàng: ${corruptedBatches
          .map((b) => b.batchCode)
          .slice(0, 5)
          .join(", ")}. Yêu cầu thanh tra và cô lập khẩn cấp!`,
        type: "SYSTEM_ALERT",
        kind: "system_integrity",
      });
    }

    // Ghi nhật ký audit an ninh mức độ CRITICAL
    db.prepare(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, request_body)
      VALUES (?, 1, 'SYSTEM_INTEGRITY_VIOLATION_DETECTED', 'system_integrity_logs', ?, ?)
    `).run(actorId || 1, String(logId), detailsJson);
  }

  return {
    logId,
    status,
    totalBatches: batches.length,
    validCount: validBatchesCount,
    corruptedCount: corruptedBatches.length,
    corruptedBatches,
    durationMs,
    triggeredBy,
    runAt: new Date().toISOString(),
  };
}

/**
 * Lấy lịch sử các đợt kiểm tra toàn vẹn Hash Chain của hệ thống
 */
export function getIntegrityRunHistory({ limit = 20, offset = 0 } = {}) {
  const db = getDb();
  const runs = db
    .prepare(
      `SELECT id, run_at, total_batches, valid_count, corrupted_count, status, details_json, duration_ms, triggered_by
       FROM system_integrity_logs
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);

  const total = db.prepare("SELECT COUNT(*) AS cnt FROM system_integrity_logs").get().cnt;

  return {
    total,
    runs: runs.map((r) => {
      let parsed = {};
      try {
        parsed = JSON.parse(r.details_json || "{}");
      } catch {
        parsed = {};
      }
      return {
        id: r.id,
        runAt: r.run_at,
        totalBatches: r.total_batches,
        validCount: r.valid_count,
        corruptedCount: r.corrupted_count,
        status: r.status,
        durationMs: r.duration_ms,
        triggeredBy: r.triggered_by,
        corruptedBatches: parsed.corruptedBatches || [],
      };
    }),
  };
}

/**
 * Khởi động tiến trình kiểm tra định kỳ (24 giờ một lần)
 */
export function startIntegrityWorkerCron() {
  const intervalMs = 24 * 60 * 60 * 1000;
  const timer = setInterval(() => {
    try {
      runSystemIntegrityScan({ triggeredBy: "CRONJOB" });
    } catch (err) {
      console.warn("Background system integrity scan warning:", err.message);
    }
  }, intervalMs);

  timer.unref?.();
  return timer;
}
