import { Router } from "express";
import { getDb } from "../db/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { buildAuditReport, anonymizeOldData } from "../services/auditService.js";
import {
  getTemperatureHistory,
  recordTemperatureSeries,
  cleanupTemperatureLogs,
} from "../services/coldChainService.js";
import {
  activateRecall,
  listRecallReports,
} from "../services/recallService.js";
import { getPublicTrace } from "../services/publicTraceService.js";

const router = Router();
const adminRoles = ["farm_admin", "processor_admin", "distributor_admin"];

function scopeRecallReport(report, organizationId) {
  const items = report.items.filter(
    (item) => item.organization_id === organizationId,
  );
  return {
    ...report,
    items,
    totals: items.reduce(
      (totals, item) => ({
        remainingQuantity:
          totals.remainingQuantity + Number(item.remaining_quantity),
        consumedQuantity:
          totals.consumedQuantity + Number(item.consumed_quantity),
      }),
      { remainingQuantity: 0, consumedQuantity: 0 },
    ),
  };
}

router.get("/public/trace/:batchCode", (req, res) => {
  const trace = getPublicTrace(req.params.batchCode);
  if (!trace)
    return res.status(404).json({ message: "Không tìm thấy mã truy xuất." });
  return res.json(trace);
});

router.post(
  "/batches/:id/sensor-simulation",
  authenticateToken,
  requireRole(...adminRoles, "auditor"),
  (req, res) => {
    const batchId = Number(req.params.id);
    const batch = getDb()
      .prepare("SELECT * FROM batches WHERE id = ?")
      .get(batchId);
    if (
      !batch ||
      (req.user.role !== "auditor" &&
        batch.organization_id !== req.user.organization_id)
    ) {
      return res.status(404).json({ message: "Không tìm thấy lô hàng." });
    }

    const endAt = Date.now() - 60_000;
    const readings = Array.isArray(req.body?.readings)
      ? req.body.readings
      : Array.from({ length: 8 }, (_, index) => ({
          temperature: 9,
          timestamp: new Date(endAt - (7 - index) * 5 * 60_000).toISOString(),
        }));

    try {
      const result = recordTemperatureSeries({
        batchId,
        readings,
        actorId: req.user.id,
      });
      return res
        .status(201)
        .json({ ...result, readings: getTemperatureHistory(batchId) });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },
);

router.get("/batches/:id/temperature-logs", authenticateToken, (req, res) => {
  const batch = getDb()
    .prepare("SELECT id, organization_id FROM batches WHERE id = ?")
    .get(Number(req.params.id));
  if (
    !batch ||
    (req.user.role !== "auditor" &&
      batch.organization_id !== req.user.organization_id)
  ) {
    return res.status(404).json({ message: "Không tìm thấy lô hàng." });
  }
  return res.json(getTemperatureHistory(batch.id));
});

router.get("/batches/:id/cold-chain-alerts", authenticateToken, (req, res) => {
  const batch = getDb()
    .prepare("SELECT id, organization_id FROM batches WHERE id = ?")
    .get(Number(req.params.id));
  if (
    !batch ||
    (req.user.role !== "auditor" &&
      batch.organization_id !== req.user.organization_id)
  ) {
    return res.status(404).json({ message: "Không tìm thấy lô hàng." });
  }
  const alerts = getDb()
    .prepare(
      "SELECT id, batch_id, alert_type, message, started_at, detected_at, resolved_at FROM cold_chain_alerts WHERE batch_id = ? ORDER BY id DESC",
    )
    .all(batch.id);
  return res.json(alerts);
});

router.post(
  "/cold-chain/cleanup",
  authenticateToken,
  requireRole("auditor"), // Chỉ auditor (hệ thống) mới được quyền dọn dẹp data
  (req, res) => {
    try {
      const days = Number(req.body?.daysToKeep) || 30;
      const result = cleanupTemperatureLogs(days);
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);

router.post(
  "/recalls",
  authenticateToken,
  requireRole(...adminRoles, "auditor"),
  (req, res) => {
    const rootBatchId = Number(req.body?.rootBatchId);
    const root = getDb()
      .prepare("SELECT * FROM batches WHERE id = ?")
      .get(rootBatchId);
    if (!root)
      return res.status(404).json({ message: "Không tìm thấy lô gốc." });
    if (
      req.user.role !== "auditor" &&
      root.organization_id !== req.user.organization_id
    ) {
      return res.status(403).json({
        message:
          "Chỉ auditor hoặc quản trị viên của tổ chức đang giữ lô mới được thu hồi.",
      });
    }

    try {
      const report = activateRecall({
        rootBatchId,
        reason: req.body?.reason,
        actorId: req.user.id,
      });
      return res
        .status(201)
        .json(
          req.user.role === "auditor"
            ? report
            : scopeRecallReport(report, req.user.organization_id),
        );
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },
);

router.get(
  "/recalls",
  authenticateToken,
  requireRole(...adminRoles, "auditor"),
  (req, res) => {
    const reports = listRecallReports();
    if (req.user.role === "auditor") return res.json(reports);
    const scopedReports = reports
      .map((report) => scopeRecallReport(report, req.user.organization_id))
      .filter((report) => report.items.length > 0);
    return res.json(scopedReports);
  },
);

router.get("/notifications", authenticateToken, (req, res) => {
  const rows = getDb()
    .prepare(
      "SELECT id, kind, title, message, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100",
    )
    .all(req.user.id);
  return res.json(rows);
});

router.get(
  "/auditor/reports/:batchId",
  authenticateToken,
  requireRole(...adminRoles, "auditor"),
  (req, res) => {
    const batchId = Number(req.params.batchId);
    if (req.user.role !== "auditor") {
      const batch = getDb()
        .prepare("SELECT organization_id FROM batches WHERE id = ?")
        .get(batchId);
      if (!batch || batch.organization_id !== req.user.organization_id) {
        return res.status(404).json({ message: "Không tìm thấy lô hàng." });
      }
    }
    const report = buildAuditReport(
      batchId,
      req.user.organization_id,
      req.user.role === "auditor",
    );
    if (!report)
      return res.status(404).json({ message: "Không tìm thấy lô hàng." });
    return res.json(report);
  },
);

router.post(
  "/auditor/anonymize",
  authenticateToken,
  requireRole("auditor"),
  (req, res) => {
    try {
      const months = Number(req.body?.months) || 1;
      const result = anonymizeOldData(months);
      return res.json(result);
    } catch {
      return res.status(500).json({ message: "Lỗi hệ thống khi ẩn danh dữ liệu." });
    }
  }
);

router.get("/public/trace/:batchCode", (req, res) => {
  try {
    const traceData = getPublicTrace(req.params.batchCode);
    if (!traceData) {
      return res.status(404).json({ message: "Không tìm thấy dữ liệu truy xuất." });
    }
    return res.json(traceData);
  } catch {
    return res.status(500).json({ message: "Lỗi hệ thống khi tra cứu dữ liệu." });
  }
});

export default router;
