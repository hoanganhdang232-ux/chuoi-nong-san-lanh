import { getDb } from "../db/database.js";

/**
 * Lineage Repository - Manages batch relationships and lineage history
 */
export class LineageRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDb();
  }

  /**
   * Record a lineage relationship between parent and child batch.
   * Inserts into batch_lineage and maintains batch_relations for compatibility.
   * @param {object} param0
   * @param {number} param0.parentBatchId
   * @param {number} param0.childBatchId
   * @param {number} param0.quantityTransferred
   * @param {'split'|'merge'} param0.relationType
   * @returns {number} Inserted lineage record ID
   */
  recordLineage({ parentBatchId, childBatchId, quantityTransferred, relationType = "split" }) {
    // 1. Insert into batch_lineage
    const lineageResult = this.db
      .prepare(
        `INSERT INTO batch_lineage(parent_batch_id, child_batch_id, quantity_transferred)
         VALUES (?, ?, ?)`
      )
      .run(parentBatchId, childBatchId, quantityTransferred);

    // 2. Insert into batch_relations (composite PK parent_batch_id, child_batch_id)
    this.db
      .prepare(
        `INSERT OR REPLACE INTO batch_relations(parent_batch_id, child_batch_id, relation_type, quantity)
         VALUES (?, ?, ?, ?)`
      )
      .run(parentBatchId, childBatchId, relationType, quantityTransferred);

    return lineageResult.lastInsertRowid;
  }

  /**
   * Get direct parents of a batch
   * @param {number} batchId
   * @returns {object[]}
   */
  getDirectParents(batchId) {
    return this.db
      .prepare(
        `SELECT bl.*, b.batch_code, b.product_id, b.organization_id, b.status
         FROM batch_lineage bl
         INNER JOIN batches b ON b.id = bl.parent_batch_id
         WHERE bl.child_batch_id = ?
         ORDER BY bl.id ASC`
      )
      .all(batchId);
  }

  /**
   * Get direct children of a batch
   * @param {number} batchId
   * @returns {object[]}
   */
  getDirectChildren(batchId) {
    return this.db
      .prepare(
        `SELECT bl.*, b.batch_code, b.product_id, b.organization_id, b.status
         FROM batch_lineage bl
         INNER JOIN batches b ON b.id = bl.child_batch_id
         WHERE bl.parent_batch_id = ?
         ORDER BY bl.id ASC`
      )
      .all(batchId);
  }
}

export const lineageRepository = new LineageRepository();
