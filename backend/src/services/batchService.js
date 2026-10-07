import { getDb } from "../db/database.js";
import { GENESIS_HASH, generateEventHash } from "../utils/hash.js";

export function parseBatchIds(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
  } catch {
    return [];
  }
}

export function createEventLog({
  batchId,
  eventType,
  actorId,
  data,
  timestamp = new Date().toISOString(),
}) {
  const db = getDb();
  const previousEvent = db
    .prepare(
      "SELECT current_hash FROM event_logs WHERE batch_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(batchId);
  const dataJson = JSON.stringify(data);
  const previousHash = previousEvent?.current_hash || GENESIS_HASH;
  const currentHash = generateEventHash({
    previousHash,
    batchId,
    eventType,
    dataJson,
    timestamp,
  });

  const result = db
    .prepare(
      `
      INSERT INTO event_logs(batch_id, event_type, actor_id, data_json, previous_hash, current_hash, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      batchId,
      eventType,
      actorId,
      dataJson,
      previousHash,
      currentHash,
      timestamp,
    );

  return { eventId: result.lastInsertRowid, previousHash, currentHash };
}

export function getBatchWithEvents(batchId, organizationId, isAuditor) {
  const db = getDb();
  const batch = db
    .prepare(
      `
    SELECT b.*, p.name AS product_name, o.name AS organization_name, f.name AS farm_name
    FROM batches b
    INNER JOIN products p ON p.id = b.product_id
    INNER JOIN organizations o ON o.id = b.organization_id
    LEFT JOIN farms f ON f.id = b.source_farm_id
    WHERE b.id = ? ${isAuditor ? "" : "AND b.organization_id = ?"}
  `,
    )
    .get(batchId, ...(isAuditor ? [] : [organizationId]));

  if (!batch) return null;

  const events = db
    .prepare(
      `
    SELECT e.*, u.name AS actor_name
    FROM event_logs e
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.batch_id = ?
    ORDER BY e.id ASC
  `,
    )
    .all(batchId);

  return {
    ...batch,
    source_batch_ids: parseBatchIds(batch.source_batch_ids),
    events,
  };
}

export function getBatchGenealogy(batchId, organizationId, isAuditor) {
  const db = getDb();
  const rootBatch = db
    .prepare(
      `SELECT * FROM batches WHERE id = ? ${isAuditor ? "" : "AND organization_id = ?"}`,
    )
    .get(batchId, ...(isAuditor ? [] : [organizationId]));

  if (!rootBatch) return null;

  const allBatches = db.prepare("SELECT * FROM batches ORDER BY id ASC").all();
  const ancestors = [];
  const seenAncestors = new Set();
  const visitedForward = new Set();
  const descendants = [];

  function walkAncestors(currentId) {
    if (!currentId || seenAncestors.has(currentId)) return;

    const batch = allBatches.find((item) => item.id === currentId);
    if (!batch) return;
    seenAncestors.add(currentId);

    if (batch.parent_batch_id) {
      walkAncestors(batch.parent_batch_id);
    }

    for (const sourceId of parseBatchIds(batch.source_batch_ids)) {
      walkAncestors(sourceId);
    }

    ancestors.push({
      id: batch.id,
      batch_code: batch.batch_code,
      product_id: batch.product_id,
      organization_id: batch.organization_id,
      status: batch.status,
      remaining_quantity: batch.remaining_quantity,
      parent_batch_id: batch.parent_batch_id,
      source_batch_ids: parseBatchIds(batch.source_batch_ids),
    });
  }

  function walkDescendants(currentId) {
    if (!currentId || visitedForward.has(currentId)) return;
    visitedForward.add(currentId);

    const directChildren = allBatches.filter(
      (item) => item.parent_batch_id === currentId,
    );

    const mergedChildren = allBatches.filter((item) =>
      parseBatchIds(item.source_batch_ids).includes(currentId),
    );

    const children = [...directChildren, ...mergedChildren].filter(
      (item, index, list) =>
        list.findIndex((entry) => entry.id === item.id) === index,
    );

    for (const child of children) {
      descendants.push({
        id: child.id,
        batch_code: child.batch_code,
        product_id: child.product_id,
        organization_id: child.organization_id,
        status: child.status,
        remaining_quantity: child.remaining_quantity,
        parent_batch_id: child.parent_batch_id,
        source_batch_ids: parseBatchIds(child.source_batch_ids),
      });
      walkDescendants(child.id);
    }
  }

  walkAncestors(rootBatch.id);
  walkDescendants(rootBatch.id);

  const dedupedAncestors = ancestors.filter(
    (item, index, list) =>
      list.findIndex((entry) => entry.id === item.id) === index,
  );
  const dedupedDescendants = descendants.filter(
    (item, index, list) =>
      list.findIndex((entry) => entry.id === item.id) === index,
  );

  return {
    batch: getBatchWithEvents(rootBatch.id, organizationId, isAuditor),
    ancestors: dedupedAncestors,
    descendants: dedupedDescendants,
    roots: dedupedAncestors.filter((item) => !item.parent_batch_id),
    cycleDetected: false,
  };
}

export function updateBatchStatus({
  batchId,
  status,
  actorId,
  data,
  organizationId,
  isAuditor,
}) {
  const db = getDb();
  const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
  if (!batch) throw new Error("Lô hàng không tồn tại.");
  if (!isAuditor && batch.organization_id !== organizationId)
    throw new Error("Không có quyền cập nhật lô hàng này.");

  db.prepare(
    `
    UPDATE batches
    SET status = ?, current_location = COALESCE(?, current_location), temperature_c = COALESCE(?, temperature_c), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(
    status,
    data.current_location || null,
    data.temperature_c ?? null,
    batchId,
  );

  return createEventLog({
    batchId,
    eventType: `batch_${status}`,
    actorId,
    data: {
      ...data,
      previous_status: batch.status,
      new_status: status,
    },
  });
}
