import { getDb } from "../db/database.js";

/**
 * S-32: Nhập danh mục sản phẩm & thửa đất từ file CSV.
 * - Xử lý All-or-Nothing trong 1 Database Transaction duy nhất.
 * - Kiểm tra dữ liệu từng dòng: nếu có bất kỳ dòng nào sai định dạng,
 *   Rollback toàn bộ và trả về báo cáo lỗi chi tiết (Số dòng + Số cột + Tên trường + Lý do).
 * - Giới hạn kích thước file upload để tránh cạn kiệt bộ nhớ Server.
 */

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Trình phân tích CSV chuẩn RFC 4180 hỗ trợ quoted values, escaped quotes, newlines bên trong quotes
 */
export function parseCSV(text) {
  if (typeof text !== "string") return [];
  let raw = text.replace(/^\uFEFF/, "").trimStart();
  let delimiter = ",";

  const sepMatch = raw.match(/^sep=([,;\t|])(?:\r?\n|$)/i);
  if (sepMatch) {
    delimiter = sepMatch[1];
    raw = raw.slice(sepMatch[0].length);
  } else {
    const firstLine = raw.split(/\r?\n/)[0] || "";
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    if (semicolonCount > commaCount && semicolonCount >= 1) {
      delimiter = ";";
    } else if (tabCount > commaCount && tabCount >= 1) {
      delimiter = "\t";
    }
  }

  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < normalized.length && normalized[i + 1] === '"') {
          currentField += '"';
          i++; // Bỏ qua dấu nháy kép thứ hai
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (ch === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Import Sản phẩm từ file CSV
 * Header bắt buộc: name, unit
 */
export function importProductsFromCSV({ csvContent, organizationId, fileSize }) {
  const size = Number(fileSize) || Buffer.byteLength(csvContent || "", "utf8");
  if (size > MAX_FILE_SIZE_BYTES) {
    const err = new Error(`File quá lớn (${(size / 1024 / 1024).toFixed(2)}MB). Giới hạn tối đa là ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`);
    err.statusCode = 400;
    throw err;
  }

  if (!csvContent || typeof csvContent !== "string") {
    const err = new Error("Nội dung CSV không được để trống.");
    err.statusCode = 400;
    throw err;
  }

  const rows = parseCSV(csvContent);
  if (rows.length < 2) {
    const err = new Error("File CSV phải có dòng tiêu đề (header) và ít nhất 1 dòng dữ liệu.");
    err.statusCode = 400;
    throw err;
  }

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const nameIdx = headers.indexOf("name");
  const unitIdx = headers.indexOf("unit");

  if (nameIdx === -1 || unitIdx === -1) {
    const err = new Error("File CSV phải có các cột tiêu đề bắt buộc: name, unit.");
    err.statusCode = 400;
    throw err;
  }

  const errors = [];
  const validRows = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = i + 1; // 1-indexed (dòng 1 là header)
    const rowErrors = [];

    const name = row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : "";
    const unit = row[unitIdx] !== undefined ? String(row[unitIdx]).trim() : "";

    if (!name) {
      rowErrors.push({
        column: nameIdx + 1,
        field: "name",
        message: "Tên sản phẩm không được để trống.",
      });
    }

    if (!unit) {
      rowErrors.push({
        column: unitIdx + 1,
        field: "unit",
        message: "Đơn vị tính không được để trống.",
      });
    }

    if (rowErrors.length > 0) {
      errors.push({ line: lineNumber, errors: rowErrors });
    } else {
      validRows.push({ name, unit, line: lineNumber });
    }
  }

  // Nếu có bất kỳ dòng nào bị lỗi -> Báo cáo lỗi chi tiết, không import dòng nào
  if (errors.length > 0) {
    return {
      success: false,
      message: `Import thất bại: Phát hiện lỗi tại ${errors.length} dòng. Toàn bộ thao tác đã bị hủy bỏ.`,
      errors,
      imported: 0,
    };
  }

  // All-or-Nothing trong 1 Database Transaction
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const stmt = db.prepare(
      "INSERT INTO products(organization_id, name, unit) VALUES (?, ?, ?)",
    );

    for (const item of validRows) {
      stmt.run(organizationId, item.name, item.unit);
    }

    db.exec("COMMIT");

    return {
      success: true,
      message: `Import thành công toàn bộ ${validRows.length} sản phẩm vào danh mục.`,
      imported: validRows.length,
      errors: [],
    };
  } catch (err) {
    db.exec("ROLLBACK");
    const error = new Error(`Lỗi cơ sở dữ liệu khi import sản phẩm: ${err.message}`);
    error.statusCode = 400;
    throw error;
  }
}

/**
 * Import Thửa đất từ file CSV
 * Header bắt buộc: name, area_ha (tùy chọn: latitude, longitude)
 */
export function importLandPlotsFromCSV({ csvContent, organizationId, fileSize }) {
  const size = Number(fileSize) || Buffer.byteLength(csvContent || "", "utf8");
  if (size > MAX_FILE_SIZE_BYTES) {
    const err = new Error(`File quá lớn (${(size / 1024 / 1024).toFixed(2)}MB). Giới hạn tối đa là ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`);
    err.statusCode = 400;
    throw err;
  }

  if (!csvContent || typeof csvContent !== "string") {
    const err = new Error("Nội dung CSV không được để trống.");
    err.statusCode = 400;
    throw err;
  }

  const rows = parseCSV(csvContent);
  if (rows.length < 2) {
    const err = new Error("File CSV phải có dòng tiêu đề (header) và ít nhất 1 dòng dữ liệu.");
    err.statusCode = 400;
    throw err;
  }

  const headers = rows[0].map((h) => h.toLowerCase().trim().replace(/[\s_-]+/g, ""));
  // Hỗ trợ cả 'areaha' và 'area_ha'
  const nameIdx = headers.findIndex((h) => h === "name" || h === "tenthuadat");
  const areaIdx = headers.findIndex((h) => h === "areaha" || h === "area" || h === "dientich");
  const latIdx = headers.findIndex((h) => h === "latitude" || h === "lat" || h === "vido");
  const lngIdx = headers.findIndex((h) => h === "longitude" || h === "lng" || h === "kinhdo");

  if (nameIdx === -1 || areaIdx === -1) {
    const err = new Error("File CSV phải có các cột tiêu đề bắt buộc: name, area_ha.");
    err.statusCode = 400;
    throw err;
  }

  const db = getDb();
  const farm = db
    .prepare("SELECT id FROM farms WHERE organization_id = ? LIMIT 1")
    .get(organizationId);

  if (!farm) {
    const err = new Error("Tổ chức chưa có trang trại. Vui lòng tạo trang trại trước khi nhập thửa đất.");
    err.statusCode = 400;
    throw err;
  }

  const errors = [];
  const validRows = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = i + 1;
    const rowErrors = [];

    const name = row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : "";
    const areaStr = row[areaIdx] !== undefined ? String(row[areaIdx]).trim() : "";
    const area = Number(areaStr);

    if (!name) {
      rowErrors.push({
        column: nameIdx + 1,
        field: "name",
        message: "Tên thửa đất không được để trống.",
      });
    }

    if (!areaStr || !Number.isFinite(area) || area <= 0) {
      rowErrors.push({
        column: areaIdx + 1,
        field: "area_ha",
        message: "Diện tích thửa đất (area_ha) phải là số dương hợp lệ.",
      });
    }

    let lat = null;
    if (latIdx !== -1 && row[latIdx] !== undefined && String(row[latIdx]).trim() !== "") {
      const parsedLat = Number(row[latIdx]);
      if (Number.isFinite(parsedLat)) {
        lat = parsedLat;
      } else {
        rowErrors.push({
          column: latIdx + 1,
          field: "latitude",
          message: "Vĩ độ (latitude) không hợp lệ.",
        });
      }
    }

    let lng = null;
    if (lngIdx !== -1 && row[lngIdx] !== undefined && String(row[lngIdx]).trim() !== "") {
      const parsedLng = Number(row[lngIdx]);
      if (Number.isFinite(parsedLng)) {
        lng = parsedLng;
      } else {
        rowErrors.push({
          column: lngIdx + 1,
          field: "longitude",
          message: "Kinh độ (longitude) không hợp lệ.",
        });
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ line: lineNumber, errors: rowErrors });
    } else {
      validRows.push({
        name,
        area_ha: area,
        latitude: lat,
        longitude: lng,
        line: lineNumber,
      });
    }
  }

  // Báo cáo lỗi chi tiết nếu có bất kỳ dòng nào vi phạm
  if (errors.length > 0) {
    return {
      success: false,
      message: `Import thất bại: Phát hiện lỗi tại ${errors.length} dòng. Toàn bộ thao tác đã bị hủy bỏ.`,
      errors,
      imported: 0,
    };
  }

  // All-or-Nothing trong 1 Database Transaction
  db.exec("BEGIN IMMEDIATE");
  try {
    const stmt = db.prepare(
      "INSERT INTO land_plots(farm_id, name, area_ha, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
    );

    for (const item of validRows) {
      stmt.run(farm.id, item.name, item.area_ha, item.latitude, item.longitude);
    }

    db.exec("COMMIT");

    return {
      success: true,
      message: `Import thành công toàn bộ ${validRows.length} thửa đất cho trang trại.`,
      imported: validRows.length,
      errors: [],
    };
  } catch (err) {
    db.exec("ROLLBACK");
    const error = new Error(`Lỗi cơ sở dữ liệu khi import thửa đất: ${err.message}`);
    error.statusCode = 400;
    throw error;
  }
}
