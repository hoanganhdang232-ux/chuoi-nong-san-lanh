import { getDb } from "../db/database.js";
import { GENESIS_HASH, generateEventHash } from "../utils/hash.js";
import { getBatchGenealogy, parseBatchIds } from "./batchService.js";

export function buildAuditReport(batchId) {
  const db = getDb();
  const batch = db
    .prepare(
      `SELECT b.*, p.name AS product_name, p.unit, o.name AS organization_name,
            f.name AS farm_name, f.address AS farm_address
     FROM batches b
     INNER JOIN products p ON p.id = b.product_id
     INNER JOIN organizations o ON o.id = b.organization_id
     LEFT JOIN farms f ON f.id = b.source_farm_id
     WHERE b.id = ?`,
    )
    .get(batchId);
  if (!batch) return null;

  const events = db
    .prepare(
      `SELECT e.*, u.name AS actor_name FROM event_logs e
     LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.batch_id = ? ORDER BY e.id`,
    )
    .all(batchId);
  const invalidEventIds = [];
  let previousHash = GENESIS_HASH;
  for (const event of events) {
    const expectedHash = generateEventHash({
      previousHash: event.previous_hash,
      batchId: event.batch_id,
      eventType: event.event_type,
      dataJson: event.data_json,
      timestamp: event.timestamp,
    });
    if (
      event.previous_hash !== previousHash ||
      event.current_hash !== expectedHash
    ) {
      invalidEventIds.push(event.id);
    }
    previousHash = event.current_hash;
  }

  const temperatureLogs = db
    .prepare(
      "SELECT temperature, source, timestamp FROM temperature_logs WHERE batch_id = ? ORDER BY timestamp, id",
    )
    .all(batchId);
  const genealogy = getBatchGenealogy(batchId, batch.organization_id, true);

  return {
    reportType: "Agritrace traceability audit",
    exportedAt: new Date().toISOString(),
    batch: {
      ...batch,
      source_batch_ids: parseBatchIds(batch.source_batch_ids),
    },
    integrity: {
      valid: invalidEventIds.length === 0,
      checkedAt: new Date().toISOString(),
      checkedEvents: events.length,
      invalidEventIds,
    },
    events,
    temperatureLogs,
    genealogy,
  };
}
