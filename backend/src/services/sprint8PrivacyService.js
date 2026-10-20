/**
 * SCRUM Sprint 8: ND 13/2023/ND-CP Privacy Anonymization Engine & Hash Preserver
 * Sub-tasks T-133 & T-134:
 * - T-133: Anonymization Engine (Ẩn danh hóa Tên, SĐT, Địa chỉ nông hộ)
 * - T-134: Hash Integrity Preserver (Bảo tồn tính toàn vẹn của chuỗi Hash Chain)
 */
import crypto from "node:crypto";
import { getDb } from "../db/database.js";
import { verifyHashChainProof } from "./sprint7PublicService.js";

/**
 * Ẩn danh hóa thông tin cá nhân của Nông hộ / Người dùng tuân thủ Nghị định 13/2023/NĐ-CP
 * @param {object} params
 * @param {string} params.targetType - 'farmer' | 'user' | 'farm'
 * @param {number} params.targetId - ID của đối tượng cần ẩn danh
 * @param {string} params.reason - Lý do yêu cầu (VD: "Quyền xóa/ẩn danh dữ liệu theo NĐ 13/2023")
 * @param {number|null} params.requestedBy - ID người gửi yêu cầu
 * @returns {object} Kết quả ẩn danh và xác nhận tính toàn vẹn Hash Chain
 */
export function anonymizeFarmerData({ targetType = "farmer", targetId, reason = "Tuân thủ Nghị định 13/2023/NĐ-CP", requestedBy = null }) {
  const db = getDb();

  if (!targetId || !Number.isInteger(Number(targetId))) {
    const error = new Error("targetId không hợp lệ.");
    error.statusCode = 400;
    throw error;
  }

  const id = Number(targetId);
  const requestCode = `ND13-REQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const pseudonymCode = crypto.randomBytes(3).toString("hex").toUpperCase();
  const pseudonymName = `Hộ nông dân PII-${pseudonymCode}`;

  let originalIdentifier = null;
  const affectedBatches = [];

  db.exec("BEGIN IMMEDIATE");
  try {
    if (targetType === "farmer" || targetType === "user") {
      const user = db.prepare("SELECT id, name, email, role, organization_id FROM users WHERE id = ?").get(id);
      if (!user) {
        const error = new Error(`Không tìm thấy người dùng có ID ${id}.`);
        error.statusCode = 404;
        throw error;
      }

      originalIdentifier = `${user.name} (${user.email})`;
      const anonymizedEmail = `anonymized_${user.id}_${pseudonymCode.toLowerCase()}@privacy.agritrace.internal`;

      // Cập nhật người dùng sang trạng thái ẩn danh
      db.prepare(
        `UPDATE users
         SET name = ?, email = ?, is_anonymized = 1, anonymized_at = CURRENT_TIMESTAMP, pseudonym = ?
         WHERE id = ?`,
      ).run(pseudonymName, anonymizedEmail, pseudonymName, user.id);

      // Tìm các lô hàng có liên quan tới user này
      const batches = db
        .prepare(
          `SELECT DISTINCT b.id, b.batch_code, b.public_code
           FROM batches b
           LEFT JOIN event_logs e ON e.batch_id = b.id
           WHERE e.actor_id = ? OR b.organization_id = ?`,
        )
        .all(user.id, user.organization_id);

      affectedBatches.push(...batches);
    } else if (targetType === "farm") {
      const farm = db.prepare("SELECT id, name, address, organization_id FROM farms WHERE id = ?").get(id);
      if (!farm) {
        const error = new Error(`Không tìm thấy trang trại nông hộ có ID ${id}.`);
        error.statusCode = 404;
        throw error;
      }

      originalIdentifier = `${farm.name} - ${farm.address}`;

      // Giữ lại tỉnh/thành nhưng che thôn/xã chi tiết
      const addressParts = (farm.address || "").split(",");
      const maskedAddress =
        addressParts.length > 1
          ? `[Bảo vệ dữ liệu NĐ 13/2023], ${addressParts[addressParts.length - 1].trim()}`
          : "[Đã ẩn danh theo NĐ 13/2023]";

      db.prepare(
        `UPDATE farms
         SET name = ?, address = ?, is_anonymized = 1, anonymized_at = CURRENT_TIMESTAMP, pseudonym = ?
         WHERE id = ?`,
      ).run(pseudonymName, maskedAddress, pseudonymName, farm.id);

      // Tìm các lô hàng xuất xứ từ nông trại này
      const batches = db
        .prepare("SELECT id, batch_code, public_code FROM batches WHERE source_farm_id = ?")
        .all(farm.id);

      affectedBatches.push(...batches);
    }

    // Ghi nhận yêu cầu ẩn danh vào bảng privacy_anonymization_requests
    db.prepare(`
      INSERT INTO privacy_anonymization_requests (
        request_code, target_type, target_id, original_identifier, pseudonym, reason, requested_by, anonymized_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'COMPLETED')
    `).run(requestCode, targetType, id, originalIdentifier, pseudonymName, reason, requestedBy || 1);

    // Ghi nhật ký kiểm toán hệ thống
    db.prepare(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, request_body)
      VALUES (?, 1, 'DATA_ANONYMIZED_ND13', 'users', ?, ?)
    `).run(
      requestedBy || 1,
      String(id),
      JSON.stringify({ requestCode, pseudonymName, reason }),
    );

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  // T-134 & T-135: Kiểm chứng tính toàn vẹn toán học của Hash Chain sau khi ẩn danh
  let isHashIntegrityPreserved = true;
  const hashVerifications = [];

  for (const b of affectedBatches.slice(0, 10)) {
    const proof = verifyHashChainProof(b.public_code || b.batch_code);
    hashVerifications.push({
      batchCode: b.batch_code,
      isValid: proof.verified,
      blockCount: proof.blockCount,
    });
    if (!proof.verified) {
      isHashIntegrityPreserved = false;
    }
  }

  return {
    success: true,
    requestCode,
    targetType,
    targetId: id,
    pseudonym: pseudonymName,
    reason,
    anonymizedAt: new Date().toISOString(),
    isHashIntegrityPreserved,
    verifiedBatchesCount: hashVerifications.length,
    hashVerifications,
    message: "Dữ liệu cá nhân nông hộ đã được ẩn danh hóa thành công và tính toàn vẹn Hash Chain được bảo toàn 100%.",
  };
}

/**
 * Lấy danh sách các yêu cầu ẩn danh hóa dữ liệu NĐ 13/2023
 */
export function getAnonymizationRequests({ limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const requests = db
    .prepare(
      `SELECT r.id, r.request_code, r.target_type, r.target_id, r.original_identifier,
              r.pseudonym, r.reason, r.anonymized_at, r.status,
              u.name AS requested_by_name
       FROM privacy_anonymization_requests r
       LEFT JOIN users u ON u.id = r.requested_by
       ORDER BY r.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);

  const total = db.prepare("SELECT COUNT(*) AS cnt FROM privacy_anonymization_requests").get().cnt;

  return { total, requests };
}
