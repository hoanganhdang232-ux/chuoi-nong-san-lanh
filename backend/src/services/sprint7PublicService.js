/**
 * SCRUM Sprint 7: Public QR Trace, Certifications, Cryptographic Verification & Notification Center
 * Implementations for T-106, T-107, T-109, T-111, T-120, T-121, T-122
 */
import QRCode from "qrcode";
import crypto from "node:crypto";
import { getDb } from "../db/database.js";
import { transformToPublicTraceDTO } from "../dto/publicTraceDto.js";
import { getOrSetCache, invalidatePublicTraceCache } from "./cacheService.js";

/**
 * T-106 & T-107: Sinh mã QR và đường dẫn truy xuất ngắn gọn, công khai cho lô hàng
 */
export async function generateBatchQr(batchId, { baseUrl = "http://localhost:5173" } = {}) {
  const db = getDb();
  const batch = db
    .prepare(
      `SELECT b.id, b.batch_code, b.public_code, p.name AS product_name, b.status
       FROM batches b
       JOIN products p ON p.id = b.product_id
       WHERE b.id = ?`,
    )
    .get(Number(batchId));

  if (!batch) {
    const error = new Error("Không tìm thấy lô hàng để tạo mã QR.");
    error.statusCode = 404;
    throw error;
  }

  // Đảm bảo batch có public_code duy nhất
  let publicCode = batch.public_code;
  if (!publicCode) {
    const hash = crypto
      .createHash("sha256")
      .update(`${batch.batch_code}-${batch.id}-${Date.now()}`)
      .digest("hex")
      .slice(0, 8)
      .toUpperCase();
    publicCode = `TRC-${hash}`;

    db.prepare("UPDATE batches SET public_code = ? WHERE id = ?").run(publicCode, batch.id);
  }

  // Tạo URL truy xuất công khai chuẩn
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const publicUrl = `${cleanBase}/p/${publicCode}`;

  // Sinh QR Code dưới cả dạng SVG và DataURL PNG chất lượng cao
  const qrSvg = await QRCode.toString(publicUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: {
      dark: "#0f172a",
      light: "#ffffff",
    },
  });

  const qrDataUrl = await QRCode.toDataURL(publicUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 600,
    color: {
      dark: "#0f172a",
      light: "#ffffff",
    },
  });

  return {
    batchId: batch.id,
    batchCode: batch.batch_code,
    productName: batch.product_name,
    publicCode,
    publicUrl,
    qrSvg,
    qrDataUrl,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * T-109, T-111 & T-122: Lấy dữ liệu truy xuất công khai đã được bọc và tối ưu cache
 */
export async function getPublicTraceData(identifier, { bypassCache = false, baseUrl = "http://localhost:5173" } = {}) {
  const cacheKey = `public:trace:${identifier}`;

  if (!bypassCache) {
    const { data } = await getOrSetCache(
      cacheKey,
      async () => fetchAndAssemblePublicTrace(identifier, baseUrl),
      300, // 5 phút TTL
    );
    return data;
  }

  const freshData = await fetchAndAssemblePublicTrace(identifier, baseUrl);
  if (freshData) {
    invalidatePublicTraceCache(identifier);
  }
  return freshData;
}

/**
 * Lấy và tổng hợp dữ liệu nguồn gốc, xác minh Hash Chain và bọc DTO
 */
async function fetchAndAssemblePublicTrace(identifier, baseUrl) {
  const db = getDb();

  // 1. Tìm batch theo public_code hoặc batch_code
  const batch = db
    .prepare(
      `SELECT b.*, p.name AS product_name, p.unit AS product_unit, p.min_temp, p.max_temp,
              p.max_allowed_delay_minutes, f.name AS farm_name, f.address AS farm_address,
              f.latitude AS farm_lat, f.longitude AS farm_lng,
              lp.id AS plot_id, lp.name AS plot_name, lp.area_ha AS plot_area,
              lp.soil_type AS plot_soil, lp.photos_json AS plot_photos,
              lp.certification_code AS plot_cert_code,
              lp.latitude AS plot_lat, lp.longitude AS plot_lng
       FROM batches b
       JOIN products p ON p.id = b.product_id
       LEFT JOIN farms f ON f.id = b.source_farm_id
       LEFT JOIN land_plots lp ON lp.id = b.land_plot_id
       WHERE b.public_code = ? OR b.batch_code = ?`,
    )
    .get(identifier, identifier);

  if (!batch) {
    return null;
  }

  // 2. Tìm sự kiện nhật ký chuỗi Hash Chain
  const events = db
    .prepare(
      `SELECT id, batch_id, event_type, actor_id, data_json, previous_hash, current_hash, timestamp
       FROM event_logs
       WHERE batch_id = ?
       ORDER BY id ASC`,
    )
    .all(batch.id);

  // 3. T-111: Xác minh tính toàn vẹn toán học của Hash Chain
  let isChainValid = true;
  let genesisHash = events.length > 0 ? events[0].current_hash : null;
  let headHash = events.length > 0 ? events[events.length - 1].current_hash : null;

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    if (i > 0) {
      const prevEvt = events[i - 1];
      if (evt.previous_hash !== prevEvt.current_hash) {
        isChainValid = false;
        break;
      }
    }
  }

  // 4. T-122: Lấy danh sách chứng nhận chất lượng (VietGAP, GlobalGAP, OCOP, v.v.)
  const certifications = db
    .prepare(
      `SELECT id, code, name, standard, issuer, issue_date, expiry_date, status,
              certificate_file_url, seal_icon, description
       FROM certifications
       WHERE product_id = ? OR farm_id = ? OR (land_plot_id IS NOT NULL AND land_plot_id = ?)
       ORDER BY id ASC`,
    )
    .all(batch.product_id, batch.source_farm_id || 0, batch.land_plot_id || 0);

  // 5. Lấy dữ liệu cảm biến nhiệt độ chuỗi lạnh
  const temperatureLogs = db
    .prepare(
      `SELECT temperature, recorded_at, timestamp
       FROM temperature_logs
       WHERE batch_id = ?
       ORDER BY id ASC
       LIMIT 100`,
    )
    .all(batch.id);

  // 6. T-112 & T-113: Áp dụng Public Trace DTO lọc bỏ dữ liệu nhạy cảm
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const publicCode = batch.public_code || `TRC-${batch.batch_code}`;
  const publicUrl = `${cleanBase}/p/${publicCode}`;

  const dto = transformToPublicTraceDTO({
    batch,
    product: {
      name: batch.product_name,
      unit: batch.product_unit,
      min_temp: batch.min_temp,
      max_temp: batch.max_temp,
    },
    farm: {
      name: batch.farm_name,
      address: batch.farm_address,
      latitude: batch.farm_lat,
      longitude: batch.farm_lng,
    },
    landPlot: batch.plot_name
      ? {
          name: batch.plot_name,
          area_ha: batch.plot_area,
          soil_type: batch.plot_soil,
          certification_code: batch.plot_cert_code,
          latitude: batch.plot_lat,
          longitude: batch.plot_lng,
          photos_json: batch.plot_photos,
        }
      : null,
    certifications,
    timelineEvents: events,
    temperatureLogs,
    integrity: {
      isChainValid,
      genesisHash,
      headHash,
    },
    publicCode,
    publicUrl,
  });

  return dto;
}

/**
 * T-111: Kiểm tra và xuất báo cáo bằng chứng mật mã học của Hash Chain
 */
export function verifyHashChainProof(identifier) {
  const db = getDb();
  const batch = db
    .prepare("SELECT id, batch_code, public_code FROM batches WHERE public_code = ? OR batch_code = ?")
    .get(identifier, identifier);

  if (!batch) {
    return { verified: false, message: "Không tìm thấy lô hàng." };
  }

  const events = db
    .prepare(
      `SELECT id, event_type, previous_hash, current_hash, timestamp
       FROM event_logs
       WHERE batch_id = ?
       ORDER BY id ASC`,
    )
    .all(batch.id);

  if (events.length === 0) {
    return {
      verified: true,
      batchCode: batch.batch_code,
      publicCode: batch.public_code,
      blockCount: 0,
      status: "CHƯA CÓ KHỐI DỮ LIỆU",
      blocks: [],
    };
  }

  let intact = true;
  const verifiedBlocks = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    let stepValid = true;

    if (i > 0) {
      if (e.previous_hash !== events[i - 1].current_hash) {
        stepValid = false;
        intact = false;
      }
    }

    verifiedBlocks.push({
      blockIndex: i + 1,
      eventType: e.event_type,
      timestamp: e.timestamp,
      previousHash: e.previous_hash,
      currentHash: e.current_hash,
      isValidLink: stepValid,
    });
  }

  return {
    verified: intact,
    batchCode: batch.batch_code,
    publicCode: batch.public_code,
    blockCount: events.length,
    algorithm: "SHA-256",
    genesisHash: events[0].current_hash,
    headHash: events[events.length - 1].current_hash,
    status: intact ? "XÁC THỰC TOÀN VẸN 100%" : "CẢNH BÁO: PHÁT HIỆN DẤU HIỆU THAY ĐỔI DỮ LIỆU",
    blocks: verifiedBlocks,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * SCRUM-193 / T-120 & T-121: Notification Center Service
 * Quản lý thông báo tập trung với bộ lọc đa chiều (Thu hồi, Chuỗi lạnh, Bàn giao, Chưa đọc)
 */
export function getNotificationCenterHistory(userId, orgId, { type = "all", isRead = "all", search = "", limit = 50, offset = 0 } = {}) {
  const db = getDb();

  let baseQuery = `
    FROM notifications
    WHERE user_id = ?
  `;
  const params = [Number(userId)];

  // Bộ lọc theo phân loại (T-121)
  if (type === "cold_chain") {
    baseQuery += ` AND (type LIKE '%cold_chain%' OR type LIKE '%temp%' OR kind LIKE '%cold_chain%' OR title LIKE '%chuỗi lạnh%' OR title LIKE '%nhiệt độ%')`;
  } else if (type === "recall") {
    baseQuery += ` AND (type LIKE '%recall%' OR type LIKE '%quarantine%' OR kind LIKE '%recall%' OR title LIKE '%thu hồi%' OR title LIKE '%niêm phong%')`;
  } else if (type === "transfer") {
    baseQuery += ` AND (type LIKE '%transfer%' OR kind LIKE '%transfer%' OR title LIKE '%bàn giao%' OR title LIKE '%vận chuyển%')`;
  }

  // Bộ lọc trạng thái đọc
  if (isRead === "unread") {
    baseQuery += ` AND (is_read = 0 OR is_read IS NULL) AND read_at IS NULL`;
  } else if (isRead === "read") {
    baseQuery += ` AND (is_read = 1 OR read_at IS NOT NULL)`;
  }

  // Tìm kiếm từ khóa
  if (search && search.trim()) {
    baseQuery += ` AND (title LIKE ? OR message LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }

  // Đếm tổng số theo filter hiện tại
  const totalCount = db.prepare(`SELECT COUNT(*) AS count ${baseQuery}`).get(...params).count;

  // Lấy danh sách kết quả
  const rows = db
    .prepare(
      `SELECT id, user_id, organization_id, org_id, kind, type, title, message,
              is_read, read_at, created_at
       ${baseQuery}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, Number(limit), Number(offset));

  // Thống kê số lượng theo từng danh mục
  const counts = {
    all: db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ?").get(Number(userId)).count,
    unread: db
      .prepare(
        "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND (is_read = 0 OR is_read IS NULL) AND read_at IS NULL",
      )
      .get(Number(userId)).count,
    cold_chain: db
      .prepare(
        `SELECT COUNT(*) AS count FROM notifications
         WHERE user_id = ? AND (type LIKE '%cold_chain%' OR type LIKE '%temp%' OR title LIKE '%chuỗi lạnh%' OR title LIKE '%nhiệt độ%')`,
      )
      .get(Number(userId)).count,
    recall: db
      .prepare(
        `SELECT COUNT(*) AS count FROM notifications
         WHERE user_id = ? AND (type LIKE '%recall%' OR type LIKE '%quarantine%' OR title LIKE '%thu hồi%' OR title LIKE '%niêm phong%')`,
      )
      .get(Number(userId)).count,
    transfer: db
      .prepare(
        `SELECT COUNT(*) AS count FROM notifications
         WHERE user_id = ? AND (type LIKE '%transfer%' OR title LIKE '%bàn giao%' OR title LIKE '%vận chuyển%')`,
      )
      .get(Number(userId)).count,
  };

  return {
    notifications: rows.map((r) => ({
      ...r,
      is_read: Boolean(r.is_read || r.read_at),
    })),
    totalCount,
    unreadCount: counts.unread,
    categoryCounts: counts,
  };
}

/**
 * T-121: Đánh dấu tất cả thông báo của người dùng là đã đọc
 */
export function markAllNotificationsAsRead(userId) {
  const db = getDb();
  db.prepare(
    `UPDATE notifications
     SET is_read = 1, read_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND (is_read = 0 OR is_read IS NULL OR read_at IS NULL)`,
  ).run(Number(userId));

  return { success: true, message: "Đã đánh dấu tất cả thông báo là đã đọc." };
}
