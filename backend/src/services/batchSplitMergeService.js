import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.js";
import { batchRepository } from "../repositories/batchRepository.js";
import { lineageRepository } from "../repositories/lineageRepository.js";
import { eventRepository } from "../repositories/eventRepository.js";
import { lockManager } from "../utils/lockManager.js";
import { parseBatchIds } from "./batchService.js";

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

export class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = "ForbiddenError";
    this.statusCode = 403;
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

/**
 * Batch Split & Merge Service
 * Implements S-17, S-18, S-19, S-20 with strict Pessimistic Locking,
 * Concurrency Race-Condition protection, and Transactional Hash Chain integrity.
 */
export class BatchSplitMergeService {
  constructor(
    batchRepo = batchRepository,
    lineageRepo = lineageRepository,
    eventRepo = eventRepository
  ) {
    this.batchRepo = batchRepo;
    this.lineageRepo = lineageRepo;
    this.eventRepo = eventRepo;
  }

  /**
   * Split a parent batch into multiple child batches (S-17, S-18).
   * Protected with pessimistic locking & transactional isolation.
   *
   * @param {object} param0
   * @param {number} param0.parentBatchId
   * @param {Array<{quantity: number, location?: string}>} param0.allocations
   * @param {number} param0.actorId
   * @param {number} param0.organizationId
   * @param {boolean} [param0.isAuditor=false]
   * @returns {Promise<{message: string, parentBatch: object, children: object[]}>}
   */
  async splitBatch({
    parentBatchId,
    allocations,
    actorId,
    organizationId,
    isAuditor = false,
  }) {
    const batchId = Number(parentBatchId);
    if (!Number.isSafeInteger(batchId) || batchId <= 0) {
      throw new ValidationError("ID lô hàng không hợp lệ.");
    }

    if (!Array.isArray(allocations) || allocations.length === 0) {
      throw new ValidationError("Cần ít nhất một phân bổ khối lượng cho lô con.");
    }

    // 1. Pessimistic Lock on parent batch key
    return await lockManager.withLock(`batch:${batchId}`, async () => {
      const db = getDb();
      db.exec("BEGIN IMMEDIATE");

      try {
        // 2. Select parent batch row for update within transaction
        const parent = this.batchRepo.findByIdForUpdate(batchId);
        if (!parent) {
          throw new NotFoundError("Không tìm thấy lô hàng.");
        }

        if (!isAuditor && parent.organization_id !== organizationId) {
          throw new ForbiddenError("Bạn không có quyền tách lô này.");
        }

        if (parent.status === "pending_confirmation") {
          throw new ValidationError(
            "Lô hàng đang trong trạng thái chờ xác nhận bàn giao (bị khóa), không thể chia tách."
          );
        }

        // 3. Validate allocation numbers and calculate total
        let totalAllocated = 0;
        for (const alloc of allocations) {
          const qty = Number(alloc?.quantity);
          if (!Number.isFinite(qty) || qty <= 0) {
            throw new ValidationError("Khối lượng tách của mỗi lô con phải lớn hơn 0.");
          }
          totalAllocated += qty;
        }

        // Round to 4 decimal places to prevent floating point inaccuracies
        totalAllocated = Math.round(totalAllocated * 10000) / 10000;
        const currentRemaining = Math.round(Number(parent.remaining_quantity) * 10000) / 10000;

        // 4. Strict capacity verification (Race condition & Over-allocation prevention)
        if (totalAllocated <= 0 || totalAllocated > currentRemaining) {
          throw new ValidationError(
            "Tổng khối lượng lô con không được vượt quá khối lượng còn lại của lô mẹ."
          );
        }

        const newRemaining = Math.round((currentRemaining - totalAllocated) * 10000) / 10000;
        const parentRootId = parent.root_batch_id || parent.id;
        const children = [];

        // 5. Create each child batch, lineage relation, and event log in SAME transaction
        for (const alloc of allocations) {
          const qty = Number(alloc.quantity);
          const childCode = `BATCH-${randomBytes(5).toString("hex").toUpperCase()}`;
          const childLocation = alloc.location || parent.current_location;

          const childBatch = this.batchRepo.createBatch({
            batchCode: childCode,
            productId: parent.product_id,
            organizationId: parent.organization_id,
            sourceFarmId: parent.source_farm_id,
            parentBatchId: parent.id,
            rootBatchId: parentRootId,
            sourceBatchIds: [parent.id],
            initialQuantity: qty,
            remainingQuantity: qty,
            currentLocation: childLocation,
            temperatureC: parent.temperature_c,
            status: parent.status === "recalled" ? "recalled" : "registered",
          });

          // Lineage insertion (both batch_lineage and batch_relations)
          this.lineageRepo.recordLineage({
            parentBatchId: parent.id,
            childBatchId: childBatch.id,
            quantityTransferred: qty,
            relationType: "split",
          });

          // Child event log: BIRTH / SPLIT_CHILD
          this.eventRepo.appendEvent({
            batchId: childBatch.id,
            eventType: "SPLIT_CHILD",
            actorId,
            payload: {
              parent_batch_id: parent.id,
              parent_batch_code: parent.batch_code,
              source_batch_id: parent.id,
              quantity: qty,
              location: childLocation,
            },
          });

          children.push({
            ...childBatch,
            source_batch_ids: [parent.id],
          });
        }

        // 6. Update parent remaining quantity
        this.batchRepo.updateRemainingQuantity(parent.id, newRemaining);

        // 7. Parent event log: SPLIT
        this.eventRepo.appendEvent({
          batchId: parent.id,
          eventType: "SPLIT",
          actorId,
          payload: {
            split_from_batch_id: parent.id,
            child_batch_ids: children.map((c) => c.id),
            child_batch_codes: children.map((c) => c.batch_code),
            total_quantity_allocated: totalAllocated,
            remaining_quantity: newRemaining,
          },
        });

        // 8. Hash chain integrity verification on created child batches
        for (const child of children) {
          const childIntegrity = this.eventRepo.verifyBatchHashChain(child.id);
          if (!childIntegrity.valid) {
            throw new Error(`Lỗi toàn vẹn chuỗi Hash Chain tại lô con ID: ${child.id}`);
          }
        }

        db.exec("COMMIT");

        const updatedParent = this.batchRepo.getBatchWithDetails(
          parent.id,
          organizationId,
          isAuditor
        );

        return {
          message: "Đã tách lô hàng thành công.",
          parentBatch: updatedParent,
          children,
        };
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    });
  }

  /**
   * Merge multiple parent batches into a single consolidated batch (S-19, S-20).
   * Employs ascending lock ordering to prevent deadlocks under concurrency.
   *
   * @param {object} param0
   * @param {number[]} param0.parentBatchIds
   * @param {Record<number, number>|number[]|null} [param0.quantitiesToMerge=null]
   * @param {number|null} [param0.targetProductId=null]
   * @param {string|null} [param0.currentLocation=null]
   * @param {number|null} [param0.temperatureC=null]
   * @param {string|null} [param0.note=null]
   * @param {number} param0.actorId
   * @param {number} param0.organizationId
   * @param {boolean} [param0.isAuditor=false]
   * @returns {Promise<{message: string, newBatch: object}>}
   */
  async mergeBatches({
    parentBatchIds,
    quantitiesToMerge = null,
    targetProductId = null,
    currentLocation = null,
    temperatureC = null,
    note = null,
    actorId,
    organizationId,
    isAuditor = false,
  }) {
    if (!Array.isArray(parentBatchIds) || parentBatchIds.length < 2) {
      throw new ValidationError("Cần ít nhất 2 lô hàng để gộp.");
    }

    // Deduplicate and enforce ascending numeric sort to strictly prevent Deadlocks
    const uniqueIds = [...new Set(parentBatchIds.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
    if (uniqueIds.length < 2) {
      throw new ValidationError("Cần ít nhất 2 lô hàng phân biệt để gộp.");
    }
    const sortedIds = uniqueIds.sort((a, b) => a - b);

    // 1. Pessimistic Locking on all parent keys in ascending sequence
    const lockKeys = sortedIds.map((id) => `batch:${id}`);

    return await lockManager.withLock(lockKeys, async () => {
      const db = getDb();
      db.exec("BEGIN IMMEDIATE");

      try {
        // 2. Fetch all parent batches sorted by ID
        const parentBatches = this.batchRepo.findManyByIdsForUpdate(sortedIds);

        if (parentBatches.length !== sortedIds.length) {
          throw new NotFoundError("Một hoặc nhiều lô hàng không tồn tại.");
        }

        // 3. Organization ownership validation
        if (!isAuditor && parentBatches.some((b) => b.organization_id !== organizationId)) {
          throw new ForbiddenError("Bạn không có quyền gộp các lô hàng này.");
        }

        // 4. Lock state check
        const lockedBatch = parentBatches.find((b) => b.status === "pending_confirmation");
        if (lockedBatch) {
          throw new ValidationError(
            `Lô hàng ${lockedBatch.batch_code} đang trong trạng thái chờ xác nhận bàn giao (bị khóa), không thể gộp.`
          );
        }

        // 5. Product compatibility check
        const primaryProductId = targetProductId !== null && targetProductId !== undefined
          ? Number(targetProductId)
          : parentBatches[0].product_id;

        const productRow = db
          .prepare("SELECT id FROM products WHERE id = ? AND organization_id = ?")
          .get(primaryProductId, parentBatches[0].organization_id);

        if (!productRow) {
          throw new ValidationError("Sản phẩm gộp phải thuộc tổ chức của bạn.");
        }

        if (parentBatches.some((b) => b.product_id !== primaryProductId)) {
          throw new ValidationError("Các lô hàng cần cùng loại sản phẩm để gộp.");
        }

        // 6. Calculate merge quantities per parent batch
        const mergePlan = [];
        let totalQuantity = 0;

        for (let i = 0; i < parentBatches.length; i++) {
          const batch = parentBatches[i];
          const availableQty = Math.round(Number(batch.remaining_quantity) * 10000) / 10000;

          let qtyToTake = availableQty;
          if (Array.isArray(quantitiesToMerge)) {
            const specified = Number(quantitiesToMerge[i]);
            if (Number.isFinite(specified) && specified > 0) {
              qtyToTake = Math.round(specified * 10000) / 10000;
            }
          } else if (quantitiesToMerge && typeof quantitiesToMerge === "object") {
            const specified = Number(quantitiesToMerge[batch.id]);
            if (Number.isFinite(specified) && specified > 0) {
              qtyToTake = Math.round(specified * 10000) / 10000;
            }
          }

          if (qtyToTake <= 0) {
            throw new ValidationError(`Khối lượng rút từ lô ${batch.batch_code} phải lớn hơn 0.`);
          }

          if (qtyToTake > availableQty) {
            throw new ValidationError(
              `Số lượng rút từ lô ${batch.batch_code} (${qtyToTake} kg) vượt quá khối lượng còn lại (${availableQty} kg).`
            );
          }

          totalQuantity += qtyToTake;
          mergePlan.push({ batch, qtyToTake, newRemaining: Math.round((availableQty - qtyToTake) * 10000) / 10000 });
        }

        totalQuantity = Math.round(totalQuantity * 10000) / 10000;
        if (totalQuantity <= 0) {
          throw new ValidationError("Tổng khối lượng gộp phải lớn hơn 0.");
        }

        // 7. Create new merged batch
        const rootBatchId = parentBatches[0].root_batch_id || parentBatches[0].id;
        const newBatchCode = `BATCH-${randomBytes(5).toString("hex").toUpperCase()}`;
        const newBatchLocation = currentLocation || parentBatches[0].current_location;
        const newTemperatureC = Number.isFinite(Number(temperatureC))
          ? Number(temperatureC)
          : Number(parentBatches[0].temperature_c ?? 9);

        const newBatch = this.batchRepo.createBatch({
          batchCode: newBatchCode,
          productId: primaryProductId,
          organizationId: parentBatches[0].organization_id,
          sourceFarmId: parentBatches[0].source_farm_id,
          parentBatchId: null,
          rootBatchId,
          sourceBatchIds: sortedIds,
          initialQuantity: totalQuantity,
          remainingQuantity: totalQuantity,
          currentLocation: newBatchLocation,
          temperatureC: newTemperatureC,
          status: "registered",
        });

        // 8. Update each parent batch, record lineage, and log MERGE event
        for (const item of mergePlan) {
          const { batch, qtyToTake, newRemaining } = item;
          const nextStatus = newRemaining === 0 ? "processed" : batch.status;

          this.batchRepo.updateStatusAndRemaining(batch.id, nextStatus, newRemaining);

          // Lineage insertion
          this.lineageRepo.recordLineage({
            parentBatchId: batch.id,
            childBatchId: newBatch.id,
            quantityTransferred: qtyToTake,
            relationType: "merge",
          });

          // Parent event log: MERGE
          this.eventRepo.appendEvent({
            batchId: batch.id,
            eventType: "MERGE",
            actorId,
            payload: {
              merged_into_batch_id: newBatch.id,
              merged_into_batch_code: newBatch.batch_code,
              quantity_taken: qtyToTake,
              remaining_quantity: newRemaining,
            },
          });
        }

        // 9. New batch event log: MERGE_CHILD / BIRTH
        this.eventRepo.appendEvent({
          batchId: newBatch.id,
          eventType: "MERGE_CHILD",
          actorId,
          payload: {
            source_batch_ids: sortedIds,
            source_batch_codes: parentBatches.map((b) => b.batch_code),
            total_quantity: totalQuantity,
            note: note || "",
          },
        });

        // 10. Verify Hash Chain on the newly created merged batch
        const newBatchIntegrity = this.eventRepo.verifyBatchHashChain(newBatch.id);
        if (!newBatchIntegrity.valid) {
          throw new Error(`Lỗi toàn vẹn chuỗi Hash Chain tại lô hàng mới ID: ${newBatch.id}`);
        }

        db.exec("COMMIT");

        const populatedNewBatch = this.batchRepo.getBatchWithDetails(
          newBatch.id,
          organizationId,
          isAuditor
        );

        return {
          message: "Đã gộp lô hàng thành công.",
          newBatch: {
            ...populatedNewBatch,
            source_batch_ids: parseBatchIds(populatedNewBatch.source_batch_ids),
          },
        };
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    });
  }

  /**
   * Verify integrity of a batch's hash chain
   * @param {number} batchId
   * @param {number} organizationId
   * @param {boolean} isAuditor
   * @returns {object}
   */
  verifyIntegrity(batchId, organizationId, isAuditor = false) {
    const id = Number(batchId);
    const batch = this.batchRepo.findById(id);
    if (!batch) {
      throw new NotFoundError("Không tìm thấy lô hàng.");
    }

    if (!isAuditor && batch.organization_id !== organizationId) {
      throw new ForbiddenError("Không có quyền truy cập lô hàng này.");
    }

    const result = this.eventRepo.verifyBatchHashChain(id);
    return {
      valid: result.valid,
      is_valid: result.valid,
      broken: !result.valid,
      invalidEventIds: result.invalidEventIds,
      invalid_event_ids: result.invalidEventIds,
      count: result.count,
      events: result.events,
      batch: {
        id: batch.id,
        batch_code: batch.batch_code,
        status: batch.status,
        organization_id: batch.organization_id,
      },
    };
  }
}

export const batchSplitMergeService = new BatchSplitMergeService();
