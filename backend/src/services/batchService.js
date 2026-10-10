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

export function verifyEventChain(events) {
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

  return {
    valid: invalidEventIds.length === 0,
    invalidEventIds,
  };
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

  const allBatches = isAuditor
    ? db.prepare("SELECT * FROM batches ORDER BY id ASC").all()
    : db
        .prepare(
          "SELECT * FROM batches WHERE organization_id = ? ORDER BY id ASC",
        )
        .all(organizationId);
  const byId = new Map(allBatches.map((item) => [item.id, item]));
  const relationRows = db
    .prepare("SELECT parent_batch_id, child_batch_id FROM batch_relations")
    .all();
  const parents = new Map();
  const children = new Map();
  for (const batch of allBatches) {
    const legacyParents = [batch.parent_batch_id, ...parseBatchIds(batch.source_batch_ids)].filter(Boolean);
    parents.set(batch.id, [...new Set(legacyParents)]);
    children.set(batch.id, []);
  }
  for (const relation of relationRows) {
    if (!byId.has(relation.parent_batch_id) || !byId.has(relation.child_batch_id)) continue;
    parents.set(relation.child_batch_id, [...new Set([...(parents.get(relation.child_batch_id) || []), relation.parent_batch_id])]);
  }
  for (const [childId, parentIds] of parents) {
    for (const parentId of parentIds) {
      if (children.has(parentId)) children.get(parentId).push(childId);
    }
  }
  const toView = (batch) => ({
    id: batch.id, batch_code: batch.batch_code, product_id: batch.product_id,
    organization_id: batch.organization_id, status: batch.status,
    remaining_quantity: batch.remaining_quantity, parent_batch_id: batch.parent_batch_id,
    source_batch_ids: parseBatchIds(batch.source_batch_ids),
  });
  const ancestors = [];
  const descendants = [];
  let cycleDetected = false;
  const ancestorSeen = new Set([rootBatch.id]);
  ancestors.push(toView(rootBatch));
  const ancestorQueue = [{ id: rootBatch.id, path: new Set([rootBatch.id]) }];
  while (ancestorQueue.length) {
    const current = ancestorQueue.shift();
    for (const parentId of parents.get(current.id) || []) {
      if (current.path.has(parentId)) { cycleDetected = true; continue; }
      const parent = byId.get(parentId);
      if (!parent) continue;
      if (!ancestorSeen.has(parentId)) {
        ancestorSeen.add(parentId);
        ancestors.push(toView(parent));
      }
      ancestorQueue.push({ id: parentId, path: new Set([...current.path, parentId]) });
    }
  }
  const descendantSeen = new Set([rootBatch.id]);
  const descendantQueue = [rootBatch.id];
  while (descendantQueue.length) {
    const currentId = descendantQueue.shift();
    for (const childId of children.get(currentId) || []) {
      if (descendantSeen.has(childId)) { cycleDetected = true; continue; }
      descendantSeen.add(childId);
      const child = byId.get(childId);
      if (child) { descendants.push(toView(child)); descendantQueue.push(childId); }
    }
  }

  return {
    batch: getBatchWithEvents(rootBatch.id, organizationId, isAuditor),
    ancestors,
    descendants,
    roots: ancestors.filter((item) => (parents.get(item.id) || []).length === 0),
    cycleDetected,
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

  if (batch.status === "pending_confirmation") {
    throw new Error(
      "Lô hàng đang trong trạng thái chờ xác nhận bàn giao (bị khóa), không thể cập nhật trạng thái.",
    );
  }

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
