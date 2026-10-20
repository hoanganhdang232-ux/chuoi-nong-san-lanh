import { getDb } from "../db/database.js";
import { createEventLog } from "./batchService.js";

/**
 * S-29: Ghi nhận lô đã bán hết / tiêu thụ (Consume Batch).
 * Dành cho Nhà phân phối hoặc tổ chức đang nắm giữ lô.
 * - Kiểm tra quyền giữ của tổ chức hiện tại.
 * - Kiểm tra remaining_quantity > 0 và status != 'consumed'.
 * - Transaction: remaining_quantity = 0, status = 'consumed'.
 * - Ghi sự kiện 'batch_consumed' / 'CONSUMED' vào Hash Chain của lô (E-04).
 */
export function consumeBatch({ batchId, organizationId, actorId, note = "" }) {
  const db = getDb();

  const id = Number(batchId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    const err = new Error("ID lô hàng không hợp lệ.");
    err.statusCode = 400;
    throw err;
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(id);
    if (!batch) {
      const err = new Error("Không tìm thấy lô hàng.");
      err.statusCode = 404;
      throw err;
    }

    if (batch.organization_id !== organizationId) {
      const err = new Error("Lô hàng này không thuộc quyền quản lý của tổ chức bạn.");
      err.statusCode = 403;
      throw err;
    }

    if (Number(batch.remaining_quantity) <= 0 || batch.status === "consumed") {
      const err = new Error("Lô hàng đã bị tiêu thụ hoặc đã hết hàng.");
      err.statusCode = 400;
      throw err;
    }

    const consumedAmount = Number(batch.remaining_quantity);

    db.prepare(
      `UPDATE batches
       SET remaining_quantity = 0,
           consumed_quantity = COALESCE(consumed_quantity, 0) + ?,
           status = 'consumed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(consumedAmount, id);

    // Ghi sự kiện CONSUMED vào chuỗi hash (E-04)
    const event = createEventLog({
      batchId: id,
      eventType: "batch_consumed",
      actorId,
      data: {
        action: "CONSUMED",
        consumed_quantity: consumedAmount,
        note: note || "Lô hàng đã bán hết cho người tiêu dùng",
        actor_id: actorId,
        consumed_at: new Date().toISOString(),
      },
    });

    db.exec("COMMIT");

    const updatedBatch = db
      .prepare(
        `SELECT b.*, p.name AS product_name, o.name AS organization_name,
                COALESCE(l.name, b.current_location, 'Chưa xác định') AS location_name
         FROM batches b
         INNER JOIN products p ON p.id = b.product_id
         INNER JOIN organizations o ON o.id = b.organization_id
         LEFT JOIN locations l ON l.id = b.location_id
         WHERE b.id = ?`,
      )
      .get(id);

    return {
      message: "Đã ghi nhận lô hàng tiêu thụ thành công.",
      batch: updatedBatch,
      event,
    };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
