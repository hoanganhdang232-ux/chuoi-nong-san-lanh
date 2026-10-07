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
} from "../services/batchService.js";
import {
  createTransferRequest,
  decideTransfer,
} from "../services/transferService.js";
import { GENESIS_HASH, generateEventHash, sha256 } from "../utils/hash.js";

const router = Router();

router.use(authenticateToken);

router.get("/", (req, res) => {
  const db = getDb();
  const query =
    req.user.role === "auditor"
      ? `SELECT b.*, p.name AS product_name, o.name AS organization_name
       FROM batches b
       INNER JOIN products p ON p.id = b.product_id
       INNER JOIN organizations o ON o.id = b.organization_id`
      : `SELECT b.*, p.name AS product_name, o.name AS organization_name
       FROM batches b
       INNER JOIN products p ON p.id = b.product_id
       INNER JOIN organizations o ON o.id = b.organization_id
       WHERE b.organization_id = ?`;

  const rows =
    req.user.role === "auditor"
      ? db.prepare(query).all()
      : db.prepare(query).all(req.user.organization_id);
  res.json(rows);
});

router.post("/harvest", requireRole("farm_admin"), (req, res) => {
  const { landPlotId, productId, quantityKg, harvestedAt } = req.body || {};
  const quantity = Number(quantityKg);
  const harvestDate = harvestedAt ? new Date(harvestedAt) : null;

  if (
    !landPlotId ||
    !productId ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return res
      .status(400)
      .json({ message: "Khối lượng thu hoạch phải lớn hơn 0." });
  }
  if (
    !harvestDate ||
    Number.isNaN(harvestDate.getTime()) ||
    harvestDate > new Date()
  ) {
    return res
      .status(400)
      .json({ message: "Ngày thu hoạch không được ở tương lai." });
  }

  const db = getDb();
  const plot = db
    .prepare(
      `SELECT lp.*, f.organization_id FROM land_plots lp
       INNER JOIN farms f ON f.id = lp.farm_id
       WHERE lp.id = ? AND f.organization_id = ?`,
    )
    .get(Number(landPlotId), req.user.organization_id);
  if (!plot) {
    return res
      .status(404)
      .json({ message: "Thửa đất không hợp lệ hoặc không thuộc tổ chức." });
  }

  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND organization_id = ?")
    .get(Number(productId), req.user.organization_id);
  if (!product) {
    return res
      .status(400)
      .json({ message: "Sản phẩm không tồn tại trong tổ chức." });
  }

  const batchCode = `BATCH-${randomBytes(5).toString("hex").toUpperCase()}`;
  const batchInsert = db
    .prepare(
      `INSERT INTO batches(batch_code, product_id, organization_id, source_farm_id, initial_quantity, remaining_quantity, current_location, temperature_c, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  const event = createEventLog({
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

  const batch = getBatchWithEvents(
    batchInsert.lastInsertRowid,
    req.user.organization_id,
    false,
  );
  return res
    .status(201)
    .json({ message: "Tạo lô thu hoạch thành công.", batch, event });
});

router.get("/products", (req, res) => {
  const rows = getDb()
    .prepare(
      "SELECT * FROM products WHERE organization_id = ? ORDER BY id DESC",
    )
    .all(req.user.organization_id);
  res.json(rows);
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
      `SELECT bt.*, b.batch_code, o_from.name AS from_organization_name, o_to.name AS to_organization_name
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
    const firstProductId = sourceBatches[0].product_id;
    if (
      sourceBatches.some(
        (batch) =>
          batch.product_id !== firstProductId &&
          Number(batch.product_id) !== productId,
      )
    ) {
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

router.get("/:id/integrity", authenticateToken, (req, res) => {
  const db = getDb();
  const batchId = Number(req.params.id);
  const events = db
    .prepare("SELECT * FROM event_logs WHERE batch_id = ? ORDER BY id ASC")
    .all(batchId);

  const invalidEventIds = [];
  let previousHash = GENESIS_HASH;
  let valid = true;

  for (const event of events) {
    const expectedPreviousHash = previousHash;
    const expectedHash = generateEventHash({
      previousHash: event.previous_hash,
      batchId: event.batch_id,
      eventType: event.event_type,
      dataJson: event.data_json,
      timestamp: event.timestamp,
    });

    const expectedCurrentHash = expectedHash;
    const previousMatches = event.previous_hash === expectedPreviousHash;
    const currentMatches = event.current_hash === expectedCurrentHash;

    if (!previousMatches || !currentMatches) {
      valid = false;
      invalidEventIds.push(event.id);
    }

    previousHash = event.current_hash;
  }

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

  res.json({ valid, broken: !valid, invalidEventIds, events, batch });
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

    if (
      transfer.to_organization_id !== req.user.organization_id &&
      transfer.from_organization_id !== req.user.organization_id
    ) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xử lý yêu cầu này." });
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
