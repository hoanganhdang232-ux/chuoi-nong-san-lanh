import { getDb } from "../db/database.js";
import { parseBatchIds } from "../services/batchService.js";

/**
 * Batch Repository - Handles all direct database access for batches table
 */
export class BatchRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDb();
  }

  /**
   * Find batch by ID
   * @param {number} id
   * @returns {object|null}
   */
  findById(id) {
    return this.db.prepare("SELECT * FROM batches WHERE id = ?").get(id) || null;
  }

  /**
   * Find batch by ID with pessimistic intent (inside active transaction)
   * @param {number} id
   * @returns {object|null}
   */
  findByIdForUpdate(id) {
    // In SQLite, executing SELECT inside BEGIN IMMEDIATE holds the reserved/exclusive lock on the database.
    return this.db.prepare("SELECT * FROM batches WHERE id = ?").get(id) || null;
  }

  /**
   * Find multiple batches sorted by ID ascending to guarantee deterministic order and prevent Deadlock.
   * @param {number[]} ids
   * @returns {object[]}
   */
  findManyByIdsForUpdate(ids) {
    if (!ids || ids.length === 0) return [];
    const sortedIds = [...new Set(ids)].sort((a, b) => Number(a) - Number(b));
    const placeholders = sortedIds.map(() => "?").join(", ");
    return this.db
      .prepare(`SELECT * FROM batches WHERE id IN (${placeholders}) ORDER BY id ASC`)
      .all(...sortedIds);
  }

  /**
   * Insert a new child or merged batch
   * @param {object} batchData
   * @returns {object} inserted row
   */
  createBatch({
    batchCode,
    productId,
    organizationId,
    sourceFarmId,
    parentBatchId = null,
    rootBatchId = null,
    sourceBatchIds = null,
    initialQuantity,
    remainingQuantity,
    currentLocation = null,
    temperatureC = 9,
    status = "registered",
  }) {
    const serializedSourceBatchIds = Array.isArray(sourceBatchIds)
      ? JSON.stringify(sourceBatchIds)
      : typeof sourceBatchIds === "string"
        ? sourceBatchIds
        : null;

    const result = this.db
      .prepare(
        `INSERT INTO batches(
          batch_code, product_id, organization_id, source_farm_id,
          parent_batch_id, root_batch_id, source_batch_ids,
          initial_quantity, remaining_quantity, current_location,
          temperature_c, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        batchCode,
        productId,
        organizationId,
        sourceFarmId,
        parentBatchId,
        rootBatchId,
        serializedSourceBatchIds,
        initialQuantity,
        remainingQuantity,
        currentLocation,
        temperatureC,
        status
      );

    return this.findById(result.lastInsertRowid);
  }

  /**
   * Update remaining quantity of a batch
   * @param {number} id
   * @param {number} remainingQuantity
   * @returns {void}
   */
  updateRemainingQuantity(id, remainingQuantity) {
    this.db
      .prepare(
        "UPDATE batches SET remaining_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
      .run(remainingQuantity, id);
  }

  /**
   * Update status and remaining quantity of a batch
   * @param {number} id
   * @param {string} status
   * @param {number} remainingQuantity
   * @returns {void}
   */
  updateStatusAndRemaining(id, status, remainingQuantity) {
    this.db
      .prepare(
        "UPDATE batches SET status = ?, remaining_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
      .run(status, remainingQuantity, id);
  }

  /**
   * Get batch with detailed relations and event list
   * @param {number} id
   * @param {number} organizationId
   * @param {boolean} isAuditor
   * @returns {object|null}
   */
  getBatchWithDetails(id, organizationId, isAuditor = false) {
    const batch = this.db
      .prepare(
        `SELECT b.*, p.name AS product_name, o.name AS organization_name, f.name AS farm_name
         FROM batches b
         INNER JOIN products p ON p.id = b.product_id
         INNER JOIN organizations o ON o.id = b.organization_id
         LEFT JOIN farms f ON f.id = b.source_farm_id
         WHERE b.id = ? ${isAuditor ? "" : "AND b.organization_id = ?"}`
      )
      .get(id, ...(isAuditor ? [] : [organizationId]));

    if (!batch) return null;

    const events = this.db
      .prepare(
        `SELECT e.*, u.name AS actor_name
         FROM event_logs e
         LEFT JOIN users u ON u.id = e.actor_id
         WHERE e.batch_id = ?
         ORDER BY e.id ASC`
      )
      .all(id);

    return {
      ...batch,
      source_batch_ids: parseBatchIds(batch.source_batch_ids),
      events,
    };
  }
}

export const batchRepository = new BatchRepository();
