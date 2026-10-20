import { getDb } from "../db/database.js";
import { createEventLog } from "./batchService.js";

/**
 * T-64 / S-30: Quản lý Địa điểm/Cửa hàng nội bộ của tổ chức (NPP).
 */

const PHONE_REGEX = /^[0-9+\-\s().]{7,20}$/;

export function listLocations(
  organizationId,
  {
    status = null,
    type = null,
    search = "",
    page = null,
    pageSize = null,
    limit = null,
    offset = null,
    withPagination = false,
  } = {},
) {
  const db = getDb();
  let baseSql = `
    FROM locations l
    LEFT JOIN batches b ON b.location_id = l.id
    WHERE l.organization_id = ?
  `;
  const params = [organizationId];

  if (status && String(status).trim() && status !== "all") {
    baseSql += " AND upper(trim(l.status)) = upper(trim(?))";
    params.push(String(status).trim());
  }

  if (type && String(type).trim() && type !== "all") {
    baseSql += " AND upper(trim(l.type)) = upper(trim(?))";
    params.push(String(type).trim());
  }

  if (search && String(search).trim()) {
    baseSql += " AND (lower(l.name) LIKE ? OR lower(l.code) LIKE ? OR lower(coalesce(l.address, '')) LIKE ? OR lower(coalesce(l.phone, '')) LIKE ?)";
    const term = `%${String(search).trim().toLowerCase()}%`;
    params.push(term, term, term, term);
  }

  // Đếm tổng số lượng nếu có yêu cầu phân trang
  let paginationMeta = null;
  const isPaging = page !== null || pageSize !== null || withPagination;
  if (isPaging) {
    const countSql = `SELECT COUNT(DISTINCT l.id) AS total ${baseSql}`;
    const totalItems = db.prepare(countSql).get(...params)?.total || 0;
    const curPage = Math.max(1, Number(page) || 1);
    const curPageSize = Math.min(100, Math.max(1, Number(pageSize) || 10));
    const totalPages = Math.ceil(totalItems / curPageSize) || 1;

    paginationMeta = {
      page: curPage,
      pageSize: curPageSize,
      totalItems,
      totalPages,
    };
  }

  let selectSql = `
    SELECT l.id, l.organization_id, l.code, l.name, l.address, l.phone,
           coalesce(l.type, 'STORE') AS type,
           l.status, l.created_at, l.updated_at,
           COUNT(b.id) AS batch_count,
           COALESCE(SUM(CASE WHEN b.remaining_quantity > 0 AND b.status != 'consumed' THEN b.remaining_quantity ELSE 0 END), 0) AS total_inventory
    ${baseSql}
    GROUP BY l.id
    ORDER BY l.id DESC
  `;

  const queryParams = [...params];

  if (isPaging && paginationMeta) {
    selectSql += " LIMIT ? OFFSET ?";
    queryParams.push(paginationMeta.pageSize, (paginationMeta.page - 1) * paginationMeta.pageSize);
  } else if (limit !== null) {
    selectSql += " LIMIT ? OFFSET ?";
    queryParams.push(Number(limit), Math.max(0, Number(offset) || 0));
  }

  const rows = db.prepare(selectSql).all(...queryParams);

  // Trả về cấu trúc hỗ trợ cả array và object { data, pagination }
  if (isPaging && paginationMeta) {
    const result = {
      data: rows,
      pagination: paginationMeta,
    };
    // Gán để tương thích ngược nếu caller coi result là array
    Object.assign(rows, result);
    return result;
  }

  return rows;
}

export function getLocationById(id, organizationId) {
  const db = getDb();
  let sql = `
    SELECT l.id, l.organization_id, l.code, l.name, l.address, l.phone,
           coalesce(l.type, 'STORE') AS type,
           l.status, l.created_at, l.updated_at,
           COUNT(b.id) AS batch_count,
           COALESCE(SUM(CASE WHEN b.remaining_quantity > 0 AND b.status != 'consumed' THEN b.remaining_quantity ELSE 0 END), 0) AS total_inventory
    FROM locations l
    LEFT JOIN batches b ON b.location_id = l.id
    WHERE l.id = ?
  `;
  const params = [Number(id)];
  if (organizationId) {
    sql += " AND l.organization_id = ?";
    params.push(organizationId);
  }
  sql += " GROUP BY l.id";

  const location = db.prepare(sql).get(...params);
  if (!location) {
    const err = new Error("Không tìm thấy địa điểm/cửa hàng.");
    err.statusCode = 404;
    throw err;
  }
  return location;
}

export function createLocation({ organizationId, code, name, address, phone, type, status }) {
  if (!name || String(name).trim().length === 0) {
    const err = new Error("Tên địa điểm/cửa hàng là bắt buộc.");
    err.statusCode = 400;
    throw err;
  }

  let storeAddress = "Chưa cập nhật";
  if (address !== undefined) {
    if (String(address).trim().length === 0) {
      const err = new Error("Địa chỉ cửa hàng là bắt buộc.");
      err.statusCode = 400;
      throw err;
    }
    storeAddress = String(address).trim();
  }

  if (phone && String(phone).trim().length > 0) {
    const cleanPhone = String(phone).trim();
    if (!PHONE_REGEX.test(cleanPhone)) {
      const err = new Error("Số điện thoại không đúng định dạng.");
      err.statusCode = 400;
      throw err;
    }
  }

  const db = getDb();

  // Chuẩn hóa mã cửa hàng
  let storeCode = code ? String(code).trim().toUpperCase() : null;
  if (!storeCode) {
    const count = db
      .prepare("SELECT COUNT(*) AS c FROM locations WHERE organization_id = ?")
      .get(organizationId).c;
    storeCode = `CH-${String(count + 1).padStart(3, "0")}`;
    const dupCheck = db
      .prepare("SELECT id FROM locations WHERE upper(trim(code)) = upper(trim(?))")
      .get(storeCode);
    if (dupCheck) {
      storeCode = `CH-${Date.now().toString().slice(-4)}`;
    }
  } else {
    // Kiểm tra trùng mã (Case-insensitive) trong cùng tổ chức hoặc toàn hệ thống
    const existingCode = db
      .prepare("SELECT id FROM locations WHERE upper(trim(code)) = upper(trim(?)) AND organization_id = ?")
      .get(storeCode, organizationId);
    if (existingCode) {
      const err = new Error(`Mã cửa hàng '${storeCode}' đã tồn tại.`);
      err.statusCode = 409; // HTTP 409 Conflict
      err.code = "DUPLICATE_CODE";
      throw err;
    }
  }

  const storeStatus =
    status && ["inactive", "Inactive", "INACTIVE"].includes(status) ? "INACTIVE" : "ACTIVE";

  const storeType =
    type && ["warehouse", "Warehouse", "WAREHOUSE"].includes(type) ? "WAREHOUSE" : "STORE";

  const result = db
    .prepare(
      `INSERT INTO locations(organization_id, code, name, address, phone, type, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run(
      organizationId,
      storeCode,
      String(name).trim(),
      storeAddress,
      phone ? String(phone).trim() : null,
      storeType,
      storeStatus,
    );

  return getLocationById(result.lastInsertRowid, organizationId);
}

export function updateLocation({ id, organizationId, code, name, address, phone, type, status }) {
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

  if (address !== undefined && String(address).trim().length === 0) {
    const err = new Error("Địa chỉ địa điểm/cửa hàng không được để trống.");
    err.statusCode = 400;
    throw err;
  }

  if (phone !== undefined && String(phone).trim().length > 0) {
    const cleanPhone = String(phone).trim();
    if (!PHONE_REGEX.test(cleanPhone)) {
      const err = new Error("Số điện thoại không đúng định dạng.");
      err.statusCode = 400;
      throw err;
    }
  }

  let storeCode = code !== undefined ? (code ? String(code).trim().toUpperCase() : existing.code) : existing.code;
  if (storeCode && storeCode !== existing.code) {
    const dup = db
      .prepare("SELECT id FROM locations WHERE upper(trim(code)) = upper(trim(?)) AND id != ? AND organization_id = ?")
      .get(storeCode, id, organizationId);
    if (dup) {
      const err = new Error(`Mã cửa hàng '${storeCode}' đã được sử dụng.`);
      err.statusCode = 409;
      err.code = "DUPLICATE_CODE";
      throw err;
    }
  }

  const storeName = name !== undefined ? String(name).trim() : existing.name;
  const storeAddress = address !== undefined ? String(address).trim() : existing.address;
  const storePhone = phone !== undefined ? (phone ? String(phone).trim() : null) : existing.phone;
  const storeType = type !== undefined ? (["warehouse", "Warehouse", "WAREHOUSE"].includes(type) ? "WAREHOUSE" : "STORE") : (existing.type || "STORE");
  const storeStatus = status !== undefined
    ? (["inactive", "Inactive", "INACTIVE"].includes(status) ? "INACTIVE" : "ACTIVE")
    : (existing.status || "ACTIVE");

  db.prepare(
    `UPDATE locations
     SET code = ?, name = ?, address = ?, phone = ?, type = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(storeCode, storeName, storeAddress, storePhone, storeType, storeStatus, id);

  return getLocationById(id, organizationId);
}

export function toggleLocationStatus({ id, organizationId, status = null }) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM locations WHERE id = ? AND organization_id = ?")
    .get(id, organizationId);

  if (!existing) {
    const err = new Error("Không tìm thấy địa điểm/cửa hàng.");
    err.statusCode = 404;
    throw err;
  }

  let nextStatus;
  if (status && String(status).trim()) {
    nextStatus = ["inactive", "Inactive", "INACTIVE"].includes(status) ? "INACTIVE" : "ACTIVE";
  } else {
    const current = String(existing.status || "ACTIVE").toUpperCase();
    nextStatus = current === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  }

  db.prepare(
    "UPDATE locations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(nextStatus, id);

  return getLocationById(id, organizationId);
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
    // Nếu có lịch sử giao dịch thì chuyển trạng thái sang INACTIVE thay vì xóa cứng (Soft Delete)
    db.prepare("UPDATE locations SET status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return { deleted: false, status: "INACTIVE", message: "Địa điểm đã có lịch sử điều chuyển, đã chuyển trạng thái sang INACTIVE." };
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
