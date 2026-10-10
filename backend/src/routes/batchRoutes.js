import { Router } from "express";
import { randomBytes } from "node:crypto";
import { getDb } from "../db/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  createEventLog,
  getBatchGenealogy,
  getBatchWithEvents,
  parseBatchIds,
  updateBatchStatus,
  verifyBatchChain,
} from "../services/batchService.js";
import {
  createTransferRequest,
  decideTransfer,
} from "../services/transferService.js";

const router = Router();

router.use(authenticateToken);

router.get("/", (req, res) => {
  const db = getDb();
  const cursor = Number.isSafeInteger(Number(req.query.cursor))
    ? Number(req.query.cursor)
    : null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const hasPagination = cursor !== null || req.query.limit || req.query.search || req.query.productId;
  const search = String(req.query.search || "").trim().toLowerCase();
  const productId = Number(req.query.productId);
  const query =
    req.user.role === "auditor"
      ? `SELECT b.*, p.name AS product_name, o.name AS organization_name
       FROM batches b
       INNER JOIN products p ON p.id = b.product_id
       INNER JOIN organizations o ON o.id = b.organization_id
       WHERE 1 = 1`
      : `SELECT b.*, p.name AS product_name, o.name AS organization_name
       FROM batches b
       INNER JOIN products p ON p.id = b.product_id
       INNER JOIN organizations o ON o.id = b.organization_id
       WHERE b.organization_id = ?`;
  const params = req.user.role === "auditor" ? [] : [req.user.organization_id];
  let filteredQuery = `${query} AND (? = '' OR lower(b.batch_code) LIKE '%' || ? || '%')`;
  params.push(search, search);
  if (Number.isSafeInteger(productId) && productId > 0) {
    filteredQuery += " AND b.product_id = ?";
    params.push(productId);
  }
  if (cursor !== null && cursor > 0) {
    filteredQuery += " AND b.id < ?";
    params.push(cursor);
  }
  filteredQuery += " ORDER BY b.id DESC";
  if (hasPagination) {
    const rows = db.prepare(`${filteredQuery} LIMIT ?`).all(...params, limit + 1);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore });
  }
  res.json(db.prepare(filteredQuery).all(...params));
});

router.post("/harvest", requireRole("farm_admin"), (req, res) => {
  const { landPlotId, productId, quantityKg, harvestedAt } = req.body || {};
  const landPlotIdValue = Number(landPlotId);
  const productIdValue = Number(productId);
  const quantity = Number(quantityKg);
  
  const db = getDb();

  // 1. Plot validation FIRST (AC3)
  if (
    !["number", "string"].includes(typeof landPlotId) ||
    !Number.isSafeInteger(landPlotIdValue) || 
    landPlotIdValue <= 0
  ) {
    return res.status(400).json({ message: "Mã thửa không hợp lệ." });
  }
  const plot = db
    .prepare(
      `SELECT lp.*, f.organization_id FROM land_plots lp
       INNER JOIN farms f ON f.id = lp.farm_id
       WHERE lp.id = ?`
    )
    .get(landPlotIdValue);

  if (!plot) {
    return res.status(404).json({ message: "Thửa đất không tồn tại." });
  }
  if (plot.organization_id !== req.user.organization_id) {
    return res.status(403).json({ 
      error_code: "PLOT_FORBIDDEN",
      message: "Thửa đất không thuộc tổ chức của bạn.",
      field: "landPlotId"
    });
  }

  // 2. Quantity validation (AC2)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({
      error_code: "QUANTITY_INVALID",
      message: "Khối lượng phải lớn hơn 0.",
      field: "quantityKg"
    });
  }

  // 3. Harvest date validation (AC1)
  const harvestDate = typeof harvestedAt === "string" && harvestedAt.trim()
      ? new Date(harvestedAt)
      : null;

  if (!harvestDate || Number.isNaN(harvestDate.getTime())) {
    return res.status(400).json({ message: "Ngày thu hoạch không hợp lệ." });
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const harvestDateLocal = new Date(harvestDate.getFullYear(), harvestDate.getMonth(), harvestDate.getDate());

  if (harvestDateLocal > todayStart) {
    return res.status(400).json({ 
      error_code: "HARVEST_DATE_IN_FUTURE",
      message: "Ngày thu hoạch không được ở tương lai.",
      field: "harvestedAt"
    });
  }

  // 4. Product validation
  if (
    !["number", "string"].includes(typeof productId) ||
    !Number.isSafeInteger(productIdValue) || 
    productIdValue <= 0
  ) {
    return res.status(400).json({ message: "Mã sản phẩm không hợp lệ." });
  }
  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND organization_id = ?")
    .get(productIdValue, req.user.organization_id);
  if (!product) {
    return res.status(400).json({ message: "Sản phẩm không tồn tại trong tổ chức." });
  }

  // 5. Idempotency (AC4 - Server side protection)
  // Prevent duplicate harvest of the same product, plot, quantity, and date within the last 10 seconds by the same org
  const recentDuplicate = db.prepare(`
    SELECT id FROM batches 
    WHERE source_farm_id = ? 
      AND product_id = ? 
      AND initial_quantity = ? 
      AND organization_id = ?
      AND created_at >= datetime('now', '-10 seconds')
  `).get(plot.farm_id, product.id, quantity, req.user.organization_id);

  if (recentDuplicate) {
    // If it's a duplicate request, return the existing batch without failing, acting idempotent
    // However, to keep it simple and fulfill "chỉ một lô được tạo", returning an error is fine too.
    // Let's just return 409 Conflict.
    return res.status(409).json({ message: "Yêu cầu tạo lô đang được xử lý hoặc đã bị trùng lặp." });
  }

  db.exec("BEGIN IMMEDIATE");
  let batchInsert;
  let event;
  try {
    const batchCode = `BATCH-${randomBytes(5).toString("hex").toUpperCase()}`;
    batchInsert = db
      .prepare(
        `INSERT INTO batches(batch_code, product_id, organization_id, source_farm_id, initial_quantity, remaining_quantity, current_location, temperature_c, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        batchCode,
        product.id,
        req.user.organization_id,
        plot.farm_id,
        quantity,
        quantity,
        `Thửa ${plot.name}`,
        9,
        "registered",
      );

    event = createEventLog({
      batchId: batchInsert.lastInsertRowid,
      eventType: "batch_harvested",
      actorId: req.user.id,
      data: {
        product_id: product.id,
        product_name: product.name,
        land_plot_id: plot.id,
        land_plot_name: plot.name,
        quantity_kg: quantity,
        harvested_at: harvestDate.toISOString(),
      },
      timestamp: harvestDate.toISOString(),
    });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const batch = getBatchWithEvents(
    batchInsert.lastInsertRowid,
    req.user.organization_id,
    false,
  );
  return res
    .status(201)
    .json({ message: "Tạo lô thu hoạch thành công.", batch, event });
});


router.get("/land-plots", requireRole("farm_admin"), (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT lp.*, f.name AS farm_name
       FROM land_plots lp
       INNER JOIN farms f ON f.id = lp.farm_id
       WHERE f.organization_id = ?
       ORDER BY lp.id DESC`,
    )
    .all(req.user.organization_id);
  res.json(rows);
});

router.post("/land-plots", requireRole("farm_admin"), (req, res) => {
  const { name, areaHa, latitude, longitude } = req.body || {};
  const area = Number(areaHa);
  if (!name || !Number.isFinite(area) || area <= 0) {
    return res
      .status(400)
      .json({ message: "Tên thửa và diện tích hợp lệ là bắt buộc." });
  }

  const farm = getDb()
    .prepare("SELECT id FROM farms WHERE organization_id = ? LIMIT 1")
    .get(req.user.organization_id);
  if (!farm)
    return res
      .status(404)
      .json({ message: "Không tìm thấy trang trại của tổ chức." });

  const result = getDb()
    .prepare(
      "INSERT INTO land_plots(farm_id, name, area_ha, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      farm.id,
      String(name).trim(),
      area,
      Number(latitude) || null,
      Number(longitude) || null,
    );

  res.status(201).json({
    id: result.lastInsertRowid,
    name: String(name).trim(),
    area_ha: area,
  });
});

router.get("/transfer-requests", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT bt.*, b.batch_code, o_from.name AS from_organization_name, o_to.name AS to_organization_name,
         CASE WHEN bt.status = 'pending' AND bt.created_at <= datetime('now', '-48 hours') THEN 1 ELSE 0 END AS is_overdue
       FROM batch_transfers bt
       INNER JOIN batches b ON b.id = bt.batch_id
       INNER JOIN organizations o_from ON o_from.id = bt.from_organization_id
       INNER JOIN organizations o_to ON o_to.id = bt.to_organization_id
       WHERE bt.from_organization_id = ? OR bt.to_organization_id = ?
       ORDER BY bt.created_at DESC`,
    )
    .all(req.user.organization_id, req.user.organization_id);
  res.json(rows);
});

router.post(
  "/:id/split",
  requireRole("farm_admin", "processor_admin", "distributor_admin"),
  (req, res) => {
    const batchId = Number(req.params.id);
    const db = getDb();
    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);

    if (!batch) {
      return res.status(404).json({ message: "Không tìm thấy lô hàng." });
    }

    if (batch.organization_id !== req.user.organization_id) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền tách lô này." });
    }

    const allocations = Array.isArray(req.body?.allocations)
      ? req.body.allocations
      : [];
    if (allocations.length === 0) {
      return res
        .status(400)
        .json({ message: "Cần ít nhất một phân bổ khối lượng cho lô con." });
    }

    const totalAllocated = allocations.reduce((sum, entry) => {
      const quantity = Number(entry?.quantity);
      return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
    }, 0);

    if (
      totalAllocated <= 0 ||
      totalAllocated > Number(batch.remaining_quantity)
    ) {
      return res.status(400).json({
        message:
          "Tổng khối lượng lô con không được vượt quá khối lượng còn lại của lô mẹ.",
      });
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      const children = [];
      const parentRootId = batch.root_batch_id || batch.id;

      for (const allocation of allocations) {
        const quantity = Number(allocation?.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("Khối lượng tách phải lớn hơn 0.");
        }

        const childCode = `BATCH-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
        const insertResult = db
          .prepare(
            `INSERT INTO batches(batch_code, product_id, organization_id, source_farm_id, parent_batch_id, root_batch_id, source_batch_ids, initial_quantity, remaining_quantity, current_location, temperature_c, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            childCode,
            batch.product_id,
            batch.organization_id,
            batch.source_farm_id,
            batch.id,
            parentRootId,
            JSON.stringify([batch.id]),
            quantity,
            quantity,
            allocation?.location || batch.current_location,
            batch.temperature_c,
            batch.status,
          );

        const childBatch = db
          .prepare("SELECT * FROM batches WHERE id = ?")
          .get(insertResult.lastInsertRowid);

        db.prepare(
          `INSERT OR IGNORE INTO batch_relations(parent_batch_id, child_batch_id, relation_type, quantity)
           VALUES (?, ?, 'split', ?)`,
        ).run(batch.id, childBatch.id, quantity);

        createEventLog({
          batchId: batch.id,
          eventType: "batch_split",
          actorId: req.user.id,
          data: {
            split_from_batch_id: batch.id,
            new_child_batch_id: childBatch.id,
            quantity,
            location: allocation?.location || batch.current_location,
          },
        });

        createEventLog({
          batchId: childBatch.id,
          eventType: "batch_split_child",
          actorId: req.user.id,
          data: {
            parent_batch_id: batch.id,
            source_batch_id: batch.id,
            quantity,
            location: allocation?.location || batch.current_location,
          },
        });

        children.push({
          ...childBatch,
          source_batch_ids: JSON.parse(childBatch.source_batch_ids || "[]"),
        });
      }

      db.prepare(
        "UPDATE batches SET remaining_quantity = remaining_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(totalAllocated, batch.id);

      createEventLog({
        batchId: batch.id,
        eventType: "batch_split_parent",
        actorId: req.user.id,
        data: {
          split_total_quantity: totalAllocated,
          child_batch_ids: children.map((item) => item.id),
        },
      });

      db.exec("COMMIT");

      const parentBatch = getBatchWithEvents(
        batchId,
        req.user.organization_id,
        false,
      );
      return res.json({
        message: "Đã tách lô hàng thành công.",
        parentBatch,
        children,
      });
    } catch (error) {
      db.exec("ROLLBACK");
      return res
        .status(400)
        .json({ message: error.message || "Không thể tách lô hàng." });
    }
  },
);

router.post(
  "/merge",
  requireRole("farm_admin", "processor_admin", "distributor_admin"),
  (req, res) => {
    const db = getDb();
    const batchIds = Array.isArray(req.body?.batchIds)
      ? [
          ...new Set(
            req.body.batchIds.map(Number).filter((id) => Number.isFinite(id)),
          ),
        ]
      : [];

    if (batchIds.length < 2) {
      return res.status(400).json({ message: "Cần ít nhất 2 lô hàng để gộp." });
    }

    const sourceBatches = db
      .prepare(
        `SELECT * FROM batches WHERE id IN (${batchIds.map(() => "?").join(", ")})`,
      )
      .all(...batchIds);

    if (sourceBatches.length !== batchIds.length) {
      return res
        .status(404)
        .json({ message: "Một hoặc nhiều lô hàng không tồn tại." });
    }

    if (
      sourceBatches.some(
        (batch) => batch.organization_id !== req.user.organization_id,
      )
    ) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền gộp các lô hàng này." });
    }

    const productId = Number(
      req.body?.productId ?? sourceBatches[0].product_id,
    );
    const product = db
      .prepare("SELECT id FROM products WHERE id = ? AND organization_id = ?")
      .get(productId, req.user.organization_id);
    if (!product) {
      return res.status(400).json({
        message: "Sản phẩm gộp phải thuộc tổ chức của bạn.",
      });
    }
    if (sourceBatches.some((batch) => batch.product_id !== productId)) {
      return res
        .status(400)
        .json({ message: "Các lô hàng cần cùng loại sản phẩm để gộp." });
    }

    const totalQuantity = sourceBatches.reduce(
      (sum, batch) => sum + Number(batch.remaining_quantity || 0),
      0,
    );

    if (totalQuantity <= 0) {
      return res
        .status(400)
        .json({ message: "Tổng khối lượng gộp phải lớn hơn 0." });
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      const rootBatchId = sourceBatches[0].root_batch_id || sourceBatches[0].id;
      const newBatchCode = `BATCH-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
      const mergeInsert = db
        .prepare(
          `INSERT INTO batches(batch_code, product_id, organization_id, source_farm_id, parent_batch_id, root_batch_id, source_batch_ids, initial_quantity, remaining_quantity, current_location, temperature_c, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          newBatchCode,
          productId,
          req.user.organization_id,
          sourceBatches[0].source_farm_id,
          null,
          rootBatchId,
          JSON.stringify(batchIds),
          totalQuantity,
          totalQuantity,
          req.body?.currentLocation || sourceBatches[0].current_location,
          Number(req.body?.temperatureC ?? sourceBatches[0].temperature_c ?? 9),
          "registered",
        );

      const newBatchId = mergeInsert.lastInsertRowid;

      for (const batch of sourceBatches) {
        db.prepare(
          `INSERT OR IGNORE INTO batch_relations(parent_batch_id, child_batch_id, relation_type, quantity)
           VALUES (?, ?, 'merge', ?)`,
        ).run(batch.id, newBatchId, Number(batch.remaining_quantity || 0));
      }

      for (const batch of sourceBatches) {
        db.prepare(
          "UPDATE batches SET remaining_quantity = 0, status = 'processed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(batch.id);

        createEventLog({
          batchId: batch.id,
          eventType: "batch_merged_out",
          actorId: req.user.id,
          data: {
            merged_into_batch_id: newBatchId,
            quantity: Number(batch.remaining_quantity || 0),
          },
        });
      }

      createEventLog({
        batchId: newBatchId,
        eventType: "batch_merged",
        actorId: req.user.id,
        data: {
          source_batch_ids: batchIds,
          total_quantity: totalQuantity,
          note: req.body?.note || "",
        },
      });

      db.exec("COMMIT");

      const newBatch = getBatchWithEvents(
        newBatchId,
        req.user.organization_id,
        false,
      );
      return res.json({
        message: "Đã gộp lô hàng thành công.",
        newBatch: {
          ...newBatch,
          source_batch_ids: parseBatchIds(newBatch.source_batch_ids),
        },
      });
    } catch (error) {
      db.exec("ROLLBACK");
      return res
        .status(400)
        .json({ message: error.message || "Không thể gộp lô hàng." });
    }
  },
);

router.get("/:id/genealogy", authenticateToken, (req, res) => {
  const batchId = Number(req.params.id);
  const db = getDb();
  const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);

  if (!batch) {
    return res.status(404).json({ message: "Không tìm thấy lô hàng." });
  }

  if (
    req.user.role !== "auditor" &&
    batch.organization_id !== req.user.organization_id
  ) {
    return res
      .status(403)
      .json({ message: "Bạn không có quyền xem phả hệ lô hàng này." });
  }

  const genealogy = getBatchGenealogy(
    batchId,
    req.user.organization_id,
    req.user.role === "auditor",
  );
  return res.json(genealogy);
});

router.get("/:id/summary", (req, res) => {
  const db = getDb();
  const batchId = Number(req.params.id);
  const batch = db.prepare(
    `SELECT b.*, p.name AS product_name, o.name AS organization_name,
       f.name AS farm_name, (SELECT COUNT(*) FROM event_logs e WHERE e.batch_id = b.id) AS events_count
     FROM batches b
     INNER JOIN products p ON p.id = b.product_id
     INNER JOIN organizations o ON o.id = b.organization_id
     LEFT JOIN farms f ON f.id = b.source_farm_id
     WHERE b.id = ?`,
  ).get(batchId);
  if (!batch || (req.user.role !== "auditor" && batch.organization_id !== req.user.organization_id)) {
    return res.status(404).json({ message: "Không tìm thấy lô hàng." });
  }
  const relations = db.prepare(
    `SELECT r.relation_type, r.quantity, r.parent_batch_id, r.child_batch_id,
       p.batch_code AS parent_batch_code, c.batch_code AS child_batch_code
     FROM batch_relations r
     INNER JOIN batches p ON p.id = r.parent_batch_id
     INNER JOIN batches c ON c.id = r.child_batch_id
     WHERE r.parent_batch_id = ? OR r.child_batch_id = ?`,
  ).all(batchId, batchId);
  return res.json({ ...batch, parentRelations: relations.filter((r) => r.child_batch_id === batchId), childRelations: relations.filter((r) => r.parent_batch_id === batchId) });
});

router.get("/:id/integrity", authenticateToken, (req, res) => {
  const db = getDb();
  const batchId = Number(req.params.id);
  const batch = db
    .prepare(
      "SELECT id, batch_code, status, organization_id FROM batches WHERE id = ?",
    )
    .get(batchId);
  if (
    !batch ||
    (req.user.role !== "auditor" &&
      batch.organization_id !== req.user.organization_id)
  ) {
    return res.status(404).json({ message: "Không tìm thấy lô hàng." });
  }

  const integrity = verifyBatchChain(batchId);
  res.json({
    ...integrity,
    broken: !integrity.is_valid,
    batch,
  });
});

router.get("/:id", (req, res) => {
  const batch = getBatchWithEvents(
    Number(req.params.id),
    req.user.organization_id,
    req.user.role === "auditor",
  );
  if (!batch) {
    return res.status(404).json({ message: "Không tìm thấy lô hàng." });
  }
  res.json(batch);
});

router.post(
  "/:id/status",
  requireRole("farm_admin", "processor_admin", "distributor_admin", "auditor"),
  (req, res) => {
    const batchId = Number(req.params.id);
    const { status, current_location, temperature_c } = req.body || {};
    try {
      const result = updateBatchStatus({
        batchId,
        status,
        actorId: req.user.id,
        data: { current_location, temperature_c },
        organizationId: req.user.organization_id,
        isAuditor: req.user.role === "auditor",
      });
      return res.status(201).json({
        message: "Cập nhật trạng thái lô hàng thành công.",
        ...result,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },
);

router.post(
  "/:id/temperature-check",
  requireRole("farm_admin", "processor_admin", "distributor_admin", "auditor"),
  (req, res) => {
    const db = getDb();
    const batch = db
      .prepare("SELECT * FROM batches WHERE id = ?")
      .get(Number(req.params.id));
    if (
      !batch ||
      (req.user.role !== "auditor" &&
        batch.organization_id !== req.user.organization_id)
    ) {
      return res.status(404).json({ message: "Không tìm thấy lô hàng." });
    }

    const temperature = Number(req.body?.temperature_c ?? batch.temperature_c);
    const safeTemperature = Number.isFinite(temperature) ? temperature : null;
    const violation = safeTemperature !== null && safeTemperature < 2;

    if (violation) {
      db.prepare(
        "UPDATE batches SET status = ?, temperature_c = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run("recalled", safeTemperature, batch.id);
    }

    const result = createEventLog({
      batchId: batch.id,
      eventType: violation ? "temperature_violation" : "temperature_check",
      actorId: req.user.id,
      data: {
        recorded_temperature_c: safeTemperature,
        safe_threshold_c: 2,
        violation_detected: violation,
      },
    });

    res.json({
      batchId: batch.id,
      temperature_c: safeTemperature,
      violationDetected: violation,
      ...result,
    });
  },
);

router.post(
  "/:id/transfer-requests",
  requireRole("farm_admin", "processor_admin", "distributor_admin", "user"),
  (req, res) => {
    try {
      const request = createTransferRequest({
        batchId: Number(req.params.id),
        fromOrganizationId: req.user.organization_id,
        toOrganizationId: Number(req.body?.toOrganizationId),
        requesterId: req.user.id,
        note: req.body?.note,
      });
      return res
        .status(201)
        .json({ message: "Đã tạo yêu cầu bàn giao.", ...request });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },
);

router.post(
  "/transfer-requests/:id/decision",
  requireRole("farm_admin", "processor_admin", "distributor_admin"),
  (req, res) => {
    const transferId = Number(req.params.id);
    const db = getDb();
    const transfer = db
      .prepare("SELECT * FROM batch_transfers WHERE id = ?")
      .get(transferId);

    if (!transfer) {
      return res
        .status(404)
        .json({ message: "Yêu cầu bàn giao không tồn tại." });
    }

    if (transfer.to_organization_id !== req.user.organization_id) {
      return res
        .status(403)
        .json({
          message: "Chỉ tổ chức nhận lô hàng mới được xử lý yêu cầu này.",
        });
    }

    try {
      const result = decideTransfer({
        transferId,
        actorOrganizationId: req.user.organization_id,
        decision: req.body?.decision,
        reason: req.body?.reason,
        actorId: req.user.id,
      });
      return res.json({ message: "Đã xử lý yêu cầu bàn giao.", ...result });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },
);
export default router;
