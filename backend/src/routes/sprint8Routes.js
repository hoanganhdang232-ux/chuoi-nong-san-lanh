/**
 * SCRUM Sprint 8 Routes:
 * - T-124: Inspector Inspection API
 * - T-128: PDF Dossier Export API
 * - T-129: Transporter Cold Chain Violations Analytics
 * - T-131 / T-132: System Integrity Scanner & History
 * - T-133 / T-134: ND 13/2023 Data Anonymization Engine
 */
import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { getInspectorTrace } from "../services/sprint8InspectorService.js";
import { generateInspectionDossierPdf } from "../services/sprint8PdfService.js";
import { getTransporterViolationStats } from "../services/sprint8AnalyticsService.js";
import { runSystemIntegrityScan, getIntegrityRunHistory } from "../services/sprint8IntegrityWorker.js";
import { anonymizeFarmerData, getAnonymizationRequests } from "../services/sprint8PrivacyService.js";
import { getDb } from "../db/database.js";

const router = Router();

const inspectorOrAuditorRoles = [
  "auditor",
  "inspector",
  "farm_admin",
  "processor_admin",
  "distributor_admin",
];

/**
 * T-124: GET /api/v1/inspector/trace/:batch_code
 * Tra cứu toàn diện hồ sơ lô hàng liên tổ chức cho cán bộ kiểm tra
 */
router.get(
  "/inspector/trace/:batch_code",
  authenticateToken,
  requireRole(...inspectorOrAuditorRoles),
  (req, res) => {
    try {
      const batchCode = req.params.batch_code;
      const dossier = getInspectorTrace(batchCode);
      return res.status(200).json(dossier);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  },
);

/**
 * T-128: GET /api/v1/inspector/export-pdf/:batch_code
 * Xuất hồ sơ kiểm tra đầy đủ dạng PDF kèm con dấu xác thực Hash Chain (VALID/INVALID)
 */
router.get(
  "/inspector/export-pdf/:batch_code",
  authenticateToken,
  requireRole(...inspectorOrAuditorRoles),
  async (req, res) => {
    try {
      const batchCode = req.params.batch_code;
      const actorName = req.user?.name || "Cán bộ kiểm tra";
      const actorRole = req.user?.role === "auditor" || req.user?.role === "inspector"
        ? "Cán bộ thanh tra an toàn chuỗi lạnh"
        : "Quản trị viên hệ thống";

      const pdfBuffer = await generateInspectionDossierPdf(batchCode, { actorName, actorRole });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Ho_So_Kiem_Tra_${encodeURIComponent(batchCode)}.pdf"`,
      );
      res.setHeader("Content-Length", pdfBuffer.length);
      return res.end(pdfBuffer);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  },
);

/**
 * T-129: GET /api/v1/analytics/transporter-violations
 * Thống kê tỷ lệ vi phạm chuỗi lạnh theo đơn vị vận chuyển / nhà xe
 */
router.get(
  "/analytics/transporter-violations",
  authenticateToken,
  (req, res) => {
    try {
      const { startDate, endDate, sortBy } = req.query;
      const stats = getTransporterViolationStats({ startDate, endDate, sortBy });
      return res.status(200).json(stats);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  },
);

/**
 * GET /api/v1/transporters
 * Lấy danh sách các đơn vị vận tải chuyên dụng
 */
router.get("/transporters", authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const transporters = db
      .prepare(
        "SELECT id, code, name, contact_phone, license_plate, temperature_control_type, is_active FROM transporters WHERE is_active = 1 ORDER BY id ASC",
      )
      .all();
    return res.status(200).json(transporters);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/**
 * T-131 & T-132: POST /api/v1/system/run-integrity-check
 * Kích hoạt quét toàn vẹn Hash Chain toàn hệ thống thủ công
 */
router.post(
  "/system/run-integrity-check",
  authenticateToken,
  requireRole(...inspectorOrAuditorRoles),
  (req, res) => {
    try {
      const result = runSystemIntegrityScan({
        actorId: req.user.id,
        triggeredBy: req.user.name ? `ADMIN_${req.user.name}` : "MANUAL_ADMIN",
      });
      return res.status(200).json(result);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.message });
    }
  },
);

/**
 * T-132: GET /api/v1/system/integrity-runs
 * Lịch sử các lần quét toàn vẹn Hash Chain
 */
router.get(
  "/system/integrity-runs",
  authenticateToken,
  requireRole(...inspectorOrAuditorRoles),
  (req, res) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const offset = Number(req.query.offset) || 0;
      const history = getIntegrityRunHistory({ limit, offset });
      return res.status(200).json(history);
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  },
);

/**
 * T-133 & T-134: POST /api/v1/privacy/anonymize-farmer
 * Ẩn danh hóa thông tin cá nhân nông hộ tuân thủ Nghị định 13/2023/NĐ-CP
 */
router.post(
  "/privacy/anonymize-farmer",
  authenticateToken,
  requireRole(...inspectorOrAuditorRoles),
  (req, res) => {
    try {
      const { targetType, targetId, reason } = req.body || {};
      const result = anonymizeFarmerData({
        targetType: targetType || "farmer",
        targetId,
        reason,
        requestedBy: req.user.id,
      });
      return res.status(200).json(result);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  },
);

/**
 * T-133: GET /api/v1/privacy/anonymization-requests
 * Danh sách các yêu cầu ẩn danh hóa dữ liệu NĐ 13/2023
 */
router.get(
  "/privacy/anonymization-requests",
  authenticateToken,
  requireRole(...inspectorOrAuditorRoles),
  (req, res) => {
    try {
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;
      const requests = getAnonymizationRequests({ limit, offset });
      return res.status(200).json(requests);
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  },
);

export default router;
