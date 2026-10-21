import { getDb } from "../db/database.js";
import { parseBatchIds } from "./batchService.js";

/**
 * S-26 & S-27: Duyệt đồ thị xuôi (Forward Graph Traversal - BFS) từ 1 batch_id gốc.
 * - Tìm tất cả các lô hậu duệ qua mọi tầng tách/gộp.
 * - Chống lặp vô hạn bằng visitedIds set, phát hiện cycle và ngắt ngay.
 * - Batch query toàn bộ chi tiết hậu duệ trong 1 câu SQL (tránh N+1).
 * - Trả về: code, organization_name, location_name, remaining_quantity, display_status.
 * - Nguyên tắc: Thà liệt kê thừa còn hơn bỏ sót hậu duệ.
 */
export function getForwardDescendants(rootBatchId) {
  const db = getDb();

  // 1. Gom tất cả quan hệ từ batch_relations và batch_lineage (thà thừa không sót)
  const allRelations = db
    .prepare(
      `SELECT parent_batch_id, child_batch_id, relation_type, quantity
       FROM batch_relations
       UNION
       SELECT parent_batch_id, child_batch_id, 'split' AS relation_type, quantity_transferred AS quantity
       FROM batch_lineage`,
    )
    .all();

  // Build adjacency list: parentId -> [childId, ...]
  const childrenOf = new Map();
  for (const rel of allRelations) {
    if (!childrenOf.has(rel.parent_batch_id)) {
      childrenOf.set(rel.parent_batch_id, []);
    }
    const list = childrenOf.get(rel.parent_batch_id);
    if (!list.includes(rel.child_batch_id)) {
      list.push(rel.child_batch_id);
    }
  }

  // Bổ sung thêm quan hệ trực tiếp từ bảng batches (parent_batch_id, source_batch_ids)
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
      const list = childrenOf.get(pid);
      if (!list.includes(b.id)) {
        list.push(b.id);
      }
    }
  }

  // 2. BFS với visitedIds để chống lặp vô hạn & phát hiện cycle
  const visitedIds = new Set();
  const descendantIds = [];
  let cycleDetected = false;

  const queue = [rootBatchId];
  visitedIds.add(rootBatchId);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = childrenOf.get(currentId) || [];

    for (const childId of children) {
      if (visitedIds.has(childId)) {
        // Phát hiện chu trình (cycle) - ngắt nhánh này ngay lập tức để chống lặp vô hạn
        cycleDetected = true;
        continue;
      }
      visitedIds.add(childId);
      descendantIds.push(childId);
      queue.push(childId);
    }
  }

  if (descendantIds.length === 0) {
    return { descendants: [], cycleDetected };
  }

  // 3. Batch query chi tiết tất cả hậu duệ trong 1 câu SQL duy nhất (chống N+1)
  const placeholders = descendantIds.map(() => "?").join(", ");
  const batchDetails = db
    .prepare(
      `SELECT
        b.id,
        b.batch_code,
        b.batch_code AS code,
        b.product_id,
        b.organization_id,
        b.location_id,
        b.remaining_quantity,
        b.consumed_quantity,
        b.status,
        b.current_location,
        b.created_at,
        o.name AS organization_name,
        COALESCE(l.name, b.current_location, 'Chưa xác định') AS location_name,
        l.address AS location_address,
        p.name AS product_name,
        p.unit AS product_unit
      FROM batches b
      INNER JOIN organizations o ON o.id = b.organization_id
      INNER JOIN products p ON p.id = b.product_id
      LEFT JOIN locations l ON l.id = b.location_id
      WHERE b.id IN (${placeholders})`,
    )
    .all(...descendantIds);

  // Giữ đúng thứ tự BFS
  const detailsMap = new Map(batchDetails.map((b) => [b.id, b]));
  const orderedDescendants = descendantIds
    .map((id) => detailsMap.get(id))
    .filter(Boolean)
    .map((batch) => {
      const isConsumed =
        Number(batch.remaining_quantity) === 0 ||
        String(batch.status).toLowerCase() === "consumed";
      return {
        ...batch,
        display_status: isConsumed ? "Đã tiêu thụ" : batch.status,
        status: isConsumed ? "consumed" : batch.status,
      };
    });

  return { descendants: orderedDescendants, cycleDetected };
}

/**
 * Lấy tổ tiên (Ancestors) của một batch.
 * BFS ngược: child -> parents -> grandparents...
 */
export function getAncestors(batchId) {
  const db = getDb();

  const allRelations = db
    .prepare(
      `SELECT parent_batch_id, child_batch_id
       FROM batch_relations
       UNION
       SELECT parent_batch_id, child_batch_id
       FROM batch_lineage`,
    )
    .all();

  const parentsOf = new Map();
  for (const rel of allRelations) {
    if (!parentsOf.has(rel.child_batch_id)) {
      parentsOf.set(rel.child_batch_id, []);
    }
    const list = parentsOf.get(rel.child_batch_id);
    if (!list.includes(rel.parent_batch_id)) {
      list.push(rel.parent_batch_id);
    }
  }

  // Thêm quan hệ từ batches table
  const batchesWithParents = db
    .prepare(
      "SELECT id, parent_batch_id, source_batch_ids FROM batches WHERE parent_batch_id IS NOT NULL OR (source_batch_ids IS NOT NULL AND source_batch_ids != '[]')",
    )
    .all();

  for (const b of batchesWithParents) {
    const parentIds = [b.parent_batch_id, ...parseBatchIds(b.source_batch_ids)].filter(Boolean);
    if (!parentsOf.has(b.id)) {
      parentsOf.set(b.id, []);
    }
    const list = parentsOf.get(b.id);
    for (const pid of parentIds) {
      if (!list.includes(pid)) {
        list.push(pid);
      }
    }
  }

  const visitedIds = new Set();
  const ancestorIds = [];
  let cycleDetected = false;

  const queue = [batchId];
  visitedIds.add(batchId);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const parents = parentsOf.get(currentId) || [];

    for (const parentId of parents) {
      if (visitedIds.has(parentId)) {
        cycleDetected = true;
        continue;
      }
      visitedIds.add(parentId);
      ancestorIds.push(parentId);
      queue.push(parentId);
    }
  }

  if (ancestorIds.length === 0) {
    return { ancestors: [], cycleDetected };
  }

  const placeholders = ancestorIds.map(() => "?").join(", ");
  const batchDetails = db
    .prepare(
      `SELECT
        b.id,
        b.batch_code,
        b.batch_code AS code,
        b.organization_id,
        b.remaining_quantity,
        b.status,
        b.current_location,
        o.name AS organization_name,
        COALESCE(l.name, b.current_location, 'Chưa xác định') AS location_name,
        p.name AS product_name
      FROM batches b
      INNER JOIN organizations o ON o.id = b.organization_id
      INNER JOIN products p ON p.id = b.product_id
      LEFT JOIN locations l ON l.id = b.location_id
      WHERE b.id IN (${placeholders})`,
    )
    .all(...ancestorIds);

  const detailsMap = new Map(batchDetails.map((b) => [b.id, b]));
  const orderedAncestors = ancestorIds
    .map((id) => detailsMap.get(id))
    .filter(Boolean)
    .map((batch) => {
      const isConsumed =
        Number(batch.remaining_quantity) === 0 ||
        String(batch.status).toLowerCase() === "consumed";
      return {
        ...batch,
        display_status: isConsumed ? "Đã tiêu thụ" : batch.status,
        status: isConsumed ? "consumed" : batch.status,
      };
    });

  return { ancestors: orderedAncestors, cycleDetected };
}

/**
 * S-28: Xây dựng cấu trúc Graph/Tree JSON chuẩn (nodes, edges) cho Frontend (Cytoscape / Vis.js / React Flow).
 * - Center: lô hiện tại
 * - Left: các lô tổ tiên (ancestors)
 * - Right: các lô hậu duệ (descendants)
 * - has_children & expanded để hỗ trợ thu gọn/mở rộng từng nhánh.
 */
export function buildLineageGraph(batchId) {
  const db = getDb();

  const centerBatch = db
    .prepare(
      `SELECT b.id, b.batch_code, b.batch_code AS code, b.remaining_quantity, b.status,
              b.organization_id, b.location_id, b.current_location,
              o.name AS organization_name, p.name AS product_name, p.unit AS product_unit,
              COALESCE(l.name, b.current_location, 'Chưa xác định') AS location_name,
              l.address AS location_address
       FROM batches b
       INNER JOIN organizations o ON o.id = b.organization_id
       INNER JOIN products p ON p.id = b.product_id
       LEFT JOIN locations l ON l.id = b.location_id
       WHERE b.id = ?`,
    )
    .get(batchId);

  if (!centerBatch) return null;

  const { ancestors, cycleDetected: ancestorCycle } = getAncestors(batchId);
  const { descendants, cycleDetected: descendantCycle } = getForwardDescendants(batchId);
  const cycleDetected = ancestorCycle || descendantCycle;

  const allNodeIds = [
    ...ancestors.map((a) => a.id),
    batchId,
    ...descendants.map((d) => d.id),
  ];

  const placeholders = allNodeIds.map(() => "?").join(", ");
  const allRelations =
    allNodeIds.length > 0
      ? db
          .prepare(
            `SELECT parent_batch_id, child_batch_id, relation_type, quantity
             FROM batch_relations
             WHERE parent_batch_id IN (${placeholders}) AND child_batch_id IN (${placeholders})
             UNION
             SELECT parent_batch_id, child_batch_id, 'split' AS relation_type, quantity_transferred AS quantity
             FROM batch_lineage
             WHERE parent_batch_id IN (${placeholders}) AND child_batch_id IN (${placeholders})`,
          )
          .all(...allNodeIds, ...allNodeIds, ...allNodeIds, ...allNodeIds)
      : [];

  // Map xem mỗi node có con nào không
  const hasChildrenMap = new Map();
  for (const rel of allRelations) {
    hasChildrenMap.set(rel.parent_batch_id, true);
  }

  const nodes = [];

  // Ancestors (bên trái)
  for (const ancestor of ancestors) {
    nodes.push({
      id: String(ancestor.id),
      label: ancestor.batch_code,
      type: "ancestor",
      position: "left",
      data: {
        batch_code: ancestor.batch_code,
        code: ancestor.batch_code,
        organization_name: ancestor.organization_name,
        location_name: ancestor.location_name,
        remaining_quantity: ancestor.remaining_quantity,
        status: ancestor.status,
        display_status: ancestor.display_status,
        has_children: true,
      },
      expanded: true,
    });
  }

  // Current batch (ở giữa)
  const isCenterConsumed =
    Number(centerBatch.remaining_quantity) === 0 ||
    String(centerBatch.status).toLowerCase() === "consumed";

  nodes.push({
    id: String(centerBatch.id),
    label: centerBatch.batch_code,
    type: "current",
    position: "center",
    data: {
      batch_code: centerBatch.batch_code,
      code: centerBatch.batch_code,
      organization_name: centerBatch.organization_name,
      product_name: centerBatch.product_name,
      location_name: centerBatch.location_name,
      location_address: centerBatch.location_address,
      remaining_quantity: centerBatch.remaining_quantity,
      status: isCenterConsumed ? "consumed" : centerBatch.status,
      display_status: isCenterConsumed ? "Đã tiêu thụ" : centerBatch.status,
      has_children: descendants.length > 0,
    },
    expanded: true,
  });

  // Descendants (bên phải)
  for (const descendant of descendants) {
    nodes.push({
      id: String(descendant.id),
      label: descendant.batch_code,
      type: "descendant",
      position: "right",
      data: {
        batch_code: descendant.batch_code,
        code: descendant.batch_code,
        organization_name: descendant.organization_name,
        location_name: descendant.location_name,
        remaining_quantity: descendant.remaining_quantity,
        status: descendant.status,
        display_status: descendant.display_status,
        has_children: hasChildrenMap.get(descendant.id) || false,
      },
      expanded: false,
    });
  }

  const nodeIdSet = new Set(allNodeIds.map(String));
  const seenEdges = new Set();
  const edges = [];

  for (const rel of allRelations) {
    const sourceStr = String(rel.parent_batch_id);
    const targetStr = String(rel.child_batch_id);
    const edgeKey = `${sourceStr}->${targetStr}`;
    if (!seenEdges.has(edgeKey) && nodeIdSet.has(sourceStr) && nodeIdSet.has(targetStr)) {
      seenEdges.add(edgeKey);
      edges.push({
        id: `e-${sourceStr}-${targetStr}`,
        source: sourceStr,
        target: targetStr,
        label: rel.relation_type,
        data: {
          relation_type: rel.relation_type,
          quantity: rel.quantity,
        },
      });
    }
  }

  return {
    nodes,
    edges,
    cycleDetected,
    summary: {
      total_ancestors: ancestors.length,
      total_descendants: descendants.length,
      center_batch_id: batchId,
    },
  };
}

/**
 * SCRUM-170: Trace and list all descendant lots born from an incident lot (Forward Traceability)
 * Traverses all tiers across organizations and detects merged lots.
 */
export function traceDownstreamDescendants(rootBatchId) {
  const db = getDb();
  const rootId = Number(rootBatchId);

  const rootBatch = db.prepare("SELECT * FROM batches WHERE id = ?").get(rootId);
  if (!rootBatch) return null;

  // 1. Get all relations from batch_relations and batch_lineage
  const allRelations = db
    .prepare(
      `SELECT parent_batch_id, child_batch_id, relation_type, quantity
       FROM batch_relations
       UNION
       SELECT parent_batch_id, child_batch_id, 'split' AS relation_type, quantity_transferred AS quantity
       FROM batch_lineage`,
    )
    .all();

  const childrenOf = new Map();
  const parentsOf = new Map();

  for (const rel of allRelations) {
    if (!childrenOf.has(rel.parent_batch_id)) {
      childrenOf.set(rel.parent_batch_id, []);
    }
    const cList = childrenOf.get(rel.parent_batch_id);
    if (!cList.includes(rel.child_batch_id)) {
      cList.push(rel.child_batch_id);
    }

    if (!parentsOf.has(rel.child_batch_id)) {
      parentsOf.set(rel.child_batch_id, []);
    }
    const pList = parentsOf.get(rel.child_batch_id);
    if (!pList.includes(rel.parent_batch_id)) {
      pList.push(rel.parent_batch_id);
    }
  }

  // Also include candidate batches with parent_batch_id or source_batch_ids
  const candidateBatches = db
    .prepare("SELECT id, parent_batch_id, source_batch_ids FROM batches")
    .all();

  for (const b of candidateBatches) {
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
      if (!pList.includes(pid)) {
        pList.push(pid);
      }
    }
  }

  // 2. BFS traversal starting from rootId, tracking depth_level
  const visitedIds = new Set([rootId]);
  const queue = [{ id: rootId, depth: 0 }];
  const descendantMap = new Map();

  while (queue.length > 0) {
    const { id: currentId, depth } = queue.shift();
    const children = childrenOf.get(currentId) || [];

    for (const childId of children) {
      if (!visitedIds.has(childId)) {
        visitedIds.add(childId);
        const childDepth = depth + 1;
        descendantMap.set(childId, childDepth);
        queue.push({ id: childId, depth: childDepth });
      }
    }
  }

  const descendantIds = Array.from(descendantMap.keys());
  if (descendantIds.length === 0) {
    return {
      root_batch_id: rootId,
      total_descendants: 0,
      descendants: [],
    };
  }

  // 3. Batch query descendant details joined with organization and location
  const placeholders = descendantIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT
        b.id,
        b.batch_code,
        b.organization_id,
        o.name AS organization_name,
        COALESCE(l.address, l.name, b.current_location, o.address, 'Chưa xác định') AS location_address,
        b.remaining_quantity,
        b.consumed_quantity,
        b.status,
        b.source_batch_ids
       FROM batches b
       LEFT JOIN organizations o ON o.id = b.organization_id
       LEFT JOIN locations l ON l.id = b.location_id
       WHERE b.id IN (${placeholders})
       ORDER BY b.id ASC`,
    )
    .all(...descendantIds);

  const rowMap = new Map(rows.map((r) => [r.id, r]));

  // Keep BFS order
  const descendants = [];
  for (const childId of descendantIds) {
    const b = rowMap.get(childId);
    if (!b) continue;

    const depthLevel = descendantMap.get(childId) || 1;
    const directParents = parentsOf.get(childId) || [];
    const sourceIds = parseBatchIds(b.source_batch_ids);
    const allParentIds = Array.from(new Set([...directParents, ...sourceIds]));

    const isMerged = allParentIds.length > 1;

    descendants.push({
      batch_id: b.id,
      batch_code: b.batch_code,
      organization_id: b.organization_id,
      organization_name: b.organization_name || "",
      location_address: b.location_address || "",
      remaining_quantity: Number(b.remaining_quantity || 0),
      consumed_quantity: Number(b.consumed_quantity || 0),
      status: b.status,
      depth_level: depthLevel,
      is_merged: isMerged,
      merged_source_batch_ids: isMerged ? allParentIds : directParents,
      warning: isMerged ? "Cảnh báo: Lô gộp từ nhiều nguồn (nguy cơ lây nhiễm chéo cao)" : null,
    });
  }

  return {
    root_batch_id: rootId,
    total_descendants: descendants.length,
    descendants,
  };
}
