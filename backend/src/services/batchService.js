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
    SELECT b.*, p.name AS product_name, p.unit AS product_unit, o.name AS organization_name, f.name AS farm_name
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

/** Check whether a user's current batch gives them lineage access to a batch's history. */
export function canViewBatchHistory({
  targetBatchId,
  currentBatchId,
  organizationId,
  isAuditor,
  batchById,
  parents,
}) {
  const current = batchById.get(currentBatchId);
  if (!current || !batchById.has(targetBatchId)) return false;
  if (isAuditor) return true;
  if (current.organization_id !== organizationId) return false;

  const visited = new Set([currentBatchId]);
  const queue = [currentBatchId];
  while (queue.length) {
    const currentId = queue.shift();
    for (const parentId of parents.get(currentId) || []) {
      if (parentId === targetBatchId) return true;
      if (!visited.has(parentId) && batchById.has(parentId)) {
        visited.add(parentId);
        queue.push(parentId);
      }
    }
  }
  return targetBatchId === currentBatchId;
}

export function getBatchGenealogy(batchId, organizationId, isAuditor) {
  const db = getDb();
  const rootBatch = db
    .prepare(
      `SELECT * FROM batches WHERE id = ? ${isAuditor ? "" : "AND organization_id = ?"}`,
    )
    .get(batchId, ...(isAuditor ? [] : [organizationId]));

  if (!rootBatch) return null;

  // The holder of a batch may trace its ancestry across organization
  // boundaries. Descendant traversal is still scoped below to the holder's
  // organization so this does not expose downstream partner batches.
  const allBatches = db
    .prepare(
      `SELECT b.*, o.name AS organization_name
       FROM batches b
       INNER JOIN organizations o ON o.id = b.organization_id
       ORDER BY b.id ASC`,
    )
    .all();
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

  const hasCycleFrom = (startId, adjacency, isAllowed = () => true) => {
    const colors = new Map([[startId, 1]]);
    const stack = [{
      id: startId,
      neighbors: (adjacency.get(startId) || []).filter(isAllowed),
      nextIndex: 0,
    }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.nextIndex >= frame.neighbors.length) {
        colors.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const nextId = frame.neighbors[frame.nextIndex++];
      if (!byId.has(nextId)) continue;
      const color = colors.get(nextId) || 0;
      if (color === 1) return true;
      if (color === 0) {
        colors.set(nextId, 1);
        stack.push({
          id: nextId,
          neighbors: (adjacency.get(nextId) || []).filter(isAllowed),
          nextIndex: 0,
        });
      }
    }
    return false;
  };

  const toView = (batch) => ({
    id: batch.id,
    batch_code: batch.batch_code,
    product_id: batch.product_id,
    organization_id: batch.organization_id,
    organization_name: batch.organization_name,
    current_location: batch.current_location,
    status: Number(batch.remaining_quantity) <= 0 ? "consumed" : batch.status,
    remaining_quantity: batch.remaining_quantity,
    parent_batch_id: batch.parent_batch_id,
    source_batch_ids: parseBatchIds(batch.source_batch_ids),
  });
  const ancestors = [];
  const descendants = [];
  const cycleDetected =
    hasCycleFrom(rootBatch.id, parents) ||
    hasCycleFrom(
      rootBatch.id,
      children,
      (childId) =>
        isAuditor || byId.get(childId)?.organization_id === organizationId,
    );
  const ancestorSeen = new Set([rootBatch.id]);
  ancestors.push(toView(rootBatch));
  const ancestorQueue = [rootBatch.id];
  for (let queueIndex = 0; queueIndex < ancestorQueue.length; queueIndex += 1) {
    const currentId = ancestorQueue[queueIndex];
    for (const parentId of parents.get(currentId) || []) {
      const parent = byId.get(parentId);
      if (!parent) continue;
      if (!ancestorSeen.has(parentId)) {
        ancestorSeen.add(parentId);
        ancestors.push(toView(parent));
        ancestorQueue.push(parentId);
      }
    }
  }
  const descendantSeen = new Set([rootBatch.id]);
  const descendantQueue = [rootBatch.id];
  for (let queueIndex = 0; queueIndex < descendantQueue.length; queueIndex += 1) {
    const currentId = descendantQueue[queueIndex];
    for (const childId of children.get(currentId) || []) {
      if (descendantSeen.has(childId)) continue;
      const child = byId.get(childId);
      if (!isAuditor && child?.organization_id !== organizationId) continue;
      descendantSeen.add(childId);
      if (child) { descendants.push(toView(child)); descendantQueue.push(childId); }
    }
  }

  const ancestorIds = ancestors
    .map((item) => item.id)
    .filter(
      (id) =>
        id !== rootBatch.id &&
        canViewBatchHistory({
          targetBatchId: id,
          currentBatchId: rootBatch.id,
          organizationId,
          isAuditor,
          batchById: byId,
          parents,
        }),
    );
  const ancestorEvents = ancestorIds.length
    ? db
        .prepare(
          `SELECT e.*, b.batch_code, b.organization_id, u.name AS actor_name
           FROM event_logs e
           INNER JOIN batches b ON b.id = e.batch_id
           LEFT JOIN users u ON u.id = e.actor_id
           WHERE e.batch_id IN (${ancestorIds.map(() => "?").join(",")})
           ORDER BY e.timestamp ASC, e.id ASC`,
        )
        .all(...ancestorIds)
    : [];

  return {
    batch: getBatchWithEvents(rootBatch.id, organizationId, isAuditor),
    ancestors,
    ancestorEvents,
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
