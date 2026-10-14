import { getDb } from "../db/database.js";

/**
 * S-31: Nhật ký thao tác hệ thống (Audit Log)
 * Ghi nhận tự động mọi thao tác ghi/sửa/xóa (POST/PUT/DELETE).
 * TUYỆT ĐỐI KHÔNG ghi dữ liệu nhạy cảm (mật khẩu, token, authorization header).
 */

const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "authorization",
  "secret",
  "jwt",
  "cookie",
  "refresh_token",
  "access_token",
]);

/**
 * Đệ quy lọc bỏ dữ liệu nhạy cảm khỏi payload
 */
export function sanitizePayload(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizePayload(item));
  }
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizePayload(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function recordAuditLog({
  userId,
  organizationId,
  action,
  resourceType,
  resourceId,
  ipAddress,
  statusCode,
  requestBody,
}) {
  try {
    const db = getDb();
    const safeBody = requestBody ? JSON.stringify(sanitizePayload(requestBody)) : null;

    db.prepare(
      `INSERT INTO audit_logs(
        user_id, organization_id, action, resource_type,
        resource_id, ip_address, status_code, request_body, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    ).run(
      userId || null,
      organizationId || null,
      action,
      resourceType || null,
      resourceId ? String(resourceId) : null,
      ipAddress || null,
      statusCode || null,
      safeBody,
    );
  } catch {
    // Audit logging failure should not break the business transaction
  }
}

/**
 * Lấy danh sách audit logs dành cho Admin / Auditor.
 * Hỗ trợ phân trang và lọc theo user, org, action, resource_type, time range.
 */
export function listAuditLogs({
  page = 1,
  limit = 50,
  userId,
  organizationId,
  action,
  resourceType,
  startDate,
  endDate,
} = {}) {
  const db = getDb();
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offset = (pageNum - 1) * pageSize;

  let where = "WHERE 1=1";
  const params = [];

  if (userId) {
    where += " AND al.user_id = ?";
    params.push(Number(userId));
  }
  if (organizationId) {
    where += " AND al.organization_id = ?";
    params.push(Number(organizationId));
  }
  if (action) {
    where += " AND al.action LIKE '%' || ? || '%'";
    params.push(String(action));
  }
  if (resourceType) {
    where += " AND al.resource_type = ?";
    params.push(String(resourceType));
  }
  if (startDate) {
    where += " AND al.created_at >= ?";
    params.push(String(startDate));
  }
  if (endDate) {
    where += " AND al.created_at <= ?";
    params.push(String(endDate));
  }

  const countRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM audit_logs al ${where}`)
    .get(...params);
  const total = countRow ? countRow.cnt : 0;

  const rows = db
    .prepare(
      `SELECT al.*, u.name AS user_name, u.email AS user_email, o.name AS organization_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN organizations o ON o.id = al.organization_id
       ${where}
       ORDER BY al.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset);

  return {
    data: rows,
    pagination: {
      page: pageNum,
      limit: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  };
}
