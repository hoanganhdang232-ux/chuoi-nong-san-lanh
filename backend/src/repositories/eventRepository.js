import { getDb } from "../db/database.js";
import { GENESIS_HASH, generateEventHash } from "../utils/hash.js";

/**
 * Event Repository - Handles immutable append-only event log with SHA-256 Hash Chain
 */
export class EventRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDb();
  }

  /**
   * Append a new event to the batch's hash chain.
   * Runs in the same database transaction as the batch state changes.
   * @param {object} param0
   * @param {number} param0.batchId
   * @param {string} param0.eventType ('SPLIT', 'SPLIT_CHILD', 'MERGE', 'MERGE_CHILD', etc.)
   * @param {number|null} param0.actorId
   * @param {object} param0.payload
   * @param {string} [param0.timestamp]
   * @returns {object} { eventId, previousHash, currentHash, timestamp }
   */
  appendEvent({
    batchId,
    eventType,
    actorId = null,
    payload = {},
    timestamp = new Date().toISOString(),
  }) {
    // 1. Fetch previous hash from the latest event of this batch
    const previousEvent = this.db
      .prepare(
        "SELECT current_hash FROM event_logs WHERE batch_id = ? ORDER BY id DESC LIMIT 1"
      )
      .get(batchId);

    const previousHash = previousEvent?.current_hash || GENESIS_HASH;
    const dataJson = typeof payload === "string" ? payload : JSON.stringify(payload);

    // 2. Generate SHA-256 hash connecting to previous hash
    const currentHash = generateEventHash({
      previousHash,
      batchId,
      eventType,
      dataJson,
      timestamp,
    });

    // 3. Append to event_logs table (guaranteed immutable by DB triggers)
    const result = this.db
      .prepare(
        `INSERT INTO event_logs(
          batch_id, event_type, actor_id, data_json,
          previous_hash, current_hash, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(batchId, eventType, actorId, dataJson, previousHash, currentHash, timestamp);

    return {
      eventId: result.lastInsertRowid,
      batchId,
      eventType,
      previousHash,
      currentHash,
      timestamp,
    };
  }

  /**
   * Retrieve all events for a batch in chronological order
   * @param {number} batchId
   * @returns {object[]}
   */
  getEventsByBatchId(batchId) {
    return this.db
      .prepare(
        `SELECT e.*, u.name AS actor_name
         FROM event_logs e
         LEFT JOIN users u ON u.id = e.actor_id
         WHERE e.batch_id = ?
         ORDER BY e.id ASC`
      )
      .all(batchId);
  }

  /**
   * Traverse the entire event chain of a batch and verify hash continuity
   * @param {number} batchId
   * @returns {{ valid: boolean, invalidEventIds: number[], count: number, events: object[] }}
   */
  verifyBatchHashChain(batchId) {
    const events = this.db
      .prepare("SELECT * FROM event_logs WHERE batch_id = ? ORDER BY id ASC")
      .all(batchId);

    const invalidEventIds = [];
    let expectedPreviousHash = GENESIS_HASH;

    for (const event of events) {
      const calculatedHash = generateEventHash({
        previousHash: event.previous_hash,
        batchId: event.batch_id,
        eventType: event.event_type,
        dataJson: event.data_json,
        timestamp: event.timestamp,
      });

      if (
        event.previous_hash !== expectedPreviousHash ||
        event.current_hash !== calculatedHash
      ) {
        invalidEventIds.push(event.id);
      }

      expectedPreviousHash = event.current_hash;
    }

    return {
      valid: invalidEventIds.length === 0,
      invalidEventIds,
      count: events.length,
      events,
    };
  }
}

export const eventRepository = new EventRepository();
