import { recordAuditLog } from "../services/auditLogService.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * S-31: Middleware tự động ghi audit log cho mọi thao tác ghi/sửa/xóa (POST/PUT/PATCH/DELETE).
 * TUYỆT ĐỐI không ghi dữ liệu nhạy cảm (được redact tự động).
 * Intercept response để bắt được status code và thông tin người dùng sau auth.
 */
export function auditLogMiddleware(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) {
    return next();
  }

  if (req._auditLogged) {
    return next();
  }
  req._auditLogged = true;

  // Intercept res.end để ghi log khi request kết thúc
  const originalEnd = res.end.bind(res);
  res.end = function (...args) {
    // URL path parsing
    const urlParts = (req.originalUrl || req.path || "")
      .replace(/^\/api(\/v1)?\/?/, "")
      .split("/")
      .filter(Boolean);

    const resourceType = urlParts[0] || "system";
    const resourceId = urlParts[1] && /^\d+$/.test(urlParts[1]) ? urlParts[1] : null;
    const action = `${req.method} ${req.originalUrl || req.path}`;

    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      null;

    // Run asynchronously to not block response
    setImmediate(() => {
      recordAuditLog({
        userId: req.user?.id || null,
        organizationId: req.user?.organization_id || null,
        action,
        resourceType,
        resourceId,
        ipAddress,
        statusCode: res.statusCode,
        requestBody: req.body,
      });
    });

    return originalEnd(...args);
  };

  next();
}
