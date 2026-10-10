import { Router } from "express";
import { getDb } from "../db/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  createTransferRequest,
  decideTransfer,
  processOverdueTransfers,
} from "../services/transferService.js";

const router = Router();
router.use(authenticateToken);

router.post("/overdue/process", requireRole("farm_admin", "processor_admin", "distributor_admin", "auditor"), (req, res) => {
  res.json(processOverdueTransfers());
});

router.get("/requests", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT bt.*, b.batch_code, b.remaining_quantity, b.initial_quantity,
         p.name AS product_name, p.unit AS product_unit,
         o_from.name AS from_organization_name, o_to.name AS to_organization_name,
         u.name AS requester_name,
         CASE WHEN bt.status = 'pending' AND bt.created_at <= datetime('now', '-48 hours') THEN 1 ELSE 0 END AS is_overdue
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

router.post(
  "/batch/:batchId/transfer-requests",
  requireRole("farm_admin", "processor_admin", "distributor_admin"),
  (req, res) => {
    const batchId = Number(req.params.batchId || req.body?.batchId || req.body?.batch_id);
    const recipientOrgId = Number(
      req.body?.toOrganizationId ??
      req.body?.recipientOrgId ??
      req.body?.recipient_org_id
    );
    const { note } = req.body || {};

    try {
      const request = createTransferRequest({
        batchId,
        fromOrganizationId: req.user.organization_id,
        toOrganizationId: recipientOrgId,
        requesterId: req.user.id,
        note: String(note || ""),
      });
      res.status(201).json({ message: "Đã tạo yêu cầu bàn giao.", ...request });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },
);

router.post(
  "/transfer-requests/:id/decision",
  requireRole("farm_admin", "processor_admin", "distributor_admin"),
  (req, res) => {
    const transferId = Number(req.params.id);
    const { decision, reason } = req.body || {};

    const db = getDb();
    const transfer = db
      .prepare("SELECT * FROM batch_transfers WHERE id = ?")
      .get(transferId);
    if (!transfer) {
      return res
        .status(404)
        .json({ message: "Yêu cầu bàn giao không tồn tại." });
    }
    if (transfer.to_organization_id !== req.user.organization_id) {
      return res
        .status(403)
        .json({
          message: "Chỉ tổ chức nhận lô hàng mới được xử lý yêu cầu này.",
        });
    }

    try {
      const result = decideTransfer({
        transferId,
        actorOrganizationId: req.user.organization_id,
        decision,
        reason,
        actorId: req.user.id,
      });
      res.json({ message: "Đã xử lý yêu cầu bàn giao.", ...result });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },
);

router.get("/pending", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT bt.*, b.batch_code, b.remaining_quantity, b.initial_quantity,
         p.name AS product_name, p.unit AS product_unit,
         o_from.name AS from_organization_name, o_to.name AS to_organization_name,
         u.name AS requester_name
       FROM batch_transfers bt
       INNER JOIN batches b ON b.id = bt.batch_id
       LEFT JOIN products p ON p.id = b.product_id
       LEFT JOIN users u ON u.id = bt.requester_id
       INNER JOIN organizations o_from ON o_from.id = bt.from_organization_id
       INNER JOIN organizations o_to ON o_to.id = bt.to_organization_id
       WHERE bt.to_organization_id = ? AND bt.status = 'pending'
       ORDER BY bt.created_at DESC`,
    )
    .all(req.user.organization_id);
  res.json(rows);
});

router.post(
  "/:id/approve",
  requireRole("farm_admin", "processor_admin", "distributor_admin", "user"),
  (req, res) => {
    const transferId = Number(req.params.id);
    const reason = req.body?.reason ? String(req.body.reason).trim() : "Đã đồng ý nhận bàn giao lô hàng.";

    try {
      const result = decideTransfer({
        transferId,
        actorOrganizationId: req.user.organization_id,
        decision: "confirmed",
        reason,
        actorId: req.user.id,
      });
      res.json({ message: "Đã xác nhận nhận bàn giao lô hàng.", ...result, status: "APPROVED" });
    } catch (error) {
      const status = error.message.includes("quyền") ? 403 : 400;
      res.status(status).json({ message: error.message });
    }
  },
);

router.post(
  "/:id/reject",
  requireRole("farm_admin", "processor_admin", "distributor_admin", "user"),
  (req, res) => {
    const transferId = Number(req.params.id);
    const reason = req.body?.reason ?? req.body?.reject_reason;

    try {
      const result = decideTransfer({
        transferId,
        actorOrganizationId: req.user.organization_id,
        decision: "rejected",
        reason,
        actorId: req.user.id,
      });
      res.json({ message: "Đã từ chối nhận bàn giao lô hàng.", ...result, status: "REJECTED" });
    } catch (error) {
      const status = error.message.includes("quyền") ? 403 : 400;
      res.status(status).json({ message: error.message });
    }
  },
);

export default router;
