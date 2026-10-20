import { Router } from "express";
import { getDb } from "../db/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();

// Lấy danh sách trang trại của tổ chức
router.get("/", authenticateToken, (req, res) => {
  const rows = getDb()
    .prepare("SELECT * FROM farms WHERE organization_id = ? ORDER BY id DESC")
    .all(req.user.organization_id);
  res.json(rows);
});

// Thêm trang trại mới
router.post(
  "/",
  authenticateToken,
  requireRole("farm_admin"),
  (req, res) => {
    const { name, address, latitude, longitude } = req.body;
    if (!name) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp tên trang trại." });
    }

    const db = getDb();
    try {
      const result = db
        .prepare(
          "INSERT INTO farms (organization_id, name, address, latitude, longitude) VALUES (?, ?, ?, ?, ?)"
        )
        .run(
          req.user.organization_id,
          name,
          address || null,
          latitude || null,
          longitude || null
        );

      res.status(201).json({
        message: "Thêm trang trại thành công.",
        farm: {
          id: result.lastInsertRowid,
          organization_id: req.user.organization_id,
          name,
          address,
          latitude,
          longitude,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Lỗi khi thêm trang trại." });
    }
  }
);

// Cập nhật trang trại
router.put(
  "/:id",
  authenticateToken,
  requireRole("farm_admin"),
  (req, res) => {
    const { name, address, latitude, longitude } = req.body;
    const farmId = Number(req.params.id);

    if (!name) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp tên trang trại." });
    }

    const db = getDb();
    try {
      const result = db
        .prepare(
          "UPDATE farms SET name = ?, address = ?, latitude = ?, longitude = ? WHERE id = ? AND organization_id = ?"
        )
        .run(
          name,
          address || null,
          latitude || null,
          longitude || null,
          farmId,
          req.user.organization_id
        );

      if (result.changes === 0) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy trang trại hoặc không có quyền." });
      }

      res.json({ message: "Cập nhật trang trại thành công." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Lỗi khi cập nhật trang trại." });
    }
  }
);

// Xóa trang trại
router.delete(
  "/:id",
  authenticateToken,
  requireRole("farm_admin"),
  (req, res) => {
    const farmId = Number(req.params.id);
    const db = getDb();

    try {
      // Kiểm tra ràng buộc
      const inUseLandPlot = db
        .prepare("SELECT 1 FROM land_plots WHERE farm_id = ? LIMIT 1")
        .get(farmId);
      const inUseBatch = db
        .prepare("SELECT 1 FROM batches WHERE source_farm_id = ? LIMIT 1")
        .get(farmId);

      if (inUseLandPlot || inUseBatch) {
        return res
          .status(400)
          .json({
            message: "Không thể xóa trang trại đã có thửa đất hoặc lô hàng.",
          });
      }

      const result = db
        .prepare("DELETE FROM farms WHERE id = ? AND organization_id = ?")
        .run(farmId, req.user.organization_id);

      if (result.changes === 0) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy trang trại hoặc không có quyền." });
      }

      res.json({ message: "Xóa trang trại thành công." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Lỗi khi xóa trang trại." });
    }
  }
);

export default router;
