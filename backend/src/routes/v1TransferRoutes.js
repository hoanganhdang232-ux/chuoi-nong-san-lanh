import { Router } from "express";
import { getDb } from "../db/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  createTransferRequest,
  decideTransfer,
  cancelTransfer,
  getPendingTransfersForOrganization,
} from "../services/transferService.js";

const router = Router();
router.use(authenticateToken);

const allowedRoles = ["farm_admin", "processor_admin", "distributor_admin", "user"];

/**
 * GET /api/v1/transfers/pending
 * Lấy danh sách lô hàng đang chờ tổ chức của mình xác nhận.
 */
router.get("/pending", (req, res) => {
  try {
    const list = getPendingTransfersForOrganization(req.user.organization_id);
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message || "Lỗi khi lấy danh sách bàn giao chờ xác nhận." });
  }
});

/**
 * GET /api/v1/transfers
 * Lấy tất cả yêu cầu bàn giao (gửi đi & nhận về) của tổ chức.
 */
router.get("/", (req, res) => {
  const db = getDb();
  const rows = db
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
         bt.reason AS reject_reason,
         CASE
           WHEN bt.status = 'pending' THEN 'PENDING'
           WHEN bt.status = 'confirmed' THEN 'APPROVED'
           WHEN bt.status = 'rejected' THEN 'REJECTED'
           WHEN bt.status = 'cancelled' THEN 'CANCELLED'
           ELSE UPPER(bt.status)
         END AS status,
         CASE WHEN bt.status = 'pending' AND bt.created_at <= datetime('now', '-48 hours') THEN 1 ELSE 0 END AS is_overdue,
         bt.created_at,
         bt.updated_at
       FROM batch_transfers bt
       INNER JOIN batches b ON b.id = bt.batch_id
       LEFT JOIN products p ON p.id = b.product_id
       LEFT JOIN users u ON u.id = bt.requester_id
       INNER JOIN organizations o_from ON o_from.id = bt.from_organization_id
       INNER JOIN organizations o_to ON o_to.id = bt.to_organization_id
       WHERE bt.from_organization_id = ? OR bt.to_organization_id = ?
       ORDER BY bt.created_at DESC`,
    )
    .all(req.user.organization_id, req.user.organization_id);
  res.json(rows);
});

/**
 * POST /api/v1/transfers
 * Khởi tạo yêu cầu bàn giao lô sang tổ chức khác.
 */
router.post("/", requireRole(...allowedRoles), (req, res) => {
  const lotId = Number(
    req.body?.lot_id ??
    req.body?.lotId ??
    req.body?.batch_id ??
    req.body?.batchId,
  );
  const receiverOrgId = Number(
    req.body?.receiver_org_id ??
    req.body?.receiverOrgId ??
    req.body?.recipient_org_id ??
    req.body?.recipientOrgId ??
    req.body?.toOrganizationId,
  );
  const note = req.body?.note ? String(req.body.note).trim() : null;

  if (!lotId || Number.isNaN(lotId)) {
    return res.status(400).json({ message: "Vui lòng cung cấp mã định danh lô hàng (lot_id / batch_id)." });
  }
  if (!receiverOrgId || Number.isNaN(receiverOrgId)) {
    return res.status(400).json({ message: "Vui lòng chọn tổ chức nhận bàn giao (receiver_org_id)." });
  }

  try {
    const request = createTransferRequest({
      batchId: lotId,
      fromOrganizationId: req.user.organization_id,
      toOrganizationId: receiverOrgId,
      requesterId: req.user.id,
      note,
    });

    return res.status(201).json({
      message: "Khởi tạo yêu cầu bàn giao thành công. Lô hàng đã được chuyển sang trạng thái CHỜ XÁC NHẬN (bị khóa).",
      id: request.id,
      lot_id: request.batch_id,
      batch_id: request.batch_id,
      sender_org_id: req.user.organization_id,
      receiver_org_id: receiverOrgId,
      status: "PENDING",
      note,
      current_hash: request.currentHash,
      event: request.event,
    });
  } catch (error) {
    const status = error.message.includes("không có quyền") ? 403 : 400;
    return res.status(status).json({ message: error.message });
  }
});

/**
 * POST /api/v1/transfers/:id/approve
 * Bên nhận xác nhận bàn giao (chuyển quyền sở hữu lô sang bên nhận).
 */
router.post("/:id/approve", requireRole(...allowedRoles), (req, res) => {
  const transferId = Number(req.params.id);
  const reason = req.body?.reason ? String(req.body.reason).trim() : "Đã đồng ý nhận bàn giao lô hàng.";

  const db = getDb();
  const transfer = db.prepare("SELECT * FROM batch_transfers WHERE id = ?").get(transferId);
  if (!transfer) {
    return res.status(404).json({ message: "Yêu cầu bàn giao không tồn tại." });
  }
  if (transfer.to_organization_id !== req.user.organization_id) {
    return res.status(403).json({ message: "Chỉ tài khoản thuộc tổ chức nhận mới có quyền xác nhận bàn giao." });
  }

  try {
    const result = decideTransfer({
      transferId,
      actorOrganizationId: req.user.organization_id,
      decision: "confirmed",
      reason,
      actorId: req.user.id,
    });

    return res.json({
      message: "Đã xác nhận nhận bàn giao lô hàng thành công. Quyền sở hữu lô đã chuyển giao.",
      id: transferId,
      status: "APPROVED",
      lot: {
        id: result.batch.id,
        batch_code: result.batch.batch_code,
        organization_id: result.batch.organization_id,
        status: result.batch.status,
      },
      event: result.event,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/v1/transfers/:id/reject
 * Bên nhận từ chối bàn giao kèm lý do (tối thiểu 10 ký tự).
 */
router.post("/:id/reject", requireRole(...allowedRoles), (req, res) => {
  const transferId = Number(req.params.id);
  const rawReason = req.body?.reason ?? req.body?.reject_reason;
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";

  if (!reason || reason.length < 10) {
    return res.status(400).json({ message: "Bắt buộc nhập lý do từ chối (Lý do phải có tối thiểu 10 ký tự)." });
  }

  const db = getDb();
  const transfer = db.prepare("SELECT * FROM batch_transfers WHERE id = ?").get(transferId);
  if (!transfer) {
    return res.status(404).json({ message: "Yêu cầu bàn giao không tồn tại." });
  }
  if (transfer.to_organization_id !== req.user.organization_id) {
    return res.status(403).json({ message: "Chỉ tài khoản thuộc tổ chức nhận mới có quyền từ chối bàn giao." });
  }

  try {
    const result = decideTransfer({
      transferId,
      actorOrganizationId: req.user.organization_id,
      decision: "rejected",
      reason,
      actorId: req.user.id,
    });

    return res.json({
      message: "Đã từ chối nhận bàn giao lô hàng. Lô hàng đã được trả về quyền quản lý cho bên gửi.",
      id: transferId,
      status: "REJECTED",
      reject_reason: reason,
      lot: {
        id: result.batch.id,
        batch_code: result.batch.batch_code,
        organization_id: result.batch.organization_id,
        status: result.batch.status,
      },
      event: result.event,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/v1/transfers/:id/cancel
 * Bên giao hủy lệnh bàn giao (giải phóng lô hàng bị đóng băng).
 */
router.post("/:id/cancel", requireRole(...allowedRoles), (req, res) => {
  const transferId = Number(req.params.id);
  const reason = req.body?.reason ? String(req.body.reason).trim() : null;

  try {
    const result = cancelTransfer({
      transferId,
      actorOrganizationId: req.user.organization_id,
      actorId: req.user.id,
      reason,
    });

    return res.json({
      message: "Đã hủy lệnh bàn giao thành công. Lô hàng đã được mở khóa.",
      id: transferId,
      status: "CANCELLED",
      lot: {
        id: result.batch.id,
        batch_code: result.batch.batch_code,
        status: result.batch.status,
      },
      event: result.event,
    });
  } catch (error) {
    const status = error.message.includes("quyền") ? 403 : 400;
    return res.status(status).json({ message: error.message });
  }
});

export default router;
