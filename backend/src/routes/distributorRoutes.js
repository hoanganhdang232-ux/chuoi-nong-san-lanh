import { Router } from "express";
import { getDb } from "../db/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { createEventLog } from "../services/batchService.js";

const router = Router();
router.use(authenticateToken);

/**
 * PATCH /api/v1/distributor/lots/:id/sell-out
 * Đánh dấu lô hàng bán hết và tự động ghi nhận sự kiện tiêu thụ (Consumer Event Log).
 */
router.patch("/lots/:id/sell-out", (req, res) => {
  try {
    const lotId = Number(req.params.id);
    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(400).json({
        message: "Lô hàng không hợp lệ hoặc đã ở trạng thái sold_out.",
      });
    }

    // Ràng buộc quyền hạn: Chỉ tài khoản vai trò distributor_admin mới được thực hiện
    if (req.user.role !== "distributor_admin") {
      return res.status(403).json({
        message: "Bạn không có quyền thực hiện thao tác này.",
      });
    }

    const db = getDb();
    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(lotId);

    // Không tìm thấy lô hàng -> 404 Not Found
    if (!batch) {
      return res.status(404).json({
        message: "Không tìm thấy lô hàng.",
      });
    }

    // Lô hàng không thuộc tổ chức của nhà phân phối này -> 403 Forbidden
    if (batch.organization_id !== req.user.organization_id) {
      return res.status(403).json({
        message: "Bạn không có quyền thực hiện thao tác này.",
      });
    }

    // Ràng buộc trạng thái lô: Không được ở trạng thái sold_out hoặc recalled
    const validStatuses = [
      "delivered",
      "in_stock",
      "processed",
      "in_transit",
      "registered",
    ];
    if (
      batch.status === "sold_out" ||
      batch.status === "recalled" ||
      !validStatuses.includes(batch.status)
    ) {
      return res.status(400).json({
        message: "Lô hàng không hợp lệ hoặc đã ở trạng thái sold_out.",
      });
    }

    const previousStatus = batch.status;
    const soldQuantity = Number(batch.remaining_quantity) || 0;
    const soldOutAt = new Date().toISOString();

    const details = {
      action: "CONSUMED",
      lot_id: lotId,
      batch_code: batch.batch_code,
      sold_quantity: soldQuantity,
      sold_out_at: soldOutAt,
      previous_status: previousStatus,
      new_status: "sold_out",
      actor_id: req.user.id,
      actor_role: req.user.role,
      actor_name: req.user.name,
      distributor_id: req.user.organization_id,
      distributor_name: req.user.organization_name || "Nhà phân phối",
      location: batch.current_location || null,
      note: "Xác nhận bán hết thực tế cho người tiêu dùng",
    };

    // Thực hiện trong cùng 1 Database Transaction để đảm bảo tính toàn vẹn
    let eventResult;
    db.exec("BEGIN IMMEDIATE");
    try {
      // 1. Cập nhật lô hàng: status = sold_out, remaining_quantity = 0, sold_out_at = thời gian hiện tại
      db.prepare(
        `UPDATE batches
         SET status = 'sold_out',
             remaining_quantity = 0,
             sold_out_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(soldOutAt, lotId);

      // 2. Tạo sự kiện tiêu thụ (Consumer Event) vào bảng event_logs / events
      eventResult = createEventLog({
        batchId: lotId,
        eventType: "CONSUMED",
        actorId: req.user.id,
        data: details,
        timestamp: soldOutAt,
      });

      db.exec("COMMIT");
    } catch (transactionError) {
      db.exec("ROLLBACK");
      throw transactionError;
    }

    // Lấy thông tin lô hàng sau khi cập nhật
    const updatedBatch = db
      .prepare(
        `SELECT b.*, p.name AS product_name, p.unit AS product_unit, o.name AS organization_name
         FROM batches b
         LEFT JOIN products p ON p.id = b.product_id
         LEFT JOIN organizations o ON o.id = b.organization_id
         WHERE b.id = ?`,
      )
      .get(lotId);

    // Trả về 200 OK kèm thông tin lô hàng và event_id (cùng alias tương thích ngược)
    return res.status(200).json({
      success: true,
      message: "Đã xác nhận bán hết lô hàng thành công.",
      event_id: eventResult.eventId,
      lot: {
        ...updatedBatch,
        event_id: eventResult.eventId,
      },
      batch: {
        ...updatedBatch,
        event_id: eventResult.eventId,
      },
      event: {
        eventId: eventResult.eventId,
      },
    });
  } catch (error) {
    console.error("Sell-out error:", error);
    return res.status(500).json({
      message: "Đã xảy ra lỗi máy chủ khi cập nhật trạng thái bán hết.",
    });
  }
});

export default router;
