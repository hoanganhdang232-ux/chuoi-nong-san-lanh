import { Router } from "express";
import { getDb } from "../db/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { createEventLog, parseBatchIds } from "../services/batchService.js";
import { traceDownstreamDescendants } from "../services/lineageService.js";

const router = Router();

// SCRUM-169: Allowed roles for initiating recalls: farm_admin, system_admin, auditor
const recallAdminRoles = ["farm_admin", "system_admin", "auditor"];

// SCRUM-171: Allowed roles for viewing recall inventory items and breakdowns: distributor_admin, farm_admin, auditor, system_admin
const recallViewRoles = ["distributor_admin", "farm_admin", "auditor", "system_admin"];

// SCRUM-170: Allowed roles for forward downstream traceability: auditor, system_admin
const auditorAndAdminRoles = ["auditor", "system_admin"];

/**
 * Helper: Find all affected batches (root batch and its forward descendants across splits/merges/transfers)
 */
export function findAffectedBatches(db, rootBatchId) {
  const root = db.prepare("SELECT * FROM batches WHERE id = ?").get(rootBatchId);
  if (!root) return [];

  // Query relations from batch_relations and batch_lineage
  const allRelations = db
    .prepare(
      `SELECT parent_batch_id, child_batch_id FROM batch_relations
       UNION
       SELECT parent_batch_id, child_batch_id FROM batch_lineage`,
    )
    .all();

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
      const list = childrenOf.get(pid);
      if (!list.includes(b.id)) {
        list.push(b.id);
      }
    }
  }

  const visitedIds = new Set([rootBatchId]);
  const affectedIds = [rootBatchId];
  const queue = [rootBatchId];

  while (queue.length > 0) {
    const currId = queue.shift();
    const children = childrenOf.get(currId) || [];
    for (const childId of children) {
      if (!visitedIds.has(childId)) {
        visitedIds.add(childId);
        affectedIds.push(childId);
        queue.push(childId);
      }
    }
  }

  const placeholders = affectedIds.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT b.*, o.name AS organization_name,
              COALESCE(l.address, l.name, b.current_location, o.address, 'Chưa xác định') AS location_address
       FROM batches b
       LEFT JOIN organizations o ON o.id = b.organization_id
       LEFT JOIN locations l ON l.id = b.location_id
       WHERE b.id IN (${placeholders})
       ORDER BY b.id ASC`,
    )
    .all(...affectedIds);
}

/**
 * Core Handler: Mark batch with issue and initiate recall order (SCRUM-169)
 * POST /api/v1/recalls OR POST /api/v1/batches/:id/recall
 */
export async function handleInitiateRecallOrder(req, res) {
  const rootBatchIdFromBody = req.body?.rootBatchId ?? req.body?.root_batch_id;
  const rawBatchId = req.params?.id ?? req.body?.batch_id ?? req.body?.batchId ?? rootBatchIdFromBody;
  const reason = req.body?.reason;

  // 1. Validate reason (required)
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return res.status(400).json({
      message: "Thiếu thông tin lý do thu hồi.",
    });
  }

  // 1b. If rootBatchId is explicitly provided (Sprint 5 format)
  if (req.body?.rootBatchId !== undefined) {
    if (reason.trim().length < 20) {
      return res.status(400).json({
        message: "Lý do thu hồi phải có ít nhất 20 ký tự.",
      });
    }
    try {
      const { createRecall } = await import("../services/sprint5RecallService.js");
      const recall = createRecall({
        rootBatchId: Number(req.body.rootBatchId),
        reason: reason.trim(),
        actorId: req.user.id,
        organizationId: req.user.organization_id,
        userRole: req.user.role,
      });
      return res.status(201).json({
        message: "Kích hoạt lệnh thu hồi thành công.",
        recall,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  }

  // 2. Validate batch_id
  if (rawBatchId === undefined || rawBatchId === null || rawBatchId === "") {
    return res.status(400).json({
      message: "Mã định danh lô hàng (batch_id) là bắt buộc.",
    });
  }

  const batchId = Number(rawBatchId);
  if (!Number.isSafeInteger(batchId) || batchId <= 0) {
    return res.status(400).json({
      message: "Mã định danh lô hàng (batch_id) không hợp lệ.",
    });
  }

  const db = getDb();

  // 3. Check batch existence
  const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
  if (!batch) {
    return res.status(404).json({
      message: "Không tìm thấy lô hàng.",
    });
  }

  // 4. Check if batch is already recalled or invalid for recall
  const currentStatus = String(batch.status).toLowerCase();
  const invalidStatuses = ["recalling", "recalled", "cancelled"];
  if (invalidStatuses.includes(currentStatus)) {
    return res.status(400).json({
      message: `Lô hàng đã ở trạng thái '${batch.status}', không thể mở lại lệnh thu hồi.`,
    });
  }

  // 5. Execute transaction:
  // - Update batch status to 'recalling'
  // - Create record in recall_orders
  // - Find all affected batches and insert into recall_items
  // - Append audit event log 'RECALL_INITIATED' to the immutable hash chain
  let createdRecallOrder;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "UPDATE batches SET status = 'recalling', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(batchId);

    const insertResult = db
      .prepare(
        `INSERT INTO recall_orders (batch_id, reason, status, created_by, created_at)
         VALUES (?, ?, 'opened', ?, CURRENT_TIMESTAMP)`,
      )
      .run(batchId, reason.trim(), req.user.id);

    createdRecallOrder = db
      .prepare("SELECT * FROM recall_orders WHERE id = ?")
      .get(insertResult.lastInsertRowid);

    // Populate affected batches into recall_items
    const affectedBatches = findAffectedBatches(db, batchId);
    const insertItem = db.prepare(
      `INSERT OR REPLACE INTO recall_items (
        recall_id, batch_id, organization_id, current_location, remaining_quantity, consumed_quantity
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    );

    for (const b of affectedBatches) {
      const rem = Number(b.remaining_quantity || 0);
      let cons = 0;
      if (b.consumed_quantity !== undefined && b.consumed_quantity !== null && Number(b.consumed_quantity) > 0) {
        cons = Number(b.consumed_quantity);
      } else {
        cons = Math.max(0, Number(b.initial_quantity || 0) - rem);
      }
      insertItem.run(
        createdRecallOrder.id,
        b.id,
        b.organization_id,
        b.location_address || b.current_location || "",
        rem,
        cons,
      );
    }

    // Ghi vết nhật ký hệ thống (Audit Event Log) với Hash Chain
    createEventLog({
      batchId,
      eventType: "RECALL_INITIATED",
      actorId: req.user.id,
      data: {
        recall_order_id: createdRecallOrder.id,
        reason: reason.trim(),
        previous_status: batch.status,
        new_status: "recalling",
        status: "opened",
        created_at: createdRecallOrder.created_at,
        affected_batches_count: affectedBatches.length,
      },
    });

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failure if transaction was not active
    }
    console.error("Lỗi khi mở lệnh thu hồi:", error);
    return res.status(500).json({
      message: "Đã xảy ra lỗi máy chủ khi mở lệnh thu hồi.",
    });
  }

  const updatedBatch = db
    .prepare("SELECT id, batch_code, status, updated_at FROM batches WHERE id = ?")
    .get(batchId);

  return res.status(201).json({
    message: "Đã đánh dấu sự cố và mở lệnh thu hồi thành công.",
    recall_order: createdRecallOrder,
    batch: updatedBatch,
  });
}

/**
 * SCRUM-171 Core Handler: Detailed list of batches to recall by location and inventory breakdown
 * GET /api/v1/recalls/:recall_id/items OR GET /api/v1/distributor/recalls/:id/inventory-breakdown
 */
export async function handleGetRecallItems(req, res) {
  const rawRecallId = req.params?.recall_id ?? req.params?.id;
  const recallId = Number(rawRecallId);

  if (!Number.isSafeInteger(recallId) || recallId <= 0) {
    return res.status(400).json({ message: "ID lệnh thu hồi không hợp lệ." });
  }

  const db = getDb();

  // 1. Check if recall exists in recall_orders, recall_cases, or recalls
  const recallOrder = db.prepare("SELECT * FROM recall_orders WHERE id = ?").get(recallId);
  const recallCase = db.prepare("SELECT * FROM recall_cases WHERE id = ?").get(recallId);
  const recallV5 = db.prepare("SELECT * FROM recalls WHERE id = ?").get(recallId);

  if (!recallOrder && !recallCase && !recallV5) {
    return res.status(404).json({ message: "Không tìm thấy lệnh thu hồi." });
  }

  // 2. Query items from recall_items joined with batches, organizations, locations
  let existingItems = db
    .prepare(
      `SELECT
        ri.batch_id,
        b.batch_code,
        o.name AS organization_name,
        COALESCE(l.address, l.name, b.current_location, ri.current_location, o.address, 'Chưa xác định') AS location_address,
        b.status,
        ri.remaining_quantity,
        ri.consumed_quantity,
        b.initial_quantity,
        b.remaining_quantity AS batch_remaining_quantity,
        b.consumed_quantity AS batch_consumed_quantity
      FROM recall_items ri
      INNER JOIN batches b ON b.id = ri.batch_id
      LEFT JOIN organizations o ON o.id = COALESCE(ri.organization_id, b.organization_id)
      LEFT JOIN locations l ON l.id = b.location_id
      WHERE ri.recall_id = ?
      ORDER BY b.id ASC`,
    )
    .all(recallId);

  // If recall_items has no rows, dynamically find affected batches from root batch and populate
  if (existingItems.length === 0) {
    const rootBatchId = recallOrder?.batch_id ?? recallCase?.root_batch_id;
    if (rootBatchId) {
      const affected = findAffectedBatches(db, rootBatchId);
      const insertItem = db.prepare(
        `INSERT OR REPLACE INTO recall_items (
          recall_id, batch_id, organization_id, current_location, remaining_quantity, consumed_quantity
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      );

      for (const b of affected) {
        const rem = Number(b.remaining_quantity || 0);
        let cons = 0;
        if (b.consumed_quantity !== undefined && b.consumed_quantity !== null && Number(b.consumed_quantity) > 0) {
          cons = Number(b.consumed_quantity);
        } else {
          cons = Math.max(0, Number(b.initial_quantity || 0) - rem);
        }
        insertItem.run(
          recallId,
          b.id,
          b.organization_id,
          b.location_address || b.current_location || "",
          rem,
          cons,
        );
      }

      existingItems = db
        .prepare(
          `SELECT
            ri.batch_id,
            b.batch_code,
            o.name AS organization_name,
            COALESCE(l.address, l.name, b.current_location, ri.current_location, o.address, 'Chưa xác định') AS location_address,
            b.status,
            ri.remaining_quantity,
            ri.consumed_quantity,
            b.initial_quantity,
            b.remaining_quantity AS batch_remaining_quantity,
            b.consumed_quantity AS batch_consumed_quantity
          FROM recall_items ri
          INNER JOIN batches b ON b.id = ri.batch_id
          LEFT JOIN organizations o ON o.id = COALESCE(ri.organization_id, b.organization_id)
          LEFT JOIN locations l ON l.id = b.location_id
          WHERE ri.recall_id = ?
          ORDER BY b.id ASC`,
        )
        .all(recallId);
    }
  }

  // 3. Format response items with calculated remaining and consumed quantities
  const items = existingItems.map((item) => {
    const remainingQuantity = Number(item.remaining_quantity ?? item.batch_remaining_quantity ?? 0);
    let consumedQuantity = 0;
    if (item.consumed_quantity !== undefined && item.consumed_quantity !== null && Number(item.consumed_quantity) > 0) {
      consumedQuantity = Number(item.consumed_quantity);
    } else if (item.batch_consumed_quantity !== undefined && item.batch_consumed_quantity !== null && Number(item.batch_consumed_quantity) > 0) {
      consumedQuantity = Number(item.batch_consumed_quantity);
    } else if (item.initial_quantity !== undefined && item.initial_quantity !== null) {
      consumedQuantity = Math.max(0, Number(item.initial_quantity) - remainingQuantity);
    }

    return {
      batch_id: item.batch_id,
      batch_code: item.batch_code,
      organization_name: item.organization_name || "Chưa xác định",
      location_address: item.location_address || "Chưa xác định",
      status: item.status,
      remaining_quantity: Math.round(remainingQuantity * 100) / 100,
      consumed_quantity: Math.round(consumedQuantity * 100) / 100,
    };
  });

  // 4. Calculate Summary Aggregation
  const totalBatches = items.length;
  const totalRecallableQuantity = Math.round(
    items.reduce((sum, item) => sum + item.remaining_quantity, 0) * 100,
  ) / 100;
  const totalConsumedQuantity = Math.round(
    items.reduce((sum, item) => sum + item.consumed_quantity, 0) * 100,
  ) / 100;

  return res.status(200).json({
    recall_id: recallId,
    summary: {
      total_batches: totalBatches,
      total_recallable_quantity: totalRecallableQuantity,
      total_consumed_quantity: totalConsumedQuantity,
    },
    items,
  });
}

// POST /api/v1/recalls
router.post(
  "/recalls",
  authenticateToken,
  requireRole(...recallAdminRoles),
  handleInitiateRecallOrder,
);

// POST /api/v1/batches/:id/recall
router.post(
  "/batches/:id/recall",
  authenticateToken,
  requireRole(...recallAdminRoles),
  handleInitiateRecallOrder,
);

// SCRUM-171: GET /api/v1/recalls/:recall_id/items
router.get(
  "/recalls/:recall_id/items",
  authenticateToken,
  requireRole(...recallViewRoles),
  handleGetRecallItems,
);

// SCRUM-171: GET /api/v1/recalls/:id/inventory-breakdown
router.get(
  "/recalls/:id/inventory-breakdown",
  authenticateToken,
  requireRole(...recallViewRoles),
  handleGetRecallItems,
);

// SCRUM-171: GET /api/v1/distributor/recalls/:id/inventory-breakdown
router.get(
  "/distributor/recalls/:id/inventory-breakdown",
  authenticateToken,
  requireRole(...recallViewRoles),
  handleGetRecallItems,
);

// SCRUM-170: GET /api/v1/recalls/:recall_id/descendant-lots
router.get(
  "/recalls/:recall_id/descendant-lots",
  authenticateToken,
  requireRole(...auditorAndAdminRoles),
  handleGetRecallDescendants,
);

// SCRUM-170: GET /api/v1/recalls/:id/trace-downstream
router.get(
  "/recalls/:id/trace-downstream",
  authenticateToken,
  requireRole(...auditorAndAdminRoles),
  handleGetRecallDescendants,
);

// SCRUM-170: GET /api/v1/batches/:id/trace-downstream
router.get(
  "/batches/:id/trace-downstream",
  authenticateToken,
  requireRole(...auditorAndAdminRoles),
  handleGetBatchDownstream,
);

// GET /api/v1/recalls (List recall orders)
router.get(
  "/recalls",
  authenticateToken,
  requireRole(...recallAdminRoles, "processor_admin", "distributor_admin"),
  (req, res) => {
    const db = getDb();
    const batchId = req.query.batch_id ? Number(req.query.batch_id) : null;

    let query = `
      SELECT ro.*, b.batch_code, p.name AS product_name, u.name AS creator_name
      FROM recall_orders ro
      INNER JOIN batches b ON b.id = ro.batch_id
      INNER JOIN products p ON p.id = b.product_id
      LEFT JOIN users u ON u.id = ro.created_by
    `;
    const params = [];

    if (batchId) {
      query += " WHERE ro.batch_id = ?";
      params.push(batchId);
    }

    query += " ORDER BY ro.created_at DESC";

    const orders = db.prepare(query).all(...params);
    return res.json(orders);
  },
);

// GET /api/v1/recalls/:id
router.get("/recalls/:id", authenticateToken, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ message: "ID lệnh thu hồi không hợp lệ." });
  }

  const order = db
    .prepare(
      `
      SELECT ro.*, b.batch_code, b.status AS batch_status, p.name AS product_name, u.name AS creator_name
      FROM recall_orders ro
      INNER JOIN batches b ON b.id = ro.batch_id
      INNER JOIN products p ON p.id = b.product_id
      LEFT JOIN users u ON u.id = ro.created_by
      WHERE ro.id = ?
    `,
    )
    .get(id);

  if (!order) {
    return res.status(404).json({ message: "Không tìm thấy lệnh thu hồi." });
  }

  return res.json(order);
});

/**
 * SCRUM-170 Handler: Trace and list all descendant lots born from an incident lot via recall order
 * GET /api/v1/recalls/:recall_id/descendant-lots
 */
export async function handleGetRecallDescendants(req, res) {
  const rawRecallId = req.params?.recall_id ?? req.params?.id;
  const recallId = Number(rawRecallId);

  if (!Number.isSafeInteger(recallId) || recallId <= 0) {
    return res.status(400).json({ message: "ID lệnh thu hồi không hợp lệ." });
  }

  const db = getDb();
  const recallOrder = db.prepare("SELECT * FROM recall_orders WHERE id = ?").get(recallId);
  const recallCase = db.prepare("SELECT * FROM recall_cases WHERE id = ?").get(recallId);
  const recallV5 = db.prepare("SELECT * FROM recalls WHERE id = ?").get(recallId);

  if (!recallOrder && !recallCase && !recallV5) {
    return res.status(404).json({ message: "Không tìm thấy lệnh thu hồi." });
  }

  const rootBatchId = recallOrder?.batch_id ?? recallCase?.root_batch_id ?? recallV5?.root_batch_id;
  const result = traceDownstreamDescendants(rootBatchId);

  if (!result) {
    return res.status(404).json({ message: "Không tìm thấy lô gốc." });
  }

  return res.status(200).json(result);
}

/**
 * SCRUM-170 Handler: Trace and list all descendant lots born directly from batch ID
 * GET /api/v1/batches/:id/trace-downstream
 */
export async function handleGetBatchDownstream(req, res) {
  const rawBatchId = req.params?.id ?? req.params?.batch_id;
  const batchId = Number(rawBatchId);

  if (!Number.isSafeInteger(batchId) || batchId <= 0) {
    return res.status(400).json({ message: "Mã định danh lô hàng không hợp lệ." });
  }

  const result = traceDownstreamDescendants(batchId);

  if (!result) {
    return res.status(404).json({ message: "Không tìm thấy lô gốc." });
  }

  return res.status(200).json(result);
}

export default router;
