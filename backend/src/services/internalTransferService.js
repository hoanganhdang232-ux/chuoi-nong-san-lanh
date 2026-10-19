import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.js";
import { createEventLog } from "./batchService.js";

/**
 * T-65: Dịch vụ điều chuyển lô hàng nội bộ từ kho tổng về các cửa hàng trực thuộc (NPP).
 * Tuân thủ quy trình 7 bước nghiêm ngặt:
 * 1. Nhận request: Xác thực người dùng và quyền điều chuyển
 * 2. Validate nghiệp vụ: Kiểm tra địa điểm, lô hàng và số lượng
 * 3. Bắt đầu transaction: Khóa các dòng tồn kho cần cập nhật (BEGIN IMMEDIATE)
 * 4. Kiểm tra tồn lần cuối: Đối chiếu tồn khả dụng trong transaction (chống Race Condition)
 * 5. Cập nhật tồn kho: Trừ nguồn, cộng đích (tạo lô con), ghi lệnh và audit log
 * 6. Commit: Chỉ trả thành công sau khi dữ liệu được commit
 * 7. Trả kết quả: Trả mã lệnh, trạng thái và thông tin liên quan (Rollback nếu có lỗi trước commit)
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

  // BƯỚC 1 & 2: NHẬN REQUEST & VALIDATE NGHIỆP VỤ
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

  // Lấy thông tin lô nguồn ban đầu
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

  // Xác thực các địa điểm nhận
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
    const locStatus = String(loc.status || "").toUpperCase();
    if (locStatus === "INACTIVE") {
      const err = new Error(`Cửa hàng '${loc.name}' hiện đang tạm dừng hoạt động, không thể tiếp nhận lô hàng.`);
      err.statusCode = 400;
      throw err;
    }
    locationMap.set(alloc.locationId, loc);
  }

  // BƯỚC 3: BẮT ĐẦU TRANSACTION & KHÓA GHI ĐỘC QUYỀN
  let transferGroupResult;
  db.exec("BEGIN IMMEDIATE");
  try {
    // BƯỚC 4: KIỂM TRA TỒN LẦN CUỐI TRONG TRANSACTION (CHỐNG RACE CONDITION & OVER-ALLOCATION)
    const lockedBatch = db
      .prepare("SELECT remaining_quantity, status FROM batches WHERE id = ?")
      .get(sourceBatchId);

    const actualAvailable = Number(lockedBatch?.remaining_quantity || 0);
    if (!lockedBatch || actualAvailable < totalRequested) {
      const err = new Error(
        `Số lượng lô hàng trong kho tổng không đủ để chia (Tồn kho hiện tại: ${actualAvailable} ${sourceBatch.product_unit || "kg"}, yêu cầu chuyển: ${totalRequested} ${sourceBatch.product_unit || "kg"}).`,
      );
      err.statusCode = 400;
      throw err;
    }

    // BƯỚC 5: CẬP NHẬT TỒN KHO (TRỪ NGUỒN, CỘNG ĐÍCH, GHI LỆNH VÀ AUDIT LOG)
    const newRemainingQuantity = Math.max(0, actualAvailable - totalRequested);
    db.prepare(
      "UPDATE batches SET remaining_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(newRemainingQuantity, sourceBatchId);

    const createdChildren = [];
    const createdTransferRecords = [];
    const baseCode = sourceBatch.batch_code;
    const nowIso = new Date().toISOString();
    const datePrefix = nowIso.slice(0, 10).replace(/-/g, "");

    // Tạo lệnh tổng Master Transfer trong stock_transfers
    const primaryDestId = normalizedAllocations[0].locationId;
    const masterTransferCode = `TRF-INT-${datePrefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const insertMaster = db
      .prepare(
        `INSERT INTO stock_transfers(
          transfer_code, organization_id, source_location_id, destination_location_id,
          status, note, created_by, created_at, completed_at
        ) VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run(
        masterTransferCode,
        organizationId,
        sourceBatch.location_id || null,
        primaryDestId,
        note ? String(note).trim() : null,
        actorId,
      );
    const masterTransferId = Number(insertMaster.lastInsertRowid);

    // Tạo các lô con tại từng điểm bán và ghi chi tiết vào stock_transfer_items & internal_batch_transfers
    for (let i = 0; i < normalizedAllocations.length; i++) {
      const alloc = normalizedAllocations[i];
      const targetLoc = locationMap.get(alloc.locationId);
      const randSuffix = randomBytes(2).toString("hex").toUpperCase();
      const storeCodePart = (targetLoc.code || `S${targetLoc.id}`).replace(/[^A-Za-z0-9]/g, "");
      const childBatchCode = `${baseCode}-${storeCodePart}-${randSuffix}`;
      const itemTransferCode = normalizedAllocations.length === 1
        ? masterTransferCode
        : `${masterTransferCode}-${String(i + 1).padStart(2, "0")}`;

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

      // Ghi quan hệ phả hệ phân tách (split) giữ nguyên liên kết truy xuất nguồn gốc
      db.prepare(
        `INSERT OR REPLACE INTO batch_relations(parent_batch_id, child_batch_id, relation_type, quantity, created_at)
         VALUES (?, ?, 'split', ?, CURRENT_TIMESTAMP)`,
      ).run(sourceBatchId, childBatchId, alloc.quantity);

      // Ghi chi tiết vào stock_transfer_items
      db.prepare(
        `INSERT INTO stock_transfer_items(transfer_id, batch_id, target_batch_id, quantity, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      ).run(masterTransferId, sourceBatchId, childBatchId, alloc.quantity);

      // Ghi nhận lịch sử lệnh điều chuyển vào internal_batch_transfers (tương thích ngược)
      const insertTransfer = db
        .prepare(
          `INSERT INTO internal_batch_transfers(
            transfer_code, source_batch_id, target_batch_id, location_id,
            organization_id, quantity, status, note, actor_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, CURRENT_TIMESTAMP)`,
        )
        .run(
          itemTransferCode,
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

      // Lưu vết nhật ký chuỗi băm SHA-256 (Event Log) cho lô con
      createEventLog({
        batchId: childBatchId,
        eventType: "internal_transfer_received",
        actorId,
        data: {
          action: "INTERNAL_TRANSFER_IN",
          transfer_code: itemTransferCode,
          master_transfer_code: masterTransferCode,
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

    // Ghi sự kiện xuất điều chuyển trên lô nguồn với chuỗi băm SHA-256
    createEventLog({
      batchId: sourceBatchId,
      eventType: "internal_transfer_dispatched",
      actorId,
      data: {
        action: "INTERNAL_TRANSFER_OUT",
        transfer_code: masterTransferCode,
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

    // BƯỚC 6: COMMIT TRANSACTION
    db.exec("COMMIT");

    // BƯỚC 7: TRẢ KẾT QUẢ THÀNH CÔNG
    const updatedSourceBatch = db.prepare("SELECT * FROM batches WHERE id = ?").get(sourceBatchId);

    transferGroupResult = {
      success: true,
      message: `Đã điều chuyển thành công ${totalRequested} ${sourceBatch.product_unit || "kg"} từ kho tổng tới ${createdChildren.length} cửa hàng.`,
      transfer_id: masterTransferId,
      transfer_code: masterTransferCode,
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
 * Lấy danh sách lịch sử các lệnh điều chuyển lô hàng nội bộ kèm phân trang.
 */
export function listInternalTransfers(
  organizationId,
  {
    batchId = null,
    locationId = null,
    search = "",
    page = null,
    pageSize = null,
    limit = 50,
    offset = 0,
    withPagination = false,
  } = {},
) {
  const db = getDb();
  let baseSql = `
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
    baseSql += " AND (t.source_batch_id = ? OR t.target_batch_id = ?)";
    params.push(Number(batchId), Number(batchId));
  }

  if (locationId) {
    baseSql += " AND t.location_id = ?";
    params.push(Number(locationId));
  }

  if (search && String(search).trim()) {
    baseSql += " AND (lower(t.transfer_code) LIKE ? OR lower(sb.batch_code) LIKE ? OR lower(coalesce(tb.batch_code, '')) LIKE ? OR lower(coalesce(l.name, '')) LIKE ?)";
    const term = `%${String(search).trim().toLowerCase()}%`;
    params.push(term, term, term, term);
  }

  const isPaging = page !== null || pageSize !== null || withPagination;
  let paginationMeta = null;
  if (isPaging) {
    const countSql = `SELECT COUNT(*) AS total ${baseSql}`;
    const totalItems = db.prepare(countSql).get(...params)?.total || 0;
    const curPage = Math.max(1, Number(page) || 1);
    const curPageSize = Math.min(100, Math.max(1, Number(pageSize) || 10));
    const totalPages = Math.ceil(totalItems / curPageSize) || 1;

    paginationMeta = {
      page: curPage,
      pageSize: curPageSize,
      totalItems,
      totalPages,
    };
  }

  let selectSql = `
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
    ${baseSql}
    ORDER BY t.id DESC
  `;

  const queryParams = [...params];
  if (isPaging && paginationMeta) {
    selectSql += " LIMIT ? OFFSET ?";
    queryParams.push(paginationMeta.pageSize, (paginationMeta.page - 1) * paginationMeta.pageSize);
  } else {
    selectSql += " LIMIT ? OFFSET ?";
    queryParams.push(
      Math.min(Math.max(Number(limit) || 50, 1), 200),
      Math.max(Number(offset) || 0, 0),
    );
  }

  const rows = db.prepare(selectSql).all(...queryParams);

  if (isPaging && paginationMeta) {
    const result = {
      data: rows,
      pagination: paginationMeta,
    };
    Object.assign(rows, result);
    return result;
  }

  return rows;
}

/**
 * Lấy chi tiết một lệnh điều chuyển nội bộ bao gồm danh sách mặt hàng và phả hệ.
 */
export function getTransferDetail(id, organizationId) {
  const db = getDb();
  const transfer = db
    .prepare(
      `SELECT t.*,
              sb.batch_code AS source_batch_code,
              tb.batch_code AS target_batch_code,
              p.name AS product_name,
              p.unit AS product_unit,
              l.code AS location_code,
              l.name AS location_name,
              l.address AS location_address,
              l.phone AS location_phone,
              u.name AS actor_name,
              u.email AS actor_email
       FROM internal_batch_transfers t
       INNER JOIN batches sb ON sb.id = t.source_batch_id
       LEFT JOIN batches tb ON tb.id = t.target_batch_id
       LEFT JOIN products p ON p.id = sb.product_id
       LEFT JOIN locations l ON l.id = t.location_id
       LEFT JOIN users u ON u.id = t.actor_id
       WHERE t.id = ? AND t.organization_id = ?`,
    )
    .get(Number(id), organizationId);

  if (!transfer) {
    const err = new Error("Không tìm thấy lệnh điều chuyển.");
    err.statusCode = 404;
    throw err;
  }

  // Lấy các sự kiện event log liên quan
  const events = db
    .prepare(
      `SELECT id, batch_id, event_type, actor_id, data_json, previous_hash, current_hash, timestamp
       FROM event_logs
       WHERE batch_id = ? OR batch_id = ?
       ORDER BY id ASC`,
    )
    .all(transfer.source_batch_id, transfer.target_batch_id);

  return {
    ...transfer,
    events: events.map((e) => ({
      ...e,
      data: JSON.parse(e.data_json || "{}"),
    })),
  };
}
