import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.js";
import { createEventLog } from "./batchService.js";
import { traceRecallDescendants } from "./recallGraphService.js";
import { broadcastRecallEvent } from "./sseService.js";
import {
  sendRecallNotificationsToOrg,
  sendNotificationToOrg,
  sendNotificationToAuditors,
  sendNotificationToUser,
} from "./notificationService.js";

/**
 * SCRUM-169, SCRUM-171, SCRUM-172: Sprint 5 Recall Service.
 * Quản lý Lệnh Thu hồi Lô hàng, Danh sách ảnh hưởng, Niêm phong Cách ly và Xuất báo cáo CSV.
 */

function generateRecallCode() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomHex = randomBytes(2).toString("hex").toUpperCase();
  return `REC-${dateStr}-${randomHex}`;
}

export function createRecall({ rootBatchId, reason, actorId, organizationId: _organizationId, userRole }) {
  const db = getDb();
  const rootId = Number(rootBatchId);
  if (!Number.isSafeInteger(rootId) || rootId <= 0) {
    const err = new Error("Mã ID lô gốc không hợp lệ.");
    err.statusCode = 400;
    throw err;
  }

  // T-72: Bắt buộc nhập lý do >= 20 ký tự
  if (!reason || typeof reason !== "string" || reason.trim().length < 20) {
    const err = new Error("Lý do thu hồi là bắt buộc và phải có ít nhất 20 ký tự.");
    err.statusCode = 400;
    throw err;
  }

  const rootBatch = db.prepare("SELECT * FROM batches WHERE id = ?").get(rootId);
  if (!rootBatch) {
    const err = new Error("Không tìm thấy lô hàng gốc cần thu hồi.");
    err.statusCode = 404;
    throw err;
  }

  // Kiểm tra quyền: Bất kỳ Admin hoặc Auditor/Inspector nào cũng có quyền kích hoạt lệnh thu hồi khẩn cấp
  const allowedRecallRoles = ["farm_admin", "processor_admin", "distributor_admin", "auditor"];
  if (!allowedRecallRoles.includes(userRole)) {
    const err = new Error("Chỉ Quản trị viên (Admin) hoặc Kiểm toán viên (Auditor) mới có quyền kích hoạt lệnh thu hồi.");
    err.statusCode = 403;
    throw err;
  }

  // Thuật toán truy vết toàn bộ cây phả hệ xuôi (kể cả Blended Batches)
  const traceResult = traceRecallDescendants(rootId);
  const allAffectedBatches = [
    traceResult.rootBatch,
    ...traceResult.descendants,
  ].filter(Boolean);

  const recallCode = generateRecallCode();
  const cleanReason = reason.trim();

  db.exec("BEGIN IMMEDIATE");
  try {
    // 1. Tạo bản ghi lệnh thu hồi
    const recallInsert = db
      .prepare(
        `INSERT INTO recalls (recall_code, root_batch_id, reason, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, 'ACTIVE', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run(recallCode, rootId, cleanReason, actorId);

    const recallId = Number(recallInsert.lastInsertRowid);

    // 2. Chèn danh sách các lô bị ảnh hưởng vào recall_affected_batches
    const insertAffected = db.prepare(
      `INSERT INTO recall_affected_batches (
        recall_id, batch_id, organization_id, current_location,
        remaining_quantity, consumed_quantity, is_blended,
        quarantine_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );

    const updateBatchStatus = db.prepare(
      "UPDATE batches SET status = 'RECALLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    );

    const affectedOrgIds = new Set();

    for (const batch of allAffectedBatches) {
      const remaining = Number(batch.remaining_quantity || 0);
      const consumed = Number(batch.consumed_quantity || 0);
      const isBlended = batch.is_blended ? 1 : 0;
      const location = batch.current_location || batch.location_name || "Kho trung tâm";

      insertAffected.run(
        recallId,
        batch.id,
        batch.organization_id,
        location,
        remaining,
        consumed,
        isBlended,
      );

      // Cập nhật trạng thái lô hàng thành RECALLED
      updateBatchStatus.run(batch.id);

      // Đóng gói sự kiện RECALL_INITIATED vào Hash Chain
      createEventLog({
        batchId: batch.id,
        eventType: "RECALL_INITIATED",
        actorId,
        data: {
          recall_id: recallId,
          recall_code: recallCode,
          root_batch_id: rootId,
          root_batch_code: rootBatch.batch_code,
          reason: cleanReason,
          is_blended: Boolean(isBlended),
          current_remaining: remaining,
        },
      });

      affectedOrgIds.add(batch.organization_id);
    }

    // Thu thập toàn bộ các tổ chức liên quan (bên giữ hàng, bên giao dịch chuyển nhượng, bên tạo lô gốc)
    const allRelatedOrgIds = new Set(affectedOrgIds);
    if (rootBatch.organization_id) allRelatedOrgIds.add(rootBatch.organization_id);
    if (_organizationId) allRelatedOrgIds.add(_organizationId);

    const affectedBatchIds = allAffectedBatches.map((b) => b.id);
    if (affectedBatchIds.length > 0) {
      const placeholders = affectedBatchIds.map(() => "?").join(", ");
      // Tìm các tổ chức trong lịch sử chuyển giao của các lô này
      const transferParties = db
        .prepare(
          `SELECT DISTINCT from_organization_id, to_organization_id
           FROM batch_transfers
           WHERE batch_id IN (${placeholders})`,
        )
        .all(...affectedBatchIds);

      for (const tp of transferParties) {
        if (tp.from_organization_id) allRelatedOrgIds.add(tp.from_organization_id);
        if (tp.to_organization_id) allRelatedOrgIds.add(tp.to_organization_id);
      }

      // Tự động thu hồi/hủy các lệnh bàn giao đang chờ xử lý liên quan đến các lô bị thu hồi
      const pendingTransfers = db
        .prepare(
          `SELECT bt.*, b.batch_code, o_from.name AS from_org_name, o_to.name AS to_org_name
           FROM batch_transfers bt
           INNER JOIN batches b ON b.id = bt.batch_id
           LEFT JOIN organizations o_from ON o_from.id = bt.from_organization_id
           LEFT JOIN organizations o_to ON o_to.id = bt.to_organization_id
           WHERE bt.batch_id IN (${placeholders}) AND bt.status = 'pending'`,
        )
        .all(...affectedBatchIds);

      for (const pt of pendingTransfers) {
        db.prepare(
          `UPDATE batch_transfers
           SET status = 'cancelled',
               reason = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(`Lệnh bàn giao bị hủy do lô hàng nằm trong lệnh thu hồi khẩn cấp ${recallCode}.`, pt.id);

        createEventLog({
          batchId: pt.batch_id,
          eventType: "batch_transfer_cancelled",
          actorId,
          data: {
            transfer_id: pt.id,
            from_organization_id: pt.from_organization_id,
            to_organization_id: pt.to_organization_id,
            reason: `Lô hàng đã bị thu hồi khẩn cấp (${recallCode}).`,
            recall_code: recallCode,
          },
        });

        // Thông báo cho bên nhận của lệnh bàn giao bị hủy
        sendRecallNotificationsToOrg({
          orgId: pt.to_organization_id,
          title: "CẢNH BÁO THU HỒI NÔNG SẢN KHẨN CẤP",
          message: `Đơn bàn giao lô ${pt.batch_code} từ ${pt.from_org_name || "bên gửi"} đã bị thu hồi/hủy vì lô hàng nằm trong phạm vi lệnh thu hồi ${recallCode}. Vui lòng không tiếp nhận!`,
          recallId,
        });
      }
    }

    // 3. T-85: Tự động gửi thông báo in-app cho toàn bộ các tổ chức liên quan
    for (const orgId of allRelatedOrgIds) {
      sendRecallNotificationsToOrg({
        orgId,
        title: "CẢNH BÁO THU HỒI NÔNG SẢN KHẨN CẤP",
        message: `Lệnh thu hồi ${recallCode} đã được kích hoạt đối với lô ${rootBatch.batch_code} và các lô liên quan do: "${cleanReason}". Vui lòng ngừng phân phối và tiến hành niêm phong cách ly ngay lập tức.`,
        recallId,
      });
    }

    // Đồng thời gửi thông báo in-app cho các tài khoản Kiểm toán viên (Auditor)
    sendNotificationToAuditors({
      title: "CẢNH BÁO THU HỒI NÔNG SẢN KHẨN CẤP",
      message: `Lệnh thu hồi ${recallCode} đã được kích hoạt đối với lô ${rootBatch.batch_code} do: "${cleanReason}". Tổng số lô bị ảnh hưởng: ${allAffectedBatches.length}.`,
      type: "RECALL_INITIATED",
      kind: "recall",
    });

    db.exec("COMMIT");

    // 4. T-83: Bắn Server-Sent Events (SSE) thời gian thực đầy đủ định dạng
    broadcastRecallEvent("recall_created", {
      type: "RECALL_INITIATED",
      recall_id: recallId,
      recallId,
      recall_code: recallCode,
      recallCode,
      root_batch_id: rootId,
      rootBatchId: rootId,
      root_batch_code: rootBatch.batch_code,
      rootBatchCode: rootBatch.batch_code,
      total_affected: allAffectedBatches.length,
      totalAffected: allAffectedBatches.length,
      reason: cleanReason,
      message: `Lệnh thu hồi ${recallCode} đối với lô ${rootBatch.batch_code} vừa được kích hoạt!`,
      created_at: new Date().toISOString(),
    });

    return getRecallDetail(recallId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getRecallDetail(recallId) {
  const db = getDb();
  const recall = db
    .prepare(
      `SELECT r.*,
              b.batch_code AS root_batch_code,
              p.name AS root_product_name,
              u.name AS created_by_name,
              u.email AS created_by_email
       FROM recalls r
       INNER JOIN batches b ON b.id = r.root_batch_id
       INNER JOIN products p ON p.id = b.product_id
       INNER JOIN users u ON u.id = r.created_by
       WHERE r.id = ?`,
    )
    .get(Number(recallId));

  if (!recall) return null;

  return recall;
}

export function getRecallAffectedBatches(recallId, userOrgId, userRole) {
  const db = getDb();
  const recall = getRecallDetail(recallId);
  if (!recall) {
    const err = new Error("Không tìm thấy lệnh thu hồi.");
    err.statusCode = 404;
    throw err;
  }

  let sql = `
    SELECT
      rab.id,
      rab.recall_id,
      rab.batch_id,
      b.batch_code,
      p.name AS product_name,
      p.unit AS product_unit,
      rab.organization_id,
      o.name AS organization_name,
      o.type AS organization_type,
      rab.current_location,
      rab.remaining_quantity,
      rab.consumed_quantity,
      rab.is_blended,
      rab.quarantine_status,
      rab.quarantine_location,
      rab.quarantined_at,
      u.name AS quarantined_by_name,
      rab.created_at,
      rab.updated_at
    FROM recall_affected_batches rab
    INNER JOIN batches b ON b.id = rab.batch_id
    INNER JOIN products p ON p.id = b.product_id
    INNER JOIN organizations o ON o.id = rab.organization_id
    LEFT JOIN users u ON u.id = rab.quarantined_by
    WHERE rab.recall_id = ?
    ORDER BY rab.id ASC
  `;

  const allItems = db.prepare(sql).all(Number(recallId));

  // T-76: Summary tổng hợp toàn diện
  const totalBatches = allItems.length;
  const quarantinedBatches = allItems.filter(
    (item) => String(item.quarantine_status).toUpperCase() === "QUARANTINED",
  ).length;
  const unquarantinedBatches = totalBatches - quarantinedBatches;

  const totalRemaining = allItems.reduce((s, i) => s + Number(i.remaining_quantity || 0), 0);
  const totalConsumed = allItems.reduce((s, i) => s + Number(i.consumed_quantity || 0), 0);
  const quarantinedQuantity = allItems
    .filter((item) => String(item.quarantine_status).toUpperCase() === "QUARANTINED")
    .reduce((s, i) => s + Number(i.remaining_quantity || 0), 0);

  const quarantineRate = totalBatches > 0 ? Math.round((quarantinedBatches / totalBatches) * 100) : 0;
  const weightQuarantineRate = totalRemaining > 0 ? Math.round((quarantinedQuantity / totalRemaining) * 100) : 0;

  // Lọc theo phạm vi tổ chức nếu không phải Auditor
  const scopedItems =
    userRole === "auditor"
      ? allItems
      : allItems.filter((item) => item.organization_id === userOrgId);

  const blendedBatchesCount = allItems.filter((item) => item.is_blended).length;

  return {
    recall,
    summary: {
      total_batches: totalBatches,
      totalBatches,
      quarantined_batches: quarantinedBatches,
      quarantinedBatches,
      unquarantined_batches: unquarantinedBatches,
      unquarantinedBatches,
      total_remaining_quantity: totalRemaining,
      totalRemainingKg: totalRemaining,
      quarantined_quantity: quarantinedQuantity,
      quarantinedRemainingKg: quarantinedQuantity,
      total_consumed_quantity: totalConsumed,
      totalConsumedKg: totalConsumed,
      quarantine_rate: quarantineRate,
      quarantineProgressPercent: quarantineRate,
      weight_quarantine_rate: weightQuarantineRate,
      quarantineWeightPercent: weightQuarantineRate,
      blended_batches_count: blendedBatchesCount,
      blendedBatchesCount,
      is_completed: totalBatches > 0 && quarantinedBatches === totalBatches,
    },
    batches: allItems,
    items: allItems,
    allItemsForStats: allItems,
    scopedItems,
  };
}

export function quarantineBatch({ batchId, quarantineLocation, actorId, userOrgId, userRole }) {
  const db = getDb();
  const bId = Number(batchId);

  const batch = db
    .prepare(
      `SELECT b.*, p.name AS product_name
       FROM batches b
       INNER JOIN products p ON p.id = b.product_id
       WHERE b.id = ?`,
    )
    .get(bId);

  if (!batch) {
    const err = new Error("Không tìm thấy lô hàng.");
    err.statusCode = 404;
    throw err;
  }

  // T-81: Authorization Middleware - Chỉ đúng org đang giữ lô hoặc auditor mới được confirm niêm phong
  if (userRole !== "auditor" && batch.organization_id !== userOrgId) {
    const err = new Error("Chỉ tổ chức đang trực tiếp lưu giữ lô hàng mới có quyền xác nhận niêm phong & cách ly.");
    err.statusCode = 403;
    throw err;
  }

  const locationText = quarantineLocation ? String(quarantineLocation).trim() : "Khu vực cách ly chuyên dụng";

  db.exec("BEGIN IMMEDIATE");
  try {
    // 1. Cập nhật bảng batches
    db.prepare(
      `UPDATE batches
       SET status = 'QUARANTINED',
           current_location = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(locationText, bId);

    // 2. Cập nhật recall_affected_batches
    db.prepare(
      `UPDATE recall_affected_batches
       SET quarantine_status = 'QUARANTINED',
           quarantine_location = ?,
           quarantined_at = CURRENT_TIMESTAMP,
           quarantined_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE batch_id = ?`,
    ).run(locationText, actorId, bId);

    // 3. Đóng gói event RECALL_CONFIRMED vào chuỗi Hash Chain
    createEventLog({
      batchId: bId,
      eventType: "RECALL_CONFIRMED",
      actorId,
      data: {
        action: "QUARANTINE_CONFIRMED",
        quarantine_location: locationText,
        remaining_quantity: batch.remaining_quantity,
        confirmed_at: new Date().toISOString(),
      },
    });

    // Lấy thông tin tổ chức thực hiện niêm phong và lệnh thu hồi liên quan
    const recallInfo = db
      .prepare(
        `SELECT r.id AS recall_id, r.recall_code, r.created_by, r.root_batch_id,
                b.batch_code AS root_batch_code,
                b.organization_id AS root_org_id,
                o.name AS quarantining_org_name
         FROM recall_affected_batches rab
         INNER JOIN recalls r ON r.id = rab.recall_id
         INNER JOIN batches b ON b.id = r.root_batch_id
         LEFT JOIN organizations o ON o.id = ?
         WHERE rab.batch_id = ?
         ORDER BY rab.id DESC
         LIMIT 1`,
      )
      .get(batch.organization_id, bId);

    const orgName = recallInfo?.quarantining_org_name || "Đơn vị phụ trách";
    const notifTitle = "XÁC NHẬN NIÊM PHONG LÔ THU HỒI";
    const notifMessage = `Đơn vị ${orgName} đã hoàn tất niêm phong và cách ly lô ${batch.batch_code} tại: ${locationText}.`;

    // Thông báo cho người tạo lệnh thu hồi
    if (recallInfo?.created_by && recallInfo.created_by !== actorId) {
      sendNotificationToUser({
        userId: recallInfo.created_by,
        title: notifTitle,
        message: notifMessage,
        type: "RECALL_CONFIRMED",
        kind: "quarantine",
      });
    }

    // Thông báo cho tổ chức tạo lô gốc nếu khác tổ chức hiện tại
    if (recallInfo?.root_org_id && recallInfo.root_org_id !== batch.organization_id) {
      sendNotificationToOrg({
        orgId: recallInfo.root_org_id,
        title: notifTitle,
        message: notifMessage,
        type: "RECALL_CONFIRMED",
        kind: "quarantine",
      });
    }

    // Thông báo cho Auditor
    sendNotificationToAuditors({
      title: notifTitle,
      message: notifMessage,
      type: "RECALL_CONFIRMED",
      kind: "quarantine",
    });

    db.exec("COMMIT");

    // 4. T-83: Bắn tín hiệu SSE để cập nhật progress bar và toast thời gian thực
    broadcastRecallEvent("batch_quarantined", {
      type: "RECALL_CONFIRMED",
      batch_id: bId,
      batchId: bId,
      batch_code: batch.batch_code,
      batchCode: batch.batch_code,
      organization_id: batch.organization_id,
      organizationId: batch.organization_id,
      quarantine_location: locationText,
      quarantineLocation: locationText,
      message: `Lô ${batch.batch_code} đã được niêm phong tại ${locationText}.`,
      quarantined_at: new Date().toISOString(),
    });

    return {
      success: true,
      message: `Lô ${batch.batch_code} đã được niêm phong và cách ly thành công tại: ${locationText}.`,
      batch_id: bId,
      status: "QUARANTINED",
      quarantine_location: locationText,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listRecalls(userOrgId, userRole) {
  const db = getDb();
  const recalls = db
    .prepare(
      `SELECT r.*,
              b.batch_code AS root_batch_code,
              p.name AS root_product_name,
              u.name AS created_by_name
       FROM recalls r
       INNER JOIN batches b ON b.id = r.root_batch_id
       INNER JOIN products p ON p.id = b.product_id
       INNER JOIN users u ON u.id = r.created_by
       ORDER BY r.id DESC`,
    )
    .all();

  return recalls.map((recall) => {
    const affected = getRecallAffectedBatches(recall.id, userOrgId, userRole);
    return {
      ...recall,
      summary: affected.summary,
      items_count: affected.items.length,
    };
  });
}

export function exportRecallCsv(recallId) {
  const affected = getRecallAffectedBatches(recallId, null, "auditor");
  const { recall, allItemsForStats } = affected;

  // UTF-8 BOM để Excel hiển thị tiếng Việt không bị lỗi font
  let csv = "\uFEFF";
  csv += `"BÁO CÁO THU HỒI LÔ HÀNG NÔNG SẢN - LỆNH: ${recall.recall_code}"\r\n`;
  csv += `"Lô gốc: ${recall.root_batch_code} - Sản phẩm: ${recall.root_product_name}"\r\n`;
  csv += `"Lý do: ${recall.reason.replace(/"/g, '""')}"\r\n`;
  csv += `"Thời gian phát lệnh: ${recall.created_at}"\r\n\r\n`;

  // Header cột
  csv += `"STT","Mã Lô Hàng","Tên Sản Phẩm","Đơn Vị Tính","Tổ Chức Quản Lý","Loại Tổ Chức","Vị Trí Hiện Tại","Khối Lượng Còn (kg)","Đã Bán/Tiêu Thụ (kg)","Lô Pha Trộn (Blended)","Trạng Thái Niêm Phong","Vị Trí Cách Ly","Thời Gian Niêm Phong","Người Niêm Phong"\r\n`;

  allItemsForStats.forEach((item, index) => {
    const isQuarantined = item.quarantine_status === "QUARANTINED" ? "Đã niêm phong" : "Chưa niêm phong";
    const isBlended = item.is_blended ? "Có (Lô gộp)" : "Không";
    const row = [
      index + 1,
      `"${item.batch_code}"`,
      `"${item.product_name}"`,
      `"${item.product_unit || "kg"}"`,
      `"${item.organization_name}"`,
      `"${item.organization_type}"`,
      `"${(item.current_location || "").replace(/"/g, '""')}"`,
      Number(item.remaining_quantity || 0),
      Number(item.consumed_quantity || 0),
      `"${isBlended}"`,
      `"${isQuarantined}"`,
      `"${(item.quarantine_location || "").replace(/"/g, '""')}"`,
      `"${item.quarantined_at || ""}"`,
      `"${item.quarantined_by_name || ""}"`,
    ];
    csv += row.join(",") + "\r\n";
  });

  return csv;
}
