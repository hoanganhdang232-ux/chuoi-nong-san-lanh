import { Router } from "express";
import { getDb } from "../db/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  createTransferRequest,
  decideTransfer,
} from "../services/transferService.js";

const router = Router();
router.use(authenticateToken);

router.get("/requests", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT bt.*, b.batch_code, o_from.name AS from_organization_name, o_to.name AS to_organization_name
       FROM batch_transfers bt
       INNER JOIN batches b ON b.id = bt.batch_id
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
    const batchId = Number(req.params.batchId);
    const { toOrganizationId, note } = req.body || {};

    try {
      const request = createTransferRequest({
        batchId,
        fromOrganizationId: req.user.organization_id,
        toOrganizationId: Number(toOrganizationId),
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
    if (
      transfer.to_organization_id !== req.user.organization_id &&
      transfer.from_organization_id !== req.user.organization_id
    ) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xử lý yêu cầu này." });
    }

    try {
      const result = decideTransfer({
        transferId,
        actorOrganizationId: req.user.organization_id,
        decision,
        reason: String(reason || ""),
        actorId: req.user.id,
      });
      res.json({ message: "Đã xử lý yêu cầu bàn giao.", ...result });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },
);

export default router;
