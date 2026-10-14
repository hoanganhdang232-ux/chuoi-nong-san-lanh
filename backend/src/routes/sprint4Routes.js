import { Router } from "express";
import { getDb } from "../db/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import {
  getForwardDescendants,
  buildLineageGraph,
} from "../services/lineageService.js";
import { consumeBatch } from "../services/consumeService.js";
import {
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  assignBatchToLocation,
} from "../services/locationService.js";
import { batchSplitMergeService } from "../services/batchSplitMergeService.js";
import { listAuditLogs } from "../services/auditLogService.js";
import {
  importProductsFromCSV,
  importLandPlotsFromCSV,
  MAX_FILE_SIZE_BYTES,
} from "../services/csvImportService.js";

const router = Router();
const adminRoles = ["farm_admin", "processor_admin", "distributor_admin"];

// Apply authentication to Sprint 4 endpoints while allowing unknown paths to pass through to 404 handler
router.use(
  ["/batches", "/locations", "/audit-logs", "/import", "/imports"],
  authenticateToken,
);

// ─── STORY 1: S-26 & S-27 (Truy xuôi phả hệ & Chi tiết hậu duệ) ──────────────

/**
 * GET /batches/:id/descendants
 * Duyệt đồ thị xuôi BFS từ lô gốc, tìm mọi hậu duệ qua các tầng tách/gộp.
 * Chống lặp vô hạn, batch query tối ưu < 2s với 1000 lô.
 */
router.get("/batches/:id/descendants", (req, res) => {
  const batchId = Number(req.params.id);
  if (!Number.isSafeInteger(batchId) || batchId <= 0) {
    return res.status(400).json({ message: "ID lô hàng không hợp lệ." });
  }

  const db = getDb();
  const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
  if (!batch) {
    return res.status(404).json({ message: "Không tìm thấy lô hàng." });
  }

  // Auditor xem được mọi lô; các vai trò khác chỉ xem lô thuộc tổ chức mình
  if (req.user.role !== "auditor" && batch.organization_id !== req.user.organization_id) {
    return res.status(403).json({ message: "Bạn không có quyền xem phả hệ lô hàng này." });
  }

  const result = getForwardDescendants(batchId);

  return res.json({
    root_batch_id: batchId,
    root_batch_code: batch.batch_code,
    total_descendants: result.descendants.length,
    cycle_detected: result.cycleDetected,
    descendants: result.descendants,
  });
});

// ─── STORY 2: S-28 (Sơ đồ phả hệ dạng cây / đồ thị) ──────────────────────────

/**
 * GET /batches/:id/lineage-graph
 * Trả về cấu trúc nodes/edges chuẩn JSON cho Frontend vẽ đồ thị.
 * Nodes: ancestors (trái) | current (giữa) | descendants (phải).
 * Hỗ trợ has_children / expanded.
 */
router.get("/batches/:id/lineage-graph", (req, res) => {
  const batchId = Number(req.params.id);
  if (!Number.isSafeInteger(batchId) || batchId <= 0) {
    return res.status(400).json({ message: "ID lô hàng không hợp lệ." });
  }

  const db = getDb();
  const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
  if (!batch) {
    return res.status(404).json({ message: "Không tìm thấy lô hàng." });
  }

  if (req.user.role !== "auditor" && batch.organization_id !== req.user.organization_id) {
    return res.status(403).json({ message: "Bạn không có quyền xem sơ đồ phả hệ lô hàng này." });
  }

  const graph = buildLineageGraph(batchId);
  if (!graph) {
    return res.status(404).json({ message: "Không tìm thấy lô hàng." });
  }

  return res.json(graph);
});

// ─── STORY 3: S-29 (Ghi nhận lô đã bán hết / tiêu thụ) ───────────────────────

/**
 * POST /batches/:id/consume
 * Nhà phân phối hoặc tổ chức đang giữ lô ghi nhận lô đã bán hết/tiêu thụ.
 * Cập nhật remaining_quantity = 0, status = 'consumed'.
 * Ghi sự kiện 'batch_consumed' vào Hash Chain bảo đảm toàn vẹn.
 */
router.post(
  "/batches/:id/consume",
  requireRole(...adminRoles),
  (req, res) => {
    try {
      const result = consumeBatch({
        batchId: Number(req.params.id),
        organizationId: req.user.organization_id,
        actorId: req.user.id,
        note: req.body?.note,
      });
      return res.json(result);
    } catch (err) {
      const status = err.statusCode || 500;
      return res.status(status).json({ message: err.message });
    }
  },
);

// ─── STORY 4: S-30 (Chia lô về từng cửa hàng nội bộ) ─────────────────────────

/**
 * GET /locations
 * Liệt kê địa điểm/cửa hàng của tổ chức.
 */
router.get("/locations", (req, res) => {
  try {
    const locations = listLocations(req.user.organization_id);
    return res.json(locations);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ message: err.message });
  }
});

/**
 * POST /locations
 * Thêm mới địa điểm/cửa hàng cho tổ chức.
 */
router.post("/locations", requireRole(...adminRoles), (req, res) => {
  try {
    const location = createLocation({
      organizationId: req.user.organization_id,
      name: req.body?.name,
      address: req.body?.address,
    });
    return res.status(201).json({ message: "Tạo địa điểm thành công.", location });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
});

/**
 * PUT /locations/:id
 * Cập nhật địa điểm/cửa hàng.
 */
router.put("/locations/:id", requireRole(...adminRoles), (req, res) => {
  try {
    const location = updateLocation({
      id: Number(req.params.id),
      organizationId: req.user.organization_id,
      name: req.body?.name,
      address: req.body?.address,
    });
    return res.json({ message: "Cập nhật địa điểm thành công.", location });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
});

/**
 * DELETE /locations/:id
 * Xóa địa điểm/cửa hàng.
 */
router.delete("/locations/:id", requireRole(...adminRoles), (req, res) => {
  try {
    const result = deleteLocation({
      id: Number(req.params.id),
      organizationId: req.user.organization_id,
    });
    return res.json({ message: "Xóa địa điểm thành công.", ...result });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
});

/** Split a distributor batch into child lots assigned to its own stores. */
router.post("/locations/distribute-batch", requireRole("distributor_admin"), async (req, res) => {
  const batchId = Number(req.body?.batchId ?? req.body?.batch_id);
  const allocations = req.body?.allocations;
  if (!Number.isSafeInteger(batchId) || batchId <= 0) {
    return res.status(400).json({ message: "ID lô hàng không hợp lệ." });
  }
  if (!Array.isArray(allocations) || allocations.length < 2) {
    return res.status(400).json({ message: "Hãy phân bổ lô cho ít nhất hai cửa hàng." });
  }
  const locationIds = allocations.map((item) => Number(item?.locationId));
  if (
    locationIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(locationIds).size !== locationIds.length
  ) {
    return res.status(400).json({ message: "Mỗi cửa hàng chỉ được chọn một lần trong đợt chia lô." });
  }

  try {
    const result = await batchSplitMergeService.splitBatch({
      parentBatchId: batchId,
      allocations,
      actorId: req.user.id,
      organizationId: req.user.organization_id,
    });
    return res.json({
      message: `Đã chia lô cho ${result.children.length} cửa hàng.`,
      ...result,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ message: err.message });
  }
});

/**
 * POST /batches/:id/assign-location
 * Gán/chuyển lô về một địa điểm cụ thể (nội bộ tổ chức, không cần 2-phase confirmation).
 * Ghi sự kiện 'location_assigned' vào hash chain.
 */
router.post(
  "/batches/:id/assign-location",
  requireRole(...adminRoles),
  (req, res) => {
    const batchId = Number(req.params.id);
    const locationId = Number(req.body?.locationId ?? req.body?.location_id);

    if (!Number.isSafeInteger(batchId) || batchId <= 0) {
      return res.status(400).json({ message: "ID lô hàng không hợp lệ." });
    }
    if (!Number.isSafeInteger(locationId) || locationId <= 0) {
      return res.status(400).json({ message: "ID địa điểm không hợp lệ." });
    }

    try {
      const result = assignBatchToLocation({
        batchId,
        locationId,
        actorId: req.user.id,
        organizationId: req.user.organization_id,
      });
      return res.json({
        message: "Đã gán lô hàng về địa điểm thành công.",
        ...result,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
  },
);

// ─── STORY 5: S-31 (Nhật ký thao tác - Audit Log) ────────────────────────────

/**
 * GET /audit-logs
 * Xem nhật ký thao tác hệ thống dành cho tài khoản Admin / Auditor.
 * Phân trang: ?page=1&limit=50
 * Lọc: ?userId=&organizationId=&action=&resourceType=&startDate=&endDate=
 */
router.get(
  "/audit-logs",
  requireRole("auditor", "farm_admin", "processor_admin", "distributor_admin"),
  (req, res) => {
    // Nếu không phải auditor, chỉ xem log của tổ chức mình
    const orgId = req.user.role === "auditor"
      ? (req.query.organizationId ? Number(req.query.organizationId) : undefined)
      : req.user.organization_id;

    const result = listAuditLogs({
      page: req.query.page,
      limit: req.query.limit,
      userId: req.query.userId,
      organizationId: orgId,
      action: req.query.action,
      resourceType: req.query.resourceType,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    return res.json(result);
  },
);

// ─── STORY 6: S-32 (Nhập danh mục sản phẩm & thửa đất từ file CSV) ───────────

/**
 * Helper trích xuất CSV content từ request (hỗ trợ cả JSON body lẫn raw text/csv)
 */
function extractCsvFromRequest(req) {
  if (typeof req.body === "string") {
    return { csvContent: req.body, fileSize: Buffer.byteLength(req.body, "utf8") };
  }
  const csvContent = req.body?.csvContent ?? req.body?.csv ?? req.body?.content;
  const fileSize = req.body?.fileSize ? Number(req.body.fileSize) : (csvContent ? Buffer.byteLength(csvContent, "utf8") : 0);
  return { csvContent, fileSize };
}

/**
 * POST /import/products (and /imports/products)
 * Import danh mục sản phẩm từ CSV (All-or-Nothing trong 1 transaction).
 */
const handleImportProducts = (req, res) => {
  const { csvContent, fileSize } = extractCsvFromRequest(req);
  if (!csvContent || typeof csvContent !== "string") {
    return res.status(400).json({ message: "Nội dung CSV (csvContent) là bắt buộc." });
  }
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return res.status(400).json({
      message: `File quá lớn. Giới hạn tối đa là ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`,
    });
  }

  try {
    const result = importProductsFromCSV({
      csvContent,
      organizationId: req.user.organization_id,
      fileSize,
    });
    const statusCode = result.success ? 200 : 422;
    return res.status(statusCode).json(result);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
};

router.post("/import/products", requireRole(...adminRoles), handleImportProducts);
router.post("/imports/products", requireRole(...adminRoles), handleImportProducts);

/**
 * POST /import/land-plots (and /imports/land-plots)
 * Import thửa đất từ CSV (All-or-Nothing trong 1 transaction).
 */
const handleImportLandPlots = (req, res) => {
  const { csvContent, fileSize } = extractCsvFromRequest(req);
  if (!csvContent || typeof csvContent !== "string") {
    return res.status(400).json({ message: "Nội dung CSV (csvContent) là bắt buộc." });
  }
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return res.status(400).json({
      message: `File quá lớn. Giới hạn tối đa là ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`,
    });
  }

  try {
    const result = importLandPlotsFromCSV({
      csvContent,
      organizationId: req.user.organization_id,
      fileSize,
    });
    const statusCode = result.success ? 200 : 422;
    return res.status(statusCode).json(result);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ message: err.message });
  }
};

router.post("/import/land-plots", requireRole("farm_admin"), handleImportLandPlots);
router.post("/imports/land-plots", requireRole("farm_admin"), handleImportLandPlots);

export default router;
