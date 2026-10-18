import { getDb } from "../db/database.js";
import { createEventLog } from "./batchService.js";

/**
 * S-30: Quản lý Địa điểm/Cửa hàng nội bộ của tổ chức.
 */

export function listLocations(organizationId) {
  return getDb()
    .prepare(
      `SELECT l.id, l.organization_id, l.name, l.address, l.created_at,
              COUNT(b.id) AS batch_count,
              COALESCE(SUM(CASE WHEN b.remaining_quantity > 0 AND b.status != 'consumed' THEN b.remaining_quantity ELSE 0 END), 0) AS total_inventory
       FROM locations l
       LEFT JOIN batches b ON b.location_id = l.id
       WHERE l.organization_id = ?
       GROUP BY l.id
       ORDER BY l.id DESC`,
    )
    .all(organizationId);
}

export function createLocation({ organizationId, name, address }) {
  if (!name || String(name).trim().length === 0) {
    const err = new Error("Tên địa điểm là bắt buộc.");
    err.statusCode = 400;
    throw err;
  }
  const result = getDb()
    .prepare(
      "INSERT INTO locations(organization_id, name, address) VALUES (?, ?, ?)",
    )
    .run(organizationId, String(name).trim(), address ? String(address).trim() : null);

  return getDb()
    .prepare("SELECT * FROM locations WHERE id = ?")
    .get(result.lastInsertRowid);
}

export function updateLocation({ id, organizationId, name, address }) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM locations WHERE id = ? AND organization_id = ?")
    .get(id, organizationId);
  if (!existing) {
    const err = new Error("Không tìm thấy địa điểm.");
    err.statusCode = 404;
    throw err;
  }
  if (!name || String(name).trim().length === 0) {
    const err = new Error("Tên địa điểm là bắt buộc.");
    err.statusCode = 400;
    throw err;
  }
  db.prepare(
    "UPDATE locations SET name = ?, address = ? WHERE id = ?",
  ).run(String(name).trim(), address ? String(address).trim() : null, id);

  return db.prepare("SELECT * FROM locations WHERE id = ?").get(id);
}

export function deleteLocation({ id, organizationId }) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM locations WHERE id = ? AND organization_id = ?")
    .get(id, organizationId);
  if (!existing) {
    const err = new Error("Không tìm thấy địa điểm.");
    err.statusCode = 404;
    throw err;
  }

  // Kiểm tra xem có batch nào đang liên kết với địa điểm này không
  const batchCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM batches WHERE location_id = ?")
    .get(id).cnt;
  if (batchCount > 0) {
    const err = new Error("Không thể xóa địa điểm đang được gán cho lô hàng.");
    err.statusCode = 400;
    throw err;
  }

  db.prepare("DELETE FROM locations WHERE id = ?").run(id);
  return { deleted: true, id };
}

/**
 * Gán lô hàng về một địa điểm cụ thể (nội bộ cùng tổ chức).
 * Ghi sự kiện LOCATION_ASSIGNED vào chuỗi hash (E-04).
 */
export function assignBatchToLocation({ batchId, locationId, actorId, organizationId }) {
  const db = getDb();

  const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
  if (!batch) {
    const err = new Error("Lô hàng không tồn tại.");
    err.statusCode = 404;
    throw err;
  }
  if (batch.organization_id !== organizationId) {
    const err = new Error("Lô hàng không thuộc quyền quản lý của tổ chức bạn.");
    err.statusCode = 403;
    throw err;
  }

  const location = db
    .prepare("SELECT * FROM locations WHERE id = ? AND organization_id = ?")
    .get(locationId, organizationId);
  if (!location) {
    const err = new Error("Địa điểm không hợp lệ hoặc không thuộc tổ chức.");
    err.statusCode = 400;
    throw err;
  }

  const previousLocationId = batch.location_id;

  db.prepare(
    "UPDATE batches SET location_id = ?, current_location = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(locationId, location.name, batchId);

  const event = createEventLog({
    batchId,
    eventType: "location_assigned",
    actorId,
    data: {
      action: "LOCATION_ASSIGNED",
      previous_location_id: previousLocationId,
      new_location_id: locationId,
      new_location_name: location.name,
      new_location_address: location.address,
      assigned_at: new Date().toISOString(),
    },
  });

  const updatedBatch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
  return { batch: updatedBatch, location, event };
}
