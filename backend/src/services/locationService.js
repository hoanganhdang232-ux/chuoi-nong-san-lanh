import { getDb } from "../db/database.js";
import { createEventLog } from "./batchService.js";

/**
 * T-64 / S-30: Quản lý Địa điểm/Cửa hàng nội bộ của tổ chức (NPP).
 */

export function listLocations(organizationId, { status = null, search = "" } = {}) {
  let sql = `
    SELECT l.id, l.organization_id, l.code, l.name, l.address, l.phone, l.status,
           l.created_at, l.updated_at,
           COUNT(b.id) AS batch_count,
           COALESCE(SUM(CASE WHEN b.remaining_quantity > 0 AND b.status != 'consumed' THEN b.remaining_quantity ELSE 0 END), 0) AS total_inventory
    FROM locations l
    LEFT JOIN batches b ON b.location_id = l.id
    WHERE l.organization_id = ?
  `;
  const params = [organizationId];

  if (status) {
    sql += " AND lower(l.status) = lower(?)";
    params.push(status);
  }

  if (search && String(search).trim()) {
    sql += " AND (lower(l.name) LIKE ? OR lower(l.code) LIKE ? OR lower(coalesce(l.address, '')) LIKE ?)";
    const term = `%${String(search).trim().toLowerCase()}%`;
    params.push(term, term, term);
  }

  sql += " GROUP BY l.id ORDER BY l.id DESC";

  return getDb().prepare(sql).all(...params);
}

export function getLocationById(id, organizationId) {
  const db = getDb();
  if (organizationId) {
    return db.prepare("SELECT * FROM locations WHERE id = ? AND organization_id = ?").get(id, organizationId);
  }
  return db.prepare("SELECT * FROM locations WHERE id = ?").get(id);
}

export function createLocation({ organizationId, code, name, address, phone, status }) {
  if (!name || String(name).trim().length === 0) {
    const err = new Error("Tên địa điểm/cửa hàng là bắt buộc.");
    err.statusCode = 400;
    throw err;
  }

  const db = getDb();

  // Tạo mã cửa hàng duy nhất nếu người dùng không nhập
  let storeCode = code ? String(code).trim().toUpperCase() : null;
  if (!storeCode) {
    const count = db
      .prepare("SELECT COUNT(*) AS c FROM locations WHERE organization_id = ?")
      .get(organizationId).c;
    storeCode = `CH-${String(count + 1).padStart(3, "0")}`;
    // Kiểm tra xem mã tự tạo có trùng không, nếu trùng thì cộng thêm timestamp
    const dupCheck = db.prepare("SELECT id FROM locations WHERE code = ?").get(storeCode);
    if (dupCheck) {
      storeCode = `CH-${Date.now().toString().slice(-4)}`;
    }
  } else {
    const existingCode = db.prepare("SELECT id FROM locations WHERE code = ?").get(storeCode);
    if (existingCode) {
      const err = new Error(`Mã cửa hàng '${storeCode}' đã tồn tại.`);
      err.statusCode = 400;
      throw err;
    }
  }

  const storeStatus =
    status && ["inactive", "Inactive"].includes(status) ? "Inactive" : "Active";

  const result = db
    .prepare(
      `INSERT INTO locations(organization_id, code, name, address, phone, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run(
      organizationId,
      storeCode,
      String(name).trim(),
      address ? String(address).trim() : null,
      phone ? String(phone).trim() : null,
      storeStatus,
    );

  return db.prepare("SELECT * FROM locations WHERE id = ?").get(result.lastInsertRowid);
}

export function updateLocation({ id, organizationId, code, name, address, phone, status }) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM locations WHERE id = ? AND organization_id = ?")
    .get(id, organizationId);

  if (!existing) {
    const err = new Error("Không tìm thấy địa điểm/cửa hàng.");
    err.statusCode = 404;
    throw err;
  }

  if (name !== undefined && String(name).trim().length === 0) {
    const err = new Error("Tên địa điểm/cửa hàng không được để trống.");
    err.statusCode = 400;
    throw err;
  }

  let storeCode = code !== undefined ? (code ? String(code).trim().toUpperCase() : existing.code) : existing.code;
  if (storeCode !== existing.code) {
    const dup = db.prepare("SELECT id FROM locations WHERE code = ? AND id != ?").get(storeCode, id);
    if (dup) {
      const err = new Error(`Mã cửa hàng '${storeCode}' đã được sử dụng.`);
      err.statusCode = 400;
      throw err;
    }
  }

  const storeName = name !== undefined ? String(name).trim() : existing.name;
  const storeAddress = address !== undefined ? (address ? String(address).trim() : null) : existing.address;
  const storePhone = phone !== undefined ? (phone ? String(phone).trim() : null) : existing.phone;
  const storeStatus = status !== undefined
    ? (["inactive", "Inactive"].includes(status) ? "Inactive" : "Active")
    : (existing.status || "Active");

  db.prepare(
    `UPDATE locations
     SET code = ?, name = ?, address = ?, phone = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(storeCode, storeName, storeAddress, storePhone, storeStatus, id);

  return db.prepare("SELECT * FROM locations WHERE id = ?").get(id);
}

export function deleteLocation({ id, organizationId }) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM locations WHERE id = ? AND organization_id = ?")
    .get(id, organizationId);

  if (!existing) {
    const err = new Error("Không tìm thấy địa điểm/cửa hàng.");
    err.statusCode = 404;
    throw err;
  }

  // Kiểm tra xem có lô hàng nào đang liên kết với địa điểm này không
  const batchCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM batches WHERE location_id = ?")
    .get(id).cnt;

  if (batchCount > 0) {
    const err = new Error("Không thể xóa địa điểm đang được gán cho lô hàng.");
    err.statusCode = 400;
    throw err;
  }

  // Kiểm tra xem có giao dịch điều chuyển nào liên quan không
  const transferCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM internal_batch_transfers WHERE location_id = ?")
    .get(id)?.cnt || 0;

  if (transferCount > 0) {
    // Nếu có lịch sử giao dịch thì chuyển trạng thái sang Inactive thay vì xóa cứng
    db.prepare("UPDATE locations SET status = 'Inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return { deleted: false, status: "Inactive", message: "Địa điểm đã có lịch sử điều chuyển, đã chuyển trạng thái sang Inactive." };
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
