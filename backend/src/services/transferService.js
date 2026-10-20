import { getDb } from "../db/database.js";
import { createEventLog } from "./batchService.js";
import { sendNotificationToOrg } from "./notificationService.js";
import { broadcastRecallEvent } from "./sseService.js";

export function createTransferRequest({
  batchId,
  fromOrganizationId,
  toOrganizationId,
  requesterId,
  note,
}) {
  const db = getDb();
  if (!batchId) throw new Error("Vui lòng cung cấp mã định danh lô hàng.");
  if (!toOrganizationId) throw new Error("Vui lòng chọn tổ chức nhận bàn giao.");

  if (fromOrganizationId === toOrganizationId) {
    throw new Error("Không thể bàn giao lô hàng cho chính tổ chức của bạn.");
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
    if (!batch) throw new Error("Lô hàng không tồn tại.");
    if (batch.organization_id !== fromOrganizationId) {
      throw new Error("Bạn không có quyền bàn giao lô hàng này hoặc lô không tồn tại.");
    }

    const pendingTransfer = db
      .prepare("SELECT id FROM batch_transfers WHERE batch_id = ? AND status = 'pending'")
      .get(batchId);
    if (pendingTransfer || batch.status === "pending_confirmation") {
      throw new Error("Lô hàng này đang có một lệnh bàn giao chờ xác nhận.");
    }

    const currentStatus = String(batch.status || "").toLowerCase();
    if (currentStatus === "recalled" || currentStatus === "quarantined") {
      throw new Error("Lô hàng đang bị thu hồi / niêm phong cách ly, không được phép bàn giao.");
    }

    db.prepare(
      `UPDATE batches SET status = 'pending_confirmation', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(batchId);

    const result = db
      .prepare(
        `INSERT INTO batch_transfers(batch_id, from_organization_id, to_organization_id, requester_id, status, note)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        batchId,
        fromOrganizationId,
        toOrganizationId,
        requesterId,
        note || null,
      );

    const event = createEventLog({
      batchId,
      eventType: "batch_transfer_requested",
      actorId: requesterId,
      data: {
        transfer_id: result.lastInsertRowid,
        from_organization_id: fromOrganizationId,
        to_organization_id: toOrganizationId,
        note: note || null,
        previous_status: batch.status,
        new_status: "pending_confirmation",
      },
    });

    // Gửi thông báo cho tổ chức nhận bàn giao
    const senderOrg = db.prepare("SELECT name FROM organizations WHERE id = ?").get(fromOrganizationId);
    sendNotificationToOrg({
      orgId: toOrganizationId,
      title: "YÊU CẦU BÀN GIAO LÔ HÀNG MỚI",
      message: `Tổ chức ${senderOrg?.name || "Đối tác"} đã gửi yêu cầu bàn giao lô hàng ${batch.batch_code}. Vui lòng kiểm tra và xác nhận.`,
      type: "warning",
      kind: "transfer",
    });

    db.exec("COMMIT");

    broadcastRecallEvent("transfer_created", {
      type: "TRANSFER_REQUEST",
      batch_id: batchId,
      batch_code: batch.batch_code,
      from_organization_id: fromOrganizationId,
      to_organization_id: toOrganizationId,
      message: `Có yêu cầu bàn giao mới đối với lô ${batch.batch_code}.`,
    });

    return {
      id: result.lastInsertRowid,
      batch_id: batchId,
      status: "pending",
      event,
      currentHash: event.current_hash,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function decideTransfer({
  transferId,
  actorOrganizationId,
  decision,
  reason,
  actorId,
}) {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const transfer = db
      .prepare(
        `SELECT bt.*, b.organization_id AS current_owner_id
         FROM batch_transfers bt
         INNER JOIN batches b ON b.id = bt.batch_id
         WHERE bt.id = ?`,
      )
      .get(transferId);

    if (!transfer) throw new Error("Yêu cầu bàn giao không tồn tại.");
    if (transfer.status !== "pending") {
      throw new Error("Yêu cầu bàn giao đã được xử lý.");
    }
    if (transfer.to_organization_id !== actorOrganizationId) {
      throw new Error("Chỉ tổ chức nhận lô hàng mới được xác nhận hoặc từ chối.");
    }
    if (!["confirmed", "rejected"].includes(decision)) {
      throw new Error("Quyết định không hợp lệ.");
    }
    if (decision === "rejected") {
      if (typeof reason !== "string" || reason.trim().length < 10) {
        throw new Error("Lý do từ chối bắt buộc và phải có tối thiểu 10 ký tự.");
      }
    }
    const decisionReason =
      typeof reason === "string" && reason.trim() ? reason.trim() : null;

    const nextStatus = decision === "confirmed" ? "confirmed" : "rejected";
    db.prepare(
      `UPDATE batch_transfers SET status = ?, reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(nextStatus, decisionReason, transferId);

    if (decision === "confirmed") {
      db.prepare(
        `UPDATE batches SET organization_id = ?, status = 'in_transit', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(actorOrganizationId, transfer.batch_id);
    } else {
      db.prepare(
        `UPDATE batches SET status = 'registered', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(transfer.batch_id);
    }

    const eventType =
      decision === "confirmed" ? "batch_transferred" : "batch_transfer_rejected";
    const event = createEventLog({
      batchId: transfer.batch_id,
      eventType,
      actorId,
      data: {
        transfer_id: transfer.id,
        from_organization_id: transfer.from_organization_id,
        to_organization_id: transfer.to_organization_id,
        decision,
        reason: decisionReason,
        previous_owner_id: transfer.current_owner_id,
        new_owner_id:
          decision === "confirmed"
            ? actorOrganizationId
            : transfer.current_owner_id,
      },
    });

    // Gửi thông báo cho bên gửi về quyết định bàn giao
    const receiverOrg = db.prepare("SELECT name FROM organizations WHERE id = ?").get(actorOrganizationId);
    const targetBatch = db.prepare("SELECT batch_code FROM batches WHERE id = ?").get(transfer.batch_id);

    if (decision === "confirmed") {
      sendNotificationToOrg({
        orgId: transfer.from_organization_id,
        title: "XÁC NHẬN BÀN GIAO THÀNH CÔNG",
        message: `Tổ chức ${receiverOrg?.name || "Bên nhận"} đã xác nhận tiếp nhận lô hàng ${targetBatch?.batch_code || `#${transfer.batch_id}`}.`,
        type: "quarantine",
        kind: "transfer",
      });
    } else {
      sendNotificationToOrg({
        orgId: transfer.from_organization_id,
        title: "TỪ CHỐI TIẾP NHẬN BÀN GIAO",
        message: `Tổ chức ${receiverOrg?.name || "Bên nhận"} đã từ chối nhận bàn giao lô hàng ${targetBatch?.batch_code || `#${transfer.batch_id}`}. Lý do: "${decisionReason}".`,
        type: "warning",
        kind: "transfer",
      });
    }

    db.exec("COMMIT");

    broadcastRecallEvent("transfer_decided", {
      type: decision === "confirmed" ? "TRANSFER_CONFIRMED" : "TRANSFER_REJECTED",
      transfer_id: transfer.id,
      batch_id: transfer.batch_id,
      batch_code: targetBatch?.batch_code,
      decision,
      message: decision === "confirmed" ? `Lô ${targetBatch?.batch_code} đã được bàn giao thành công.` : `Lô ${targetBatch?.batch_code} bị từ chối bàn giao.`,
    });

    const batch = db
      .prepare("SELECT * FROM batches WHERE id = ?")
      .get(transfer.batch_id);
    return { batch, event, transferStatus: nextStatus };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function cancelTransfer({
  transferId,
  actorOrganizationId,
  actorId,
  reason,
}) {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const transfer = db
      .prepare(
        `SELECT bt.*, b.organization_id AS current_owner_id
         FROM batch_transfers bt
         INNER JOIN batches b ON b.id = bt.batch_id
         WHERE bt.id = ?`,
      )
      .get(transferId);

    if (!transfer) throw new Error("Yêu cầu bàn giao không tồn tại.");
    if (transfer.status !== "pending") {
      throw new Error("Yêu cầu bàn giao không ở trạng thái chờ xác nhận.");
    }
    if (transfer.from_organization_id !== actorOrganizationId) {
      throw new Error("Chỉ tổ chức gửi mới có quyền hủy lệnh bàn giao.");
    }

    const cancelReason =
      typeof reason === "string" && reason.trim()
        ? reason.trim()
        : "Bên gửi đã hủy lệnh bàn giao.";

    db.prepare(
      `UPDATE batch_transfers SET status = 'cancelled', reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(cancelReason, transferId);

    db.prepare(
      `UPDATE batches SET status = 'registered', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(transfer.batch_id);

    const event = createEventLog({
      batchId: transfer.batch_id,
      eventType: "batch_transfer_cancelled",
      actorId,
      data: {
        transfer_id: transfer.id,
        from_organization_id: transfer.from_organization_id,
        to_organization_id: transfer.to_organization_id,
        reason: cancelReason,
        previous_status: "pending_confirmation",
        new_status: "registered",
      },
    });

    // Gửi thông báo in-app cho bên nhận biết đơn bàn giao đã được thu hồi / hủy
    const senderOrg = db.prepare("SELECT name FROM organizations WHERE id = ?").get(transfer.from_organization_id);
    const cancelledBatch = db.prepare("SELECT batch_code FROM batches WHERE id = ?").get(transfer.batch_id);

    sendNotificationToOrg({
      orgId: transfer.to_organization_id,
      title: "ĐƠN BÀN GIAO ĐÃ ĐƯỢC THU HỒI / HỦY",
      message: `Tổ chức ${senderOrg?.name || "Bên gửi"} đã thu hồi/hủy đơn bàn giao đối với lô ${cancelledBatch?.batch_code || `#${transfer.batch_id}`}. Lý do: "${cancelReason}".`,
      type: "warning",
      kind: "transfer",
    });

    db.exec("COMMIT");

    broadcastRecallEvent("transfer_cancelled", {
      type: "TRANSFER_CANCELLED",
      transfer_id: transfer.id,
      batch_id: transfer.batch_id,
      batch_code: cancelledBatch?.batch_code,
      message: `Đơn bàn giao đối với lô ${cancelledBatch?.batch_code} đã được thu hồi/hủy.`,
    });

    const batch = db
      .prepare("SELECT * FROM batches WHERE id = ?")
      .get(transfer.batch_id);
    return { batch, event, transferStatus: "cancelled" };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getPendingTransfersForOrganization(organizationId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT bt.id, bt.batch_id AS lot_id, bt.batch_id,
         b.batch_code, b.remaining_quantity, b.initial_quantity,
         p.name AS product_name, p.unit AS product_unit,
         bt.from_organization_id AS sender_org_id,
         o_from.name AS sender_org_name,
         bt.to_organization_id AS receiver_org_id,
         o_to.name AS receiver_org_name,
         u.name AS requester_name,
         bt.note,
         CASE
           WHEN bt.status = 'pending' THEN 'PENDING'
           WHEN bt.status = 'confirmed' THEN 'APPROVED'
           WHEN bt.status = 'rejected' THEN 'REJECTED'
           WHEN bt.status = 'cancelled' THEN 'CANCELLED'
           ELSE UPPER(bt.status)
         END AS status,
         bt.created_at,
         bt.updated_at
       FROM batch_transfers bt
       INNER JOIN batches b ON b.id = bt.batch_id
       LEFT JOIN products p ON p.id = b.product_id
       LEFT JOIN users u ON u.id = bt.requester_id
       INNER JOIN organizations o_from ON o_from.id = bt.from_organization_id
       INNER JOIN organizations o_to ON o_to.id = bt.to_organization_id
       WHERE bt.to_organization_id = ? AND bt.status = 'pending'
       ORDER BY bt.created_at DESC`,
    )
    .all(organizationId);
}

/** Mark pending handovers older than 48 hours and notify both parties once. */
export function processOverdueTransfers() {
  const db = getDb();
  const insertNotification = db.prepare(
    `INSERT INTO notifications(user_id, organization_id, kind, title, message)
     SELECT id, organization_id, ?, ?, ?
     FROM users
     WHERE organization_id = ? AND is_active = 1`,
  );
  const markOverdue = db.prepare(
    "UPDATE batch_transfers SET overdue_notified_at = CURRENT_TIMESTAMP WHERE id = ?",
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    // Select after acquiring the write lock so two app instances cannot both
    // notify the same organizations before either marks the transfer handled.
    const transfers = db
      .prepare(
        `SELECT bt.*, b.batch_code
         FROM batch_transfers bt
         INNER JOIN batches b ON b.id = bt.batch_id
         WHERE bt.status = 'pending'
           AND bt.overdue_notified_at IS NULL
           AND bt.created_at <= datetime('now', '-48 hours')`,
      )
      .all();
    for (const transfer of transfers) {
      const title = "Bàn giao quá hạn";
      const message = `Bàn giao lô ${transfer.batch_code} đã chờ quá 48 giờ.`;
      insertNotification.run(
        "overdue_handover",
        title,
        message,
        transfer.from_organization_id,
      );
      insertNotification.run(
        "overdue_handover",
        title,
        message,
        transfer.to_organization_id,
      );
      markOverdue.run(transfer.id);
    }
    db.exec("COMMIT");
    if (transfers.length > 0) {
      console.info(`[overdue-transfers] processed=${transfers.length}`);
    }
    return { processed: transfers.length };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
