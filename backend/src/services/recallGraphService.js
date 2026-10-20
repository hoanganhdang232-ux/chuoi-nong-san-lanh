import { getDb } from "../db/database.js";
import { parseBatchIds } from "./batchService.js";

/**
 * SCRUM-170 / T-73 & T-74: Thuật toán truy xuôi cây phả hệ lô bị thu hồi & Xử lý Blended Batch.
 * - Sử dụng thuật toán duyệt đồ thị theo chiều rộng (BFS).
 * - Duyệt qua batch_relations, batch_lineage, batches.parent_batch_id, batches.source_batch_ids.
 * - Phát hiện và gắn cờ các lô pha trộn/gộp (Blended Batches) bị nhiễm chéo từ lô sự cố.
 * - Chống lặp vô hạn (Cycle Detection) bằng visitedIds.
 * - Hỗ trợ cây phả hệ sâu 4-5 tầng.
 */
export function traceRecallDescendants(rootBatchId) {
  const db = getDb();
  const rootId = Number(rootBatchId);

  // 1. Lấy tất cả quan hệ phả hệ từ batch_relations và batch_lineage
  const allRelations = db
    .prepare(
      `SELECT parent_batch_id, child_batch_id, relation_type, quantity
       FROM batch_relations
       UNION
       SELECT parent_batch_id, child_batch_id, 'split' AS relation_type, quantity_transferred AS quantity
       FROM batch_lineage`,
    )
    .all();

  // Xây dựng danh sách kề (Adjacency List): parentId -> [childId, ...]
  // và lưu metadata quan hệ: childId -> { parents: [...], relationTypes: [...] }
  const childrenOf = new Map();
  const parentsOf = new Map();

  for (const rel of allRelations) {
    // Forward mapping: parent -> children
    if (!childrenOf.has(rel.parent_batch_id)) {
      childrenOf.set(rel.parent_batch_id, []);
    }
    const cList = childrenOf.get(rel.parent_batch_id);
    if (!cList.includes(rel.child_batch_id)) {
      cList.push(rel.child_batch_id);
    }

    // Reverse mapping: child -> parents (để phát hiện Blended/Merged)
    if (!parentsOf.has(rel.child_batch_id)) {
      parentsOf.set(rel.child_batch_id, []);
    }
    const pList = parentsOf.get(rel.child_batch_id);
    if (!pList.some((p) => p.parentId === rel.parent_batch_id)) {
      pList.push({
        parentId: rel.parent_batch_id,
        relationType: rel.relation_type,
        quantity: rel.quantity,
      });
    }
  }

  // Bổ sung quan hệ trực tiếp từ bảng batches (parent_batch_id, source_batch_ids)
  const batchesWithParents = db
    .prepare(
      "SELECT id, parent_batch_id, source_batch_ids FROM batches WHERE parent_batch_id IS NOT NULL OR (source_batch_ids IS NOT NULL AND source_batch_ids != '[]')",
    )
    .all();

  for (const b of batchesWithParents) {
    const parentIds = [b.parent_batch_id, ...parseBatchIds(b.source_batch_ids)].filter(Boolean);
    for (const pid of parentIds) {
      if (!childrenOf.has(pid)) {
        childrenOf.set(pid, []);
      }
      const cList = childrenOf.get(pid);
      if (!cList.includes(b.id)) {
        cList.push(b.id);
      }

      if (!parentsOf.has(b.id)) {
        parentsOf.set(b.id, []);
      }
      const pList = parentsOf.get(b.id);
      if (!pList.some((p) => p.parentId === pid)) {
        pList.push({
          parentId: pid,
          relationType: parentIds.length > 1 ? "merge" : "split",
          quantity: null,
        });
      }
    }
  }

  // 2. Thuật toán BFS truy vết xuôi từ rootBatchId
  const visitedIds = new Set();
  const queue = [{ batchId: rootId, depth: 0, path: [rootId] }];
  visitedIds.add(rootId);

  const affectedMap = new Map(); // batchId -> { depth, isBlended, blendSources, path }
  let cycleDetected = false;

  while (queue.length > 0) {
    const { batchId, depth, path } = queue.shift();
    const children = childrenOf.get(batchId) || [];

    for (const childId of children) {
      if (path.includes(childId)) {
        cycleDetected = true;
        continue;
      }
      if (visitedIds.has(childId)) {
        continue;
      }
      visitedIds.add(childId);

      // T-74: Blended Batch Handler
      // Kiểm tra nếu lô này được gộp từ nhiều nguồn cha (Merge / Blend)
      // hoặc kế thừa tính chất pha trộn từ bất kỳ lô tổ tiên nào trong chuỗi phả hệ
      const parents = parentsOf.get(childId) || [];
      const isDirectlyBlended = parents.length > 1 || parents.some((p) => p.relationType === "merge");
      const ancestorIsBlended = path.some((ancestorId) => affectedMap.get(ancestorId)?.isBlended);
      const isBlended = isDirectlyBlended || ancestorIsBlended;

      let blendSources = parents.map((p) => p.parentId);
      if (!isDirectlyBlended && ancestorIsBlended) {
        const nearestBlended = [...path].reverse().find((aId) => affectedMap.get(aId)?.isBlended);
        if (nearestBlended && affectedMap.get(nearestBlended)?.blendSources) {
          blendSources = affectedMap.get(nearestBlended).blendSources;
        }
      }

      const nextDepth = depth + 1;
      const nextPath = [...path, childId];

      affectedMap.set(childId, {
        batchId: childId,
        depth: nextDepth,
        isBlended,
        blendSources,
        path: nextPath,
      });

      queue.push({
        batchId: childId,
        depth: nextDepth,
        path: nextPath,
      });
    }
  }

  // Đưa cả lô gốc vào danh sách nếu muốn kiểm tra tổng thể
  const allAffectedIds = [rootId, ...affectedMap.keys()];

  // 3. Batch query chi tiết thông tin tất cả các lô bị ảnh hưởng
  const placeholders = allAffectedIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT
        b.id,
        b.batch_code,
        b.batch_code AS code,
        b.product_id,
        p.name AS product_name,
        p.unit AS product_unit,
        b.organization_id,
        o.name AS organization_name,
        o.type AS organization_type,
        b.location_id,
        l.code AS location_code,
        l.name AS location_name,
        l.address AS location_address,
        coalesce(b.current_location, l.name, 'Kho trung tâm') AS current_location,
        b.remaining_quantity,
        b.consumed_quantity,
        b.initial_quantity,
        b.status,
        b.temperature_c,
        b.cold_chain_alert,
        b.created_at,
        b.updated_at
      FROM batches b
      INNER JOIN products p ON p.id = b.product_id
      INNER JOIN organizations o ON o.id = b.organization_id
      LEFT JOIN locations l ON l.id = b.location_id
      WHERE b.id IN (${placeholders})
      ORDER BY b.id ASC`,
    )
    .all(...allAffectedIds);

  const rootBatchInfo = rows.find((r) => r.id === rootId);
  const descendantBatches = rows
    .filter((r) => r.id !== rootId)
    .map((r) => {
      const meta = affectedMap.get(r.id) || {};
      return {
        ...r,
        depth: meta.depth || 1,
        is_blended: Boolean(meta.isBlended),
        blend_sources: meta.blendSources || [],
        lineage_path: meta.path || [],
      };
    });

  return {
    rootBatch: rootBatchInfo,
    descendants: descendantBatches,
    totalAffected: descendantBatches.length + (rootBatchInfo ? 1 : 0),
    cycleDetected,
    blendedCount: descendantBatches.filter((d) => d.is_blended).length,
  };
}
