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
import { batchController } from "../controllers/batchController.js";
import { parseCsv } from "../utils/csv.js";

const router = Router();
const organizationAdminRoles = [
  "farm_admin",
  "processor_admin",
  "distributor_admin",
];

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

router.get("/activity", (req, res) => {
  const db = getDb();
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const isAuditor = req.user.role === "auditor";
  const rows = db.prepare(
    `SELECT e.id, e.batch_id, b.batch_code, p.name AS product_name,
       e.event_type, e.data_json, e.previous_hash, e.current_hash, e.timestamp,
       u.name AS actor_name
     FROM event_logs e
     INNER JOIN batches b ON b.id = e.batch_id
     INNER JOIN products p ON p.id = b.product_id
     LEFT JOIN users u ON u.id = e.actor_id
     WHERE ${isAuditor ? "1 = 1" : "b.organization_id = ? AND (u.id IS NULL OR u.organization_id = ?)"}
     ORDER BY e.timestamp DESC, e.id DESC
     LIMIT ?`,
  ).all(...(isAuditor ? [limit] : [req.user.organization_id, req.user.organization_id, limit]));
  return res.json(rows);
});

router.post("/harvest", requireRole("farm_admin"), (req, res) => {
  const { landPlotId, productId, quantityKg, harvestedAt } = req.body || {};
  const landPlotIdValue = Number(landPlotId);
  const productIdValue = Number(productId);
  const quantity = Number(quantityKg);
  const harvestDate =
    typeof harvestedAt === "string" && harvestedAt.trim()
      ? new Date(harvestedAt)
      : null;

  if (
    !["number", "string"].includes(typeof landPlotId) ||
    (typeof landPlotId === "string" &&
      !/^\d+$/.test(landPlotId.trim())) ||
    !Number.isSafeInteger(landPlotIdValue) ||
    landPlotIdValue <= 0 ||
    !["number", "string"].includes(typeof productId) ||
    (typeof productId === "string" && !/^\d+$/.test(productId.trim())) ||
    !Number.isSafeInteger(productIdValue) ||
    productIdValue <= 0 ||
    !["number", "string"].includes(typeof quantityKg) ||
    (typeof quantityKg === "string" && !quantityKg.trim()) ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return res
      .status(400)
      .json({
        message:
          "Mã thửa, mã sản phẩm và khối lượng thu hoạch hợp lệ là bắt buộc.",
      });
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
    .get(landPlotIdValue, req.user.organization_id);
  if (!plot) {
    return res
      .status(404)
      .json({ message: "Thửa đất không hợp lệ hoặc không thuộc tổ chức." });
  }

  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND organization_id = ?")
    .get(productIdValue, req.user.organization_id);
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

router.post(
  "/import-csv",
  requireRole("farm_admin", "processor_admin", "distributor_admin"),
  (req, res) => {
    let rows;
    try {
      rows = parseCsv(req.body?.csvText);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    if (!rows.length) {
      return res.status(400).json({ message: "CSV cần header và ít nhất một dòng dữ liệu." });
    }
    if (rows.length > 500) {
      return res.status(400).json({ message: "Mỗi lần chỉ nhập tối đa 500 lô." });
    }

    const requiredHeaders = ["productId", "quantityKg"];
    const headers = Object.keys(rows[0]);
    if (requiredHeaders.some((header) => !headers.includes(header))) {
      return res.status(400).json({
        message: "CSV cần có cột productId, quantityKg; có thể thêm batchCode, currentLocation, harvestedAt.",
      });
    }

    const db = getDb();
    const normalized = [];
    const errors = [];
    const seenCodes = new Set();
    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      const productId = Number(row.productId);
      const quantity = Number(row.quantityKg);
      const batchCode = row.batchCode?.trim() || null;
      const location = row.currentLocation?.trim() || "Chưa cập nhật";
      const harvestedAt = row.harvestedAt?.trim()
        ? new Date(row.harvestedAt.trim())
        : new Date();
      if (!Number.isSafeInteger(productId) || productId <= 0) errors.push(`Dòng ${line}: productId không hợp lệ.`);
      if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`Dòng ${line}: quantityKg phải lớn hơn 0.`);
      if (Number.isNaN(harvestedAt.getTime()) || harvestedAt > new Date()) errors.push(`Dòng ${line}: harvestedAt không hợp lệ hoặc ở tương lai.`);
      if (location.length > 160) errors.push(`Dòng ${line}: currentLocation tối đa 160 ký tự.`);
      if (batchCode && (batchCode.length > 80 || !/^[A-Za-z0-9._-]+$/.test(batchCode))) errors.push(`Dòng ${line}: batchCode chỉ được gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới (tối đa 80 ký tự).`);
      if (batchCode && seenCodes.has(batchCode)) errors.push(`Dòng ${line}: batchCode bị trùng trong file.`);
      if (batchCode) seenCodes.add(batchCode);
      normalized.push({ productId, quantity, batchCode, location, harvestedAt });
    }
    for (const [index, item] of normalized.entries()) {
      if (!Number.isSafeInteger(item.productId) || item.productId <= 0) continue;
      const product = db.prepare("SELECT id FROM products WHERE id = ? AND organization_id = ?")
        .get(item.productId, req.user.organization_id);
      if (!product) errors.push(`Dòng ${index + 2}: sản phẩm không tồn tại trong tổ chức.`);
      if (item.batchCode && db.prepare("SELECT id FROM batches WHERE batch_code = ?").get(item.batchCode)) {
        errors.push(`Dòng ${index + 2}: batchCode đã tồn tại.`);
      }
    }
    if (errors.length) return res.status(400).json({ message: "CSV có dữ liệu không hợp lệ.", errors });

    const created = [];
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of normalized) {
        const batchCode = item.batchCode || `BATCH-${randomBytes(5).toString("hex").toUpperCase()}`;
        const result = db.prepare(
          `INSERT INTO batches(batch_code, product_id, organization_id, initial_quantity,
             remaining_quantity, current_location, status)
           VALUES (?, ?, ?, ?, ?, ?, 'registered')`,
        ).run(batchCode, item.productId, req.user.organization_id, item.quantity, item.quantity, item.location);
        const batchId = Number(result.lastInsertRowid);
        createEventLog({
          batchId,
          eventType: "batch_imported",
          actorId: req.user.id,
          data: {
            source: "csv_import",
            product_id: item.productId,
            quantity_kg: item.quantity,
            current_location: item.location,
            imported_harvested_at: item.harvestedAt.toISOString(),
          },
          timestamp: item.harvestedAt.toISOString(),
        });
        created.push({ id: batchId, batch_code: batchCode });
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      return res.status(400).json({ message: `Không thể nhập CSV: ${error.message}` });
    }
    return res.status(201).json({ createdCount: created.length, batches: created });
  },
);

router.get("/products", (req, res) => {
  const rows = getDb()
    .prepare(
      "SELECT * FROM products WHERE organization_id = ? ORDER BY id DESC",
    )
    .all(req.user.organization_id);
  res.json(rows);
});

router.post("/products", requireRole(...organizationAdminRoles), (req, res) => {
  const name = String(req.body?.name || "").trim();
  const unit = String(req.body?.unit || "").trim();
  if (!name || !unit) {
    return res.status(400).json({ message: "Tên sản phẩm và đơn vị tính là bắt buộc." });
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM products WHERE organization_id = ? AND LOWER(name) = LOWER(?)")
    .get(req.user.organization_id, name);
  if (existing) {
    return res.status(409).json({ message: "Sản phẩm này đã tồn tại trong tổ chức." });
  }
  const result = db
    .prepare("INSERT INTO products(organization_id, name, unit) VALUES (?, ?, ?)")
    .run(req.user.organization_id, name, unit);
  return res.status(201).json({ id: result.lastInsertRowid, organization_id: req.user.organization_id, name, unit });
});

router.put("/products/:id", requireRole(...organizationAdminRoles), (req, res) => {
  const productId = Number(req.params.id);
  const name = String(req.body?.name || "").trim();
  const unit = String(req.body?.unit || "").trim();
  if (!Number.isInteger(productId) || productId <= 0 || !name || !unit) {
    return res.status(400).json({ message: "Sản phẩm và đơn vị tính hợp lệ là bắt buộc." });
  }
  const db = getDb();
  const product = db
    .prepare("SELECT id FROM products WHERE id = ? AND organization_id = ?")
    .get(productId, req.user.organization_id);
  if (!product) return res.status(404).json({ message: "Không tìm thấy sản phẩm." });
  const duplicate = db
    .prepare("SELECT id FROM products WHERE organization_id = ? AND LOWER(name) = LOWER(?) AND id <> ?")
    .get(req.user.organization_id, name, productId);
  if (duplicate) return res.status(409).json({ message: "Sản phẩm này đã tồn tại trong tổ chức." });
  db.prepare("UPDATE products SET name = ?, unit = ? WHERE id = ?").run(name, unit, productId);
  return res.json({ id: productId, organization_id: req.user.organization_id, name, unit });
});

router.get("/land-plots", (req, res) => {
  const farm = getDb()
    .prepare("SELECT id FROM farms WHERE organization_id = ? LIMIT 1")
    .get(req.user.organization_id);

  if (farm && req.user.role === "farm_admin") {
    const rows = getDb()
      .prepare(
        `SELECT lp.*, f.name AS farm_name
         FROM land_plots lp
         INNER JOIN farms f ON f.id = lp.farm_id
         WHERE f.organization_id = ?
         ORDER BY lp.id DESC`,
      )
      .all(req.user.organization_id);
    return res.json(rows);
  }

  const rows = getDb()
    .prepare(
      `SELECT lp.*, f.name AS farm_name
       FROM land_plots lp
       INNER JOIN farms f ON f.id = lp.farm_id
       ORDER BY lp.id DESC`,
    )
    .all();
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
      `SELECT bt.*, b.batch_code, b.remaining_quantity, b.initial_quantity,
         p.name AS product_name, p.unit AS product_unit,
         o_from.name AS from_organization_name, o_to.name AS to_organization_name,
         u.name AS requester_name,
         CASE WHEN bt.status = 'pending' AND bt.created_at <= datetime('now', '-48 hours') THEN 1 ELSE 0 END AS is_overdue
       FROM batch_transfers bt
       INNER JOIN batches b ON b.id = bt.batch_id
       LEFT JOIN products p ON p.id = b.product_id
       LEFT JOIN users u ON u.id = bt.requester_id
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
  (req, res) => batchController.splitBatch(req, res),
);

router.post(
  "/merge",
  requireRole("farm_admin", "processor_admin", "distributor_admin"),
  (req, res) => batchController.mergeBatches(req, res),
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

router.put("/land-plots/:id", requireRole("farm_admin"), (req, res) => {
  const plotId = Number(req.params.id);
  const name = String(req.body?.name || "").trim();
  const area = Number(req.body?.areaHa);
  if (!Number.isInteger(plotId) || plotId <= 0 || !name || !Number.isFinite(area) || area <= 0) {
    return res.status(400).json({ message: "Tên thửa và diện tích hợp lệ là bắt buộc." });
  }
  const db = getDb();
  const plot = db
    .prepare(
      `SELECT lp.id FROM land_plots lp
       INNER JOIN farms f ON f.id = lp.farm_id
       WHERE lp.id = ? AND f.organization_id = ?`,
    )
    .get(plotId, req.user.organization_id);
  if (!plot) return res.status(404).json({ message: "Không tìm thấy thửa đất." });
  db.prepare("UPDATE land_plots SET name = ?, area_ha = ?, latitude = ?, longitude = ? WHERE id = ?").run(
    name,
    area,
    Number(req.body?.latitude) || null,
    Number(req.body?.longitude) || null,
    plotId,
  );
  return res.json({ id: plotId, name, area_ha: area });
});

router.get("/:id/summary", (req, res) => {
  const db = getDb();
  const batchId = Number(req.params.id);
  const batch = db.prepare(
    `SELECT b.*, p.name AS product_name, p.unit AS product_unit, o.name AS organization_name,
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
  const storedRelations = db.prepare(
    `SELECT r.relation_type, r.quantity, r.parent_batch_id, r.child_batch_id,
       p.batch_code AS parent_batch_code, c.batch_code AS child_batch_code
     FROM batch_relations r
     INNER JOIN batches p ON p.id = r.parent_batch_id
     INNER JOIN batches c ON c.id = r.child_batch_id
     WHERE (r.parent_batch_id = ? OR r.child_batch_id = ?)
       AND (? = 1 OR (p.organization_id = ? AND c.organization_id = ?))`,
  ).all(batchId, batchId, req.user.role === "auditor" ? 1 : 0, req.user.organization_id, req.user.organization_id);
  const allBatches = db.prepare("SELECT * FROM batches ORDER BY id ASC").all();
  const byId = new Map(allBatches.map((item) => [item.id, item]));
  const relationByPair = new Map(
    storedRelations.map((relation) => [
      `${relation.parent_batch_id}:${relation.child_batch_id}`,
      relation,
    ]),
  );
  const addRelation = (parentId, childId, relationType = "lineage") => {
    const parent = byId.get(parentId);
    const child = byId.get(childId);
    if (!parent || !child) return;
    if (
      req.user.role !== "auditor" &&
      childId !== batchId &&
      child.organization_id !== req.user.organization_id
    ) return;
    const key = `${parentId}:${childId}`;
    if (relationByPair.has(key)) return;
    relationByPair.set(key, {
      parent_batch_id: parentId,
      child_batch_id: childId,
      parent_batch_code: parent.batch_code,
      child_batch_code: child.batch_code,
      relation_type: relationType,
      quantity: child.initial_quantity,
    });
  };

  for (const parentId of [batch.parent_batch_id, ...parseBatchIds(batch.source_batch_ids)].filter(Boolean)) {
    addRelation(parentId, batchId);
  }
  for (const child of allBatches) {
    if (
      child.parent_batch_id === batchId ||
      parseBatchIds(child.source_batch_ids).includes(batchId)
    ) {
      addRelation(batchId, child.id);
    }
  }
  const relations = [...relationByPair.values()];
  return res.json({
    ...batch,
    parentRelations: relations.filter((relation) => relation.child_batch_id === batchId),
    childRelations: relations.filter((relation) => relation.parent_batch_id === batchId),
  });
});

router.get("/:id/integrity", authenticateToken, (req, res) =>
  batchController.verifyIntegrity(req, res),
);

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
      const recipientOrgId = Number(
        req.body?.toOrganizationId ??
        req.body?.recipientOrgId ??
        req.body?.recipient_org_id
      );
      const request = createTransferRequest({
        batchId: Number(req.params.id),
        fromOrganizationId: req.user.organization_id,
        toOrganizationId: recipientOrgId,
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
