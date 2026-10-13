import {
  batchSplitMergeService,
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from "../services/batchSplitMergeService.js";

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
