import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  updateProductColdChainConfig,
  getProductColdChainConfig,
  ingestTemperatureTelemetry,
  getBatchTemperatureHistory,
  archiveOldTemperatureLogs,
  aggregateOldTemperatureLogs,
  getColdChainOverview,
  evaluateBatchColdChain,
} from "../services/sprint6ColdChainService.js";

const router = Router();

const adminRoles = [
  "farm_admin",
  "processor_admin",
  "distributor_admin",
  "auditor",
];

/**
 * T-90: PUT /api/v1/products/:id/cold-chain-config
 * Cập nhật ngưỡng nhiệt độ bảo quản và thời gian trễ cho phép của sản phẩm.
 */
router.put(
  "/products/:id/cold-chain-config",
  authenticateToken,
  requireRole(...adminRoles),
  (req, res) => {
    try {
      const productId = Number(req.params.id);
      const updatedProduct = updateProductColdChainConfig(
        productId,
        req.user.organization_id,
        req.body || {},
        req.user.role,
      );
      return res.json({
        message: "Cập nhật cấu hình ngưỡng chuỗi lạnh thành công.",
        product: updatedProduct,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  },
);

/**
 * GET /api/v1/products/:id/cold-chain-config
 * Lấy thông tin cấu hình ngưỡng chuỗi lạnh của sản phẩm.
 */
router.get("/products/:id/cold-chain-config", authenticateToken, (req, res) => {
  try {
    const config = getProductColdChainConfig(Number(req.params.id));
    return res.json(config);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
});

/**
 * T-93: POST /api/v1/telemetry/temperature
 * Public Telemetry Ingestion API - Nhận luồng dữ liệu cảm biến IoT từ xe vận chuyển.
 * Hỗ trợ cả request unauthenticated (cảm biến xe) và authenticated.
 */
router.post("/telemetry/temperature", (req, res) => {
  try {
    const actorId = req.user?.id || null;
    const result = ingestTemperatureTelemetry(req.body, { actorId });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
});

/**
 * T-100: GET /api/v1/batches/:id/temperature-history
 * Lấy chuỗi lịch sử nhiệt độ theo lô hàng / hành trình xe để vẽ biểu đồ và phân tích vi phạm.
 */
router.get("/batches/:id/temperature-history", authenticateToken, (req, res) => {
  try {
    const batchId = Number(req.params.id);
    const data = getBatchTemperatureHistory(batchId);
    return res.json(data);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
});

/**
 * POST /api/v1/batches/:id/evaluate-cold-chain
 * Chủ động kích hoạt thuật toán đánh giá vi phạm chuỗi lạnh cho một lô hàng.
 */
router.post(
  "/batches/:id/evaluate-cold-chain",
  authenticateToken,
  requireRole(...adminRoles),
  (req, res) => {
    try {
      const batchId = Number(req.params.id);
      const evalResult = evaluateBatchColdChain(batchId, { actorId: req.user.id });
      if (!evalResult) {
        return res.status(404).json({ message: "Không tìm thấy lô hàng." });
      }
      return res.json({
        message: "Đánh giá chuỗi lạnh hoàn tất.",
        evaluation: evalResult,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  },
);

/**
 * T-104 & T-105: POST /api/v1/cold-chain/maintenance/archive
 * Kích hoạt nén và lưu trữ log cũ (> 30 ngày) vào kho lưu trữ lịch sử để giữ CSDL chính luôn nhẹ.
 */
router.post(
  "/cold-chain/maintenance/archive",
  authenticateToken,
  requireRole(...adminRoles),
  (req, res) => {
    try {
      const daysOld = req.body?.daysOld !== undefined ? Number(req.body.daysOld) : 30;
      const result = archiveOldTemperatureLogs(daysOld);
      return res.json({
        message: `Đã hoàn tất nén và chuyển ${result.archivedCount} log cũ (> ${daysOld} ngày) sang bảng lưu trữ.`,
        details: result,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  },
);

/**
 * POST /api/v1/cold-chain/maintenance/aggregate
 * Chỉ nén (aggregate) theo giờ mà không xóa raw log.
 */
router.post(
  "/cold-chain/maintenance/aggregate",
  authenticateToken,
  requireRole(...adminRoles),
  (req, res) => {
    try {
      const daysOld = req.body?.daysOld !== undefined ? Number(req.body.daysOld) : 30;
      const result = aggregateOldTemperatureLogs(daysOld);
      return res.json({
        message: `Đã nén ${result.aggregatedCount} khung giờ dữ liệu lịch sử (> ${daysOld} ngày).`,
        details: result,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  },
);

/**
 * GET /api/v1/cold-chain/overview
 * Thống kê tổng quan chuỗi lạnh phục vụ Dashboard.
 */
router.get("/cold-chain/overview", authenticateToken, (req, res) => {
  try {
    const overview = getColdChainOverview(req.user.organization_id, req.user.role);
    return res.json(overview);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
});

export default router;
