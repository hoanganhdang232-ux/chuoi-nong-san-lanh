import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.js";
import { createEventLog } from "./batchService.js";

/**
 * T-65: Dịch vụ điều chuyển lô hàng nội bộ từ kho tổng về các cửa hàng trực thuộc (NPP).
 */

export function transferBatchToStore({
  batchId,
  locationId,
  quantity,
  allocations,
  note = "",
  actorId,
  organizationId,
}) {
  const db = getDb();

  const sourceBatchId = Number(batchId);
  if (!Number.isSafeInteger(sourceBatchId) || sourceBatchId <= 0) {
    const err = new Error("Mã ID lô hàng nguồn không hợp lệ.");
    err.statusCode = 400;
    throw err;
  }

  // Chuẩn hóa danh sách phân bổ: hỗ trợ cả đơn lẻ (locationId + quantity) hoặc mảng allocations
  let normalizedAllocations = [];
  if (Array.isArray(allocations) && allocations.length > 0) {
    normalizedAllocations = allocations.map((item) => ({
      locationId: Number(item.locationId ?? item.location_id),
      quantity: Number(item.quantity),
    }));
  } else if (locationId !== undefined && quantity !== undefined) {
    normalizedAllocations = [
      {
        locationId: Number(locationId),
        quantity: Number(quantity),
      },
    ];
  } else {
    const err = new Error("Vui lòng cung cấp cửa hàng nhận và số lượng điều chuyển.");
    err.statusCode = 400;
    throw err;
  }

  // Kiểm tra tính hợp lệ của từng dòng phân bổ
  if (normalizedAllocations.length === 0) {
    const err = new Error("Cần có ít nhất 1 cửa hàng nhận để thực hiện điều chuyển.");
    err.statusCode = 400;
    throw err;
  }

  const seenLocationIds = new Set();
  for (const alloc of normalizedAllocations) {
    if (!Number.isSafeInteger(alloc.locationId) || alloc.locationId <= 0) {
      const err = new Error("Mã địa điểm/cửa hàng không hợp lệ.");
      err.statusCode = 400;
      throw err;
    }
    if (!Number.isFinite(alloc.quantity) || alloc.quantity <= 0) {
      const err = new Error("Số lượng điều chuyển phải lớn hơn 0.");
      err.statusCode = 400;
      throw err;
    }
    if (seenLocationIds.has(alloc.locationId)) {
      const err = new Error("Mỗi cửa hàng chỉ được xuất hiện một lần trong một lệnh điều chuyển.");
      err.statusCode = 400;
      throw err;
    }
    seenLocationIds.add(alloc.locationId);
  }

  // Lấy thông tin lô nguồn
  const sourceBatch = db
    .prepare(
      `SELECT b.*, p.name AS product_name, p.unit AS product_unit
       FROM batches b
       LEFT JOIN products p ON p.id = b.product_id
       WHERE b.id = ?`,
    )
    .get(sourceBatchId);

  if (!sourceBatch) {
    const err = new Error("Lô hàng nguồn không tồn tại.");
    err.statusCode = 404;
    throw err;
  }

  if (sourceBatch.organization_id !== organizationId) {
    const err = new Error("Lô hàng không thuộc quyền quản lý của tổ chức bạn.");
    err.statusCode = 403;
    throw err;
  }

  const currentStatus = String(sourceBatch.status || "").toLowerCase();
  if (currentStatus === "recalled") {
    const err = new Error("Lô hàng đang bị phong tỏa/thu hồi, không được phép điều chuyển.");
    err.statusCode = 400;
    throw err;
  }
  if (currentStatus === "consumed" || Number(sourceBatch.remaining_quantity) <= 0) {
    const err = new Error("Lô hàng đã hết hoặc đã tiêu thụ, không thể điều chuyển.");
    err.statusCode = 400;
    throw err;
  }

  const totalRequested = normalizedAllocations.reduce((sum, a) => sum + a.quantity, 0);
  const remainingStock = Number(sourceBatch.remaining_quantity);

  // Điều kiện: Số lượng lô hàng trong kho tổng phải đủ để chia
  if (totalRequested > remainingStock) {
    const err = new Error(
      `Số lượng lô hàng trong kho tổng không đủ để chia (Tồn kho hiện tại: ${remainingStock} ${sourceBatch.product_unit || "kg"}, yêu cầu chuyển: ${totalRequested} ${sourceBatch.product_unit || "kg"}).`,
    );
    err.statusCode = 400;
    throw err;
  }

  // Xác thực các địa điểm nhận: phải tồn tại, thuộc cùng tổ chức và có trạng thái hoạt động
  const locationMap = new Map();
  for (const alloc of normalizedAllocations) {
    const loc = db
      .prepare("SELECT * FROM locations WHERE id = ? AND organization_id = ?")
      .get(alloc.locationId, organizationId);
    if (!loc) {
      const err = new Error(`Cửa hàng nhận (ID: ${alloc.locationId}) không tồn tại hoặc không thuộc tổ chức.`);
      err.statusCode = 400;
      throw err;
    }
    if (loc.status && String(loc.status).toLowerCase() === "inactive") {
      const err = new Error(`Cửa hàng '${loc.name}' hiện đang tạm dừng hoạt động, không thể tiếp nhận lô hàng.`);
      err.statusCode = 400;
      throw err;
    }
    locationMap.set(alloc.locationId, loc);
  }

  // Thực thi giao dịch Database atomic
  let transferGroupResult;
  db.exec("BEGIN IMMEDIATE");
  try {
    const newRemainingQuantity = Math.max(0, remainingStock - totalRequested);
    // Cập nhật số lượng tồn kho của lô hàng tại kho tổng
    db.prepare(
      "UPDATE batches SET remaining_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(newRemainingQuantity, sourceBatchId);

    const createdChildren = [];
    const createdTransferRecords = [];
    const baseCode = sourceBatch.batch_code;
    const nowIso = new Date().toISOString();
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    for (let i = 0; i < normalizedAllocations.length; i++) {
      const alloc = normalizedAllocations[i];
      const targetLoc = locationMap.get(alloc.locationId);
      const randSuffix = randomBytes(2).toString("hex").toUpperCase();
      const storeCodePart = (targetLoc.code || `S${targetLoc.id}`).replace(/[^A-Za-z0-9]/g, "");
      const childBatchCode = `${baseCode}-${storeCodePart}-${randSuffix}`;
      const transferCode = `TRF-INT-${datePrefix}-${randomBytes(3).toString("hex").toUpperCase()}`;

      // Tạo lô con mới ghi nhận tồn kho cho cửa hàng đích
      const insertChild = db
        .prepare(
          `INSERT INTO batches(
            batch_code, product_id, organization_id, source_farm_id, location_id,
            initial_quantity, remaining_quantity, current_location, temperature_c,
            status, parent_batch_id, root_batch_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .run(
          childBatchCode,
          sourceBatch.product_id,
          organizationId,
          sourceBatch.source_farm_id || null,
          targetLoc.id,
          alloc.quantity,
          alloc.quantity,
          targetLoc.name,
          sourceBatch.temperature_c ?? 4.0,
          "active",
          sourceBatch.id,
          sourceBatch.root_batch_id || sourceBatch.id,
        );

      const childBatchId = Number(insertChild.lastInsertRowid);
      const childBatch = db.prepare("SELECT * FROM batches WHERE id = ?").get(childBatchId);

      // Ghi quan hệ phả hệ phân tách (split)
      db.prepare(
        `INSERT OR REPLACE INTO batch_relations(parent_batch_id, child_batch_id, relation_type, quantity, created_at)
         VALUES (?, ?, 'split', ?, CURRENT_TIMESTAMP)`,
      ).run(sourceBatchId, childBatchId, alloc.quantity);

      // Ghi nhận lịch sử lệnh điều chuyển nội bộ
      const insertTransfer = db
        .prepare(
          `INSERT INTO internal_batch_transfers(
            transfer_code, source_batch_id, target_batch_id, location_id,
            organization_id, quantity, status, note, actor_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, CURRENT_TIMESTAMP)`,
        )
        .run(
          transferCode,
          sourceBatchId,
          childBatchId,
          targetLoc.id,
          organizationId,
          alloc.quantity,
          note ? String(note).trim() : null,
          actorId,
        );

      const transferRecord = db
        .prepare("SELECT * FROM internal_batch_transfers WHERE id = ?")
        .get(insertTransfer.lastInsertRowid);

      // Lưu vết nhật ký chuỗi khối (Event Log & Hash chain)
      createEventLog({
        batchId: childBatchId,
        eventType: "internal_transfer_received",
        actorId,
        data: {
          action: "INTERNAL_TRANSFER_IN",
          transfer_code: transferCode,
          source_batch_id: sourceBatchId,
          source_batch_code: baseCode,
          location_id: targetLoc.id,
          location_code: targetLoc.code,
          location_name: targetLoc.name,
          quantity: alloc.quantity,
          note,
          transferred_at: nowIso,
        },
      });

      createdChildren.push({
        ...childBatch,
        location: targetLoc,
      });

      createdTransferRecords.push({
        ...transferRecord,
        location: targetLoc,
        child_batch_code: childBatchCode,
      });
    }

    // Ghi sự kiện xuất điều chuyển trên lô nguồn
    createEventLog({
      batchId: sourceBatchId,
      eventType: "internal_transfer_dispatched",
      actorId,
      data: {
        action: "INTERNAL_TRANSFER_OUT",
        total_quantity: totalRequested,
        remaining_quantity: newRemainingQuantity,
        allocations: normalizedAllocations.map((a) => ({
          location_id: a.locationId,
          location_name: locationMap.get(a.locationId)?.name,
          quantity: a.quantity,
        })),
        child_batch_ids: createdChildren.map((c) => c.id),
        note,
        transferred_at: nowIso,
      },
    });

    db.exec("COMMIT");

    const updatedSourceBatch = db.prepare("SELECT * FROM batches WHERE id = ?").get(sourceBatchId);

    transferGroupResult = {
      success: true,
      message: `Đã điều chuyển thành công ${totalRequested} ${sourceBatch.product_unit || "kg"} từ kho tổng tới ${createdChildren.length} cửa hàng.`,
      source_batch: updatedSourceBatch,
      total_transferred_quantity: totalRequested,
      remaining_quantity: newRemainingQuantity,
      transfers: createdTransferRecords,
      children: createdChildren,
    };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return transferGroupResult;
}

/**
 * Lấy danh sách lịch sử các lệnh điều chuyển lô hàng nội bộ.
 */
export function listInternalTransfers(organizationId, { batchId = null, locationId = null, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  let sql = `
    SELECT t.id, t.transfer_code, t.source_batch_id, t.target_batch_id,
           t.location_id, t.organization_id, t.quantity, t.status, t.note,
           t.created_at,
           sb.batch_code AS source_batch_code,
           tb.batch_code AS target_batch_code,
           p.name AS product_name,
           p.unit AS product_unit,
           l.code AS location_code,
           l.name AS location_name,
           l.address AS location_address,
           u.name AS actor_name
    FROM internal_batch_transfers t
    INNER JOIN batches sb ON sb.id = t.source_batch_id
    LEFT JOIN batches tb ON tb.id = t.target_batch_id
    LEFT JOIN products p ON p.id = sb.product_id
    LEFT JOIN locations l ON l.id = t.location_id
    LEFT JOIN users u ON u.id = t.actor_id
    WHERE t.organization_id = ?
  `;
  const params = [organizationId];

  if (batchId) {
    sql += " AND (t.source_batch_id = ? OR t.target_batch_id = ?)";
    params.push(batchId, batchId);
  }

  if (locationId) {
    sql += " AND t.location_id = ?";
    params.push(locationId);
  }

  sql += " ORDER BY t.id DESC LIMIT ? OFFSET ?";
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200), Math.max(Number(offset) || 0, 0));

  return db.prepare(sql).all(...params);
}
