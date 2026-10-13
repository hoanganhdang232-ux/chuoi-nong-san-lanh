import { Router } from "express";
import { getDb } from "../db/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  createEventLog,
  getBatchWithEvents,
} from "../services/batchService.js";
import { randomBytes } from "node:crypto";

const router = Router();
router.use(authenticateToken);

function buildBatchCode() {
  return `BATCH-${randomBytes(5).toString("hex").toUpperCase()}`;
}

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
  if (!farm) {
    return res
      .status(404)
      .json({ message: "Không tìm thấy trang trại của tổ chức." });
  }

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

  res
    .status(201)
    .json({
      id: result.lastInsertRowid,
      name: String(name).trim(),
      area_ha: area,
    });
});

router.put("/land-plots/:id", requireRole("farm_admin"), (req, res) => {
  const { name, areaHa, latitude, longitude } = req.body || {};
  const area = Number(areaHa);
  const plotId = Number(req.params.id);

  if (!name || !Number.isFinite(area) || area <= 0) {
    return res
      .status(400)
      .json({ message: "Tên thửa và diện tích hợp lệ là bắt buộc." });
  }

  const db = getDb();
  // Check if plot belongs to user's org
  const plot = db
    .prepare(
      "SELECT lp.id FROM land_plots lp INNER JOIN farms f ON f.id = lp.farm_id WHERE lp.id = ? AND f.organization_id = ?"
    )
    .get(plotId, req.user.organization_id);

  if (!plot) {
    return res.status(404).json({ message: "Không tìm thấy thửa đất hoặc không có quyền truy cập." });
  }

  db.prepare(
    "UPDATE land_plots SET name = ?, area_ha = ?, latitude = ?, longitude = ? WHERE id = ?"
  ).run(
    String(name).trim(),
    area,
    Number(latitude) || null,
    Number(longitude) || null,
    plotId
  );

  res.json({ message: "Cập nhật thửa đất thành công." });
});

router.delete("/land-plots/:id", requireRole("farm_admin"), (req, res) => {
  const plotId = Number(req.params.id);
  const db = getDb();
  
  const plot = db
    .prepare(
      "SELECT lp.id FROM land_plots lp INNER JOIN farms f ON f.id = lp.farm_id WHERE lp.id = ? AND f.organization_id = ?"
    )
    .get(plotId, req.user.organization_id);

  if (!plot) {
    return res.status(404).json({ message: "Không tìm thấy thửa đất hoặc không có quyền truy cập." });
  }

  // Optional: check if plot is used in batches
  db.prepare("SELECT id FROM batches WHERE current_location LIKE ? LIMIT 1").get(`%${plot.name}%`);
  // Note: normally there would be a foreign key or better check, but we'll do a simple check.
  // Actually batches don't explicitly store land_plot_id, they store source_farm_id. 
  // Let's just delete it directly since event_logs has the stringified name anyway.
  
  try {
    db.prepare("DELETE FROM land_plots WHERE id = ?").run(plotId);
    res.json({ message: "Xóa thửa đất thành công." });
  } catch {
    res.status(400).json({ message: "Không thể xóa thửa đất này vì đã có dữ liệu ràng buộc." });
  }
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
      `SELECT lp.*, f.organization_id FROM land_plots lp INNER JOIN farms f ON f.id = lp.farm_id WHERE lp.id = ? AND f.organization_id = ?`,
    )
    .get(Number(landPlotId), req.user.organization_id);
  if (!plot) {
    return res
      .status(404)
      .json({
        message: "Thửa đất không hợp lệ hoặc không thuộc tổ chức của bạn.",
      });
  }

  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND organization_id = ?")
    .get(Number(productId), req.user.organization_id);
  if (!product) {
    return res
      .status(400)
      .json({ message: "Sản phẩm không tồn tại trong tổ chức." });
  }

  const batchCode = buildBatchCode();
  const batch = db
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
    batchId: batch.lastInsertRowid,
    eventType: "batch_harvested",
    actorId: req.user.id,
    data: {
      product_id: product.id,
      product_name: product.name,
      land_plot_id: plot.id,
      land_plot_name: plot.name,
      quantity_kg: quantity,
      harvested_at: harvestDate.toISOString(),
      source_farm_id: plot.farm_id,
    },
    timestamp: harvestDate.toISOString(),
  });

  const batchWithEvents = getBatchWithEvents(
    batch.lastInsertRowid,
    req.user.organization_id,
    false,
  );
  return res.status(201).json({
    message: "Tạo lô thu hoạch thành công.",
    batch: batchWithEvents,
    events: batchWithEvents.events,
    event,
  });
});

export default router;
