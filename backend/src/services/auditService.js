import { getDb } from "../db/database.js";
import {
  getBatchGenealogy,
  parseBatchIds,
  verifyEventChain,
} from "./batchService.js";

export function buildAuditReport(
  batchId,
  organizationId,
  isAuditor = false,
) {
  const db = getDb();
  const batch = db
    .prepare(
      `SELECT b.*, p.name AS product_name, p.unit, o.name AS organization_name,
            f.name AS farm_name, f.address AS farm_address
     FROM batches b
     INNER JOIN products p ON p.id = b.product_id
     INNER JOIN organizations o ON o.id = b.organization_id
     LEFT JOIN farms f ON f.id = b.source_farm_id
     WHERE b.id = ? ${isAuditor ? "" : "AND b.organization_id = ?"}`,
    )
    .get(batchId, ...(isAuditor ? [] : [organizationId]));
  if (!batch) return null;

  const events = db
    .prepare(
      `SELECT e.*, u.name AS actor_name FROM event_logs e
     LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.batch_id = ? ORDER BY e.id`,
    )
    .all(batchId);
  const integrity = verifyEventChain(events);

  const temperatureLogs = db
    .prepare(
      "SELECT temperature, source, timestamp FROM temperature_logs WHERE batch_id = ? ORDER BY timestamp, id",
    )
    .all(batchId);
  const genealogy = getBatchGenealogy(
    batchId,
    organizationId,
    isAuditor,
  );

  return {
    reportType: "Agritrace traceability audit",
    exportedAt: new Date().toISOString(),
    batch: {
      ...batch,
      source_batch_ids: parseBatchIds(batch.source_batch_ids),
    },
    integrity: {
      valid: integrity.valid,
      checkedAt: new Date().toISOString(),
      checkedEvents: events.length,
      invalidEventIds: integrity.invalidEventIds,
    },
    events,
    temperatureLogs,
    genealogy,
  };
}

export function anonymizeOldData(months = 1) {
  const db = getDb();
  // Cơ chế Xóa Dữ liệu Cá nhân (Anonymization - Epic E-10)
  // Xóa PII của nông hộ (tên, sđt) đối với các lô đã hoàn tất trên X tháng.
  // Quan trọng: Chỉ sửa bảng users và farms. Không chạm vào event_logs.
  // Điều này đảm bảo tính toàn vẹn của mã băm (SHA-256) Blockchain không bị vỡ.
  
  let changes = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    // Tìm các tổ chức nông trại có các lô hàng đã giao/chế biến hơn 'months' tháng trước
    const oldFarms = db.prepare(`
      SELECT DISTINCT b.source_farm_id, b.organization_id
      FROM batches b
      WHERE b.status IN ('delivered', 'processed')
      AND b.updated_at < datetime('now', '-' || ? || ' months')
    `).all(months);

    const anonymizeUser = db.prepare("UPDATE users SET name = 'Nông hộ ẩn danh', phone = '0000000000' WHERE organization_id = ? AND role = 'farm_admin'");
    const anonymizeFarm = db.prepare("UPDATE farms SET name = 'Nông trại ẩn danh', address = 'Đã ẩn' WHERE id = ?");

    for (const f of oldFarms) {
      if (f.source_farm_id) {
        changes += anonymizeFarm.run(f.source_farm_id).changes;
      }
      if (f.organization_id) {
        changes += anonymizeUser.run(f.organization_id).changes;
      }
    }
    db.exec("COMMIT");
    return { success: true, message: `Đã làm mờ dữ liệu cá nhân cho ${changes} đối tượng nông hộ cũ.` };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
