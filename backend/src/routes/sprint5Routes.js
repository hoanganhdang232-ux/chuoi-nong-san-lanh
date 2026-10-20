import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  createRecall,
  listRecalls,
  getRecallAffectedBatches,
  quarantineBatch,
  exportRecallCsv,
} from "../services/sprint5RecallService.js";
import { registerSseClient } from "../services/sseService.js";
import {
  listUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../services/notificationService.js";

const router = Router();
const adminRoles = ["farm_admin", "processor_admin", "distributor_admin"];

// ─── T-83: REAL-TIME SSE STREAM ──────────────────────────────────────────────
/**
 * GET /api/v1/recalls/stream
 * Endpoint Server-Sent Events (SSE) để cập nhật thời gian thực.
 */
router.get("/recalls/stream", (req, res) => {
  registerSseClient(req, res);
});

// Các endpoint dưới đây yêu cầu xác thực JWT
router.use(authenticateToken);

// ─── [SCRUM-169] LỆNH THU HỒI LÔ HÀNG (T-71) ─────────────────────────────────
/**
 * POST /api/v1/recalls
 * Tạo lệnh thu hồi khẩn cấp đối với một lô hàng gốc và toàn bộ hậu duệ.
 */
router.post(
  "/recalls",
  requireRole(...adminRoles, "auditor"),
  (req, res) => {
    try {
      const rootBatchId = Number(req.body?.rootBatchId ?? req.body?.root_batch_id);
      const reason = req.body?.reason;

      const recall = createRecall({
        rootBatchId,
        reason,
        actorId: req.user.id,
        organizationId: req.user.organization_id,
        userRole: req.user.role,
      });

      return res.status(201).json({
        message: "Kích hoạt lệnh thu hồi thành công.",
        recall,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  },
);

/**
 * GET /api/v1/recalls
 * Lấy danh sách các lệnh thu hồi và summary tiến độ.
 */
router.get(
  "/recalls",
  requireRole(...adminRoles, "auditor"),
  (req, res) => {
    try {
      const list = listRecalls(req.user.organization_id, req.user.role);
      return res.json(list);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.message });
    }
  },
);

// ─── [SCRUM-171] QUẢN LÝ VỊ TRÍ & TỒN KHO LÔ THU HỒI (T-76 & T-78) ────────────
/**
 * GET /api/v1/recalls/:id/affected-batches
 * Summary vị trí kho/cửa hàng/tổ chức giữ lô, số lượng tồn và đã bán.
 */
router.get(
  "/recalls/:id/affected-batches",
  requireRole(...adminRoles, "auditor"),
  (req, res) => {
    try {
      const recallId = Number(req.params.id);
      if (!Number.isSafeInteger(recallId) || recallId <= 0) {
        return res.status(400).json({ message: "ID lệnh thu hồi không hợp lệ." });
      }

      const data = getRecallAffectedBatches(
        recallId,
        req.user.organization_id,
        req.user.role,
      );

      return res.json(data);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.message });
    }
  },
);

/**
 * GET /api/v1/recalls/:id/export
 * Xuất danh sách các lô thuộc lệnh thu hồi ra file CSV (T-78).
 */
router.get(
  ["/recalls/:id/export", "/recalls/:id/export-csv"],
  requireRole(...adminRoles, "auditor"),
  (req, res) => {
    try {
      const recallId = Number(req.params.id);
      const csv = exportRecallCsv(recallId);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="recall-${recallId}-report.csv"`,
      );
      return res.send(csv);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.message });
    }
  },
);

// ─── [SCRUM-172] NIÊM PHONG & CÁCH LY LÔ HÀNG (T-79 & T-81) ───────────────────
/**
 * POST /api/v1/batches/:id/quarantine
 * Xác nhận niêm phong và cách ly lô hàng tại tổ chức đang giữ hàng.
 */
router.post(
  "/batches/:id/quarantine",
  requireRole(...adminRoles, "auditor"),
  (req, res) => {
    try {
      const batchId = Number(req.params.id);
      if (!Number.isSafeInteger(batchId) || batchId <= 0) {
        return res.status(400).json({ message: "ID lô hàng không hợp lệ." });
      }

      const quarantineLocation = req.body?.quarantineLocation ?? req.body?.quarantine_location;

      const result = quarantineBatch({
        batchId,
        quarantineLocation,
        actorId: req.user.id,
        userOrgId: req.user.organization_id,
        userRole: req.user.role,
      });

      return res.json(result);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  },
);

// ─── [SCRUM-174] THÔNG BÁO IN-APP (T-85) ─────────────────────────────────────
/**
 * GET /api/v1/notifications
 * Lấy danh sách thông báo in-app của người dùng đang đăng nhập kèm unreadCount.
 */
router.get("/notifications", (req, res) => {
  try {
    const data = listUserNotifications(req.user.id, req.query.limit || 50);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Đánh dấu một thông báo đã đọc.
 */
router.patch("/notifications/:id/read", (req, res) => {
  try {
    const data = markNotificationRead(req.params.id, req.user.id);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/**
 * PATCH & POST /api/v1/notifications/read-all
 * Đánh dấu tất cả thông báo của người dùng đã đọc.
 */
router.all(["/notifications/read-all", "/notifications/mark-all-read"], (req, res) => {
  if (req.method !== "POST" && req.method !== "PATCH") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  try {
    const data = markAllNotificationsRead(req.user.id);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
