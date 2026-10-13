import {
  batchSplitMergeService,
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from "../services/batchSplitMergeService.js";
import { updateSellOut } from "../services/batchService.js";
import { getDb } from "../db/database.js";

/**
 * Batch Controller - Handles HTTP layer for batch splitting, merging, and integrity verification
 */
export class BatchController {
  constructor(service = batchSplitMergeService) {
    this.service = service;
  }

  /**
   * POST /api/batches/:id/split
   */
  async splitBatch(req, res) {
    try {
      const parentBatchId = Number(req.params.id);
      const allocations = req.body?.allocations;

      const result = await this.service.splitBatch({
        parentBatchId,
        allocations,
        actorId: req.user.id,
        organizationId: req.user.organization_id,
        isAuditor: req.user.role === "auditor",
      });

      return res.status(200).json(result);
    } catch (err) {
      return this._handleError(res, err);
    }
  }

  /**
   * POST /api/batches/merge
   */
  async mergeBatches(req, res) {
    try {
      const parentBatchIds = req.body?.parentBatchIds ?? req.body?.batchIds;
      const quantitiesToMerge = req.body?.quantitiesToMerge ?? req.body?.quantities_to_merge ?? null;
      const targetProductId = req.body?.productId ?? req.body?.product_id ?? null;
      const currentLocation = req.body?.currentLocation ?? req.body?.current_location ?? null;
      const temperatureC = req.body?.temperatureC ?? req.body?.temperature_c ?? null;
      const note = req.body?.note ?? null;

      const result = await this.service.mergeBatches({
        parentBatchIds,
        quantitiesToMerge,
        targetProductId,
        currentLocation,
        temperatureC,
        note,
        actorId: req.user.id,
        organizationId: req.user.organization_id,
        isAuditor: req.user.role === "auditor",
      });

      return res.status(200).json(result);
    } catch (err) {
      return this._handleError(res, err);
    }
  }

  /**
   * GET /api/batches/:id/integrity
   */
  async verifyIntegrity(req, res) {
    try {
      const batchId = Number(req.params.id);
      const result = this.service.verifyIntegrity(
        batchId,
        req.user.organization_id,
        req.user.role === "auditor"
      );
      return res.status(200).json(result);
    } catch (err) {
      return this._handleError(res, err);
    }
  }

  /**
   * PATCH /api/v1/distributor/lots/:id/sell-out
   * Mark a batch as sold out (all products distributed to consumers)
   */
  async sellOut(req, res) {
    try {
      const batchId = Number(req.params.id);
      
      // Only distributor_admin can perform this action
      if (req.user.role !== "distributor_admin" && req.user.role !== "auditor") {
        return res.status(403).json({ message: "Chỉ nhà phân phối mới có quyền thực hiện thao tác này." });
      }

      const result = updateSellOut({
        batchId,
        actorId: req.user.id,
        organizationId: req.user.organization_id,
        isAuditor: req.user.role === "auditor",
      });

      // Get updated batch details
      const db = getDb();
      const updatedBatch = db
        .prepare(
          `SELECT b.*, p.name AS product_name, o.name AS organization_name
           FROM batches b
           INNER JOIN products p ON p.id = b.product_id
           INNER JOIN organizations o ON o.id = b.organization_id
           WHERE b.id = ?`
        )
        .get(batchId);

      return res.status(200).json({
        message: "Đã cập nhật lô hàng thành trạng thái 'Đã bán hết'.",
        batch: updatedBatch,
        event: result,
      });
    } catch (err) {
      if (err.message.includes("không tồn tại")) {
        return res.status(404).json({ message: err.message });
      }
      if (err.message.includes("không có quyền")) {
        return res.status(403).json({ message: err.message });
      }
      return res.status(400).json({ message: err.message });
    }
  }

  /**
   * Map domain errors to appropriate HTTP responses
   * @private
   */
  _handleError(res, err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ message: err.message });
    }
    if (err instanceof ForbiddenError) {
      return res.status(403).json({ message: err.message });
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json({ message: err.message });
    }
    // Generic or unexpected error
    console.error("BatchController error:", err);
    return res.status(err.statusCode || 500).json({
      message: err.message || "Đã xảy ra lỗi máy chủ.",
    });
  }
}

export const batchController = new BatchController();
