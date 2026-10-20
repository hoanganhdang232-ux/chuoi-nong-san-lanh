/**
 * SCRUM Sprint 7 Routes: Public QR Trace, Data Masking, Rate Limiting & Notification Center
 * Implements endpoints for T-107, T-109, T-111, T-115, T-120, T-121, T-122
 */
import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { publicRateLimitMiddleware } from "../middleware/rateLimiter.js";
import {
  generateBatchQr,
  getPublicTraceData,
  verifyHashChainProof,
  getNotificationCenterHistory,
  markAllNotificationsAsRead,
} from "../services/sprint7PublicService.js";
import { getDb } from "../db/database.js";

const router = Router();

/**
 * T-107: POST /api/v1/batches/:id/qr
 * Sinh mã QR và đường dẫn truy xuất công khai ngắn gọn cho lô hàng.
 */
router.post("/batches/:id/qr", authenticateToken, async (req, res) => {
  try {
    const batchId = Number(req.params.id);
    const hostHeader = req.get("host") || "localhost:5173";
    const protocol = req.protocol === "https" ? "https" : "http";
    const baseUrl = `${protocol}://${hostHeader}`;

    const qrResult = await generateBatchQr(batchId, { baseUrl });
    return res.status(200).json(qrResult);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
});

/**
 * T-109, T-112, T-115, T-117, T-122: GET /api/v1/public/trace/:code
 * Public Unauthenticated API lấy thông tin hành trình nguồn gốc lô hàng.
 * - Không cần JWT token / session
 * - Áp dụng Rate Limiting & Captcha bảo vệ chống cào dữ liệu (T-115, T-116)
 * - Lọc bỏ 100% dữ liệu nhạy cảm (giá, lượng, đối tác nội bộ) (T-112, T-113)
 * - Cache Aside tối ưu < 1.5s (T-117)
 */
router.get("/public/trace/:code", publicRateLimitMiddleware, async (req, res) => {
  try {
    const code = req.params.code;
    const hostHeader = req.get("host") || "localhost:5173";
    const protocol = req.protocol === "https" ? "https" : "http";
    const baseUrl = `${protocol}://${hostHeader}`;

    const traceData = await getPublicTraceData(code, { baseUrl });
    if (!traceData) {
      return res.status(404).json({
        message: "Không tìm thấy thông tin truy xuất nguồn gốc cho mã này.",
        code,
      });
    }

    // Set HTTP Cache-Control header tối ưu TTFB và caching browser/CDN
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=60");
    return res.json(traceData);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ message: err.message });
  }
});

/**
 * T-111: GET /api/v1/public/verify-chain/:code
 * Kiểm tra xác thực tính toàn vẹn toán học của Hash Chain công khai.
 */
router.get("/public/verify-chain/:code", publicRateLimitMiddleware, (req, res) => {
  try {
    const proof = verifyHashChainProof(req.params.code);
    return res.json(proof);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/**
 * SCRUM-193 / T-120 & T-121: GET /api/v1/notifications/history
 * Lấy lịch sử thông báo tập trung có bộ lọc đa chiều (Tất cả, Chuỗi lạnh, Thu hồi, Bàn giao, Chưa đọc).
 */
router.get("/notifications/history", authenticateToken, (req, res) => {
  try {
    const { type, isRead, search, limit, offset } = req.query;
    const result = getNotificationCenterHistory(req.user.id, req.user.organization_id, {
      type: type || "all",
      isRead: isRead || "all",
      search: search || "",
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
});

/**
 * T-121: PUT /api/v1/notifications/read-all
 * Đánh dấu toàn bộ thông báo của người dùng là đã đọc.
 */
router.put("/notifications/read-all", authenticateToken, (req, res) => {
  try {
    const result = markAllNotificationsAsRead(req.user.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/**
 * T-122: GET /api/v1/certifications
 * Lấy danh sách các chứng nhận chất lượng (VietGAP, GlobalGAP, OCOP) có sẵn trong hệ thống.
 */
router.get("/certifications", authenticateToken, (req, res) => {
  try {
    const certs = getDb()
      .prepare(
        `SELECT c.*, p.name AS product_name, f.name AS farm_name
         FROM certifications c
         LEFT JOIN products p ON p.id = c.product_id
         LEFT JOIN farms f ON f.id = c.farm_id
         ORDER BY c.id DESC`,
      )
      .all();
    return res.json(certs);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
