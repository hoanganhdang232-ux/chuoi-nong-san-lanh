import { getDb } from "../db/database.js";
import { createEventLog } from "./batchService.js";

export function createTransferRequest({
  batchId,
  fromOrganizationId,
  toOrganizationId,
  requesterId,
  note,
}) {
  const db = getDb();
  const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
  if (!batch) throw new Error("Lô hàng không tồn tại.");
  if (batch.organization_id !== fromOrganizationId) {
    throw new Error("Tổ chức gửi yêu cầu không sở hữu lô hàng.");
  }
  if (fromOrganizationId === toOrganizationId) {
    throw new Error("Tổ chức nguồn và đích phải khác nhau.");
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

  return {
    id: result.lastInsertRowid,
    batch_id: batchId,
    status: "pending",
  };
}

function validateTransferDecision({ decision, reason }) {
  if (!["confirmed", "rejected"].includes(decision)) {
    throw new Error("Quyết định không hợp lệ.");
  }

  const cleanedReason = typeof reason === "string" ? reason.trim() : "";

  if (decision === "rejected") {
    if (!cleanedReason) {
      throw new Error("Vui lòng nhập lý do từ chối bàn giao.");
    }
    if (cleanedReason.length < 10) {
      throw new Error("Lý do từ chối phải tối thiểu 10 ký tự.");
    }
    return cleanedReason;
  }

  return cleanedReason || null;
}

export function decideTransfer({
  transferId,
  actorOrganizationId,
  decision,
  reason,
  actorId,
}) {
  const db = getDb();
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

  const decisionReason = validateTransferDecision({ decision, reason });
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

  const senderNotificationTitle =
    decision === "confirmed"
      ? "Bàn giao đã được xác nhận"
      : "Bàn giao bị từ chối";
  const senderNotificationMessage =
    decision === "confirmed"
      ? "Tổ chức nhận đã xác nhận bàn giao lô hàng của bạn."
      : `Tổ chức nhận đã từ chối bàn giao. Lý do: ${decisionReason}`;

  const senderUsers = db
    .prepare(
      "SELECT id, organization_id FROM users WHERE organization_id = ? AND is_active = 1",
    )
    .all(transfer.from_organization_id);

  for (const user of senderUsers) {
    db.prepare(
      `INSERT INTO notifications(user_id, organization_id, kind, title, message)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      user.id,
      user.organization_id,
      decision === "confirmed" ? "handover_accepted" : "handover_rejected",
      senderNotificationTitle,
      senderNotificationMessage,
    );
  }

  const batch = db
    .prepare("SELECT * FROM batches WHERE id = ?")
    .get(transfer.batch_id);
  return { batch, event, transferStatus: nextStatus };
}

/** Mark pending handovers older than 48 hours and notify both parties once. */
export function processOverdueTransfers() {
  const db = getDb();
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
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  if (transfers.length > 0) {
    console.info(`[overdue-transfers] processed=${transfers.length}`);
  }
  return { processed: transfers.length };
}
