import { Router } from "express";
import { getDb } from "../db/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = Router();

// Lấy danh sách sản phẩm của tổ chức
router.get("/", authenticateToken, (req, res) => {
  const rows = getDb()
    .prepare("SELECT * FROM products WHERE organization_id = ? ORDER BY id DESC")
    .all(req.user.organization_id);
  res.json(rows);
});

// Thêm mới sản phẩm
router.post(
  "/",
  authenticateToken,
  requireRole("farm_admin", "processor_admin", "distributor_admin"),
  (req, res) => {
    const { name, unit } = req.body;
    if (!name || !unit) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp tên và đơn vị tính." });
    }

    const db = getDb();
    try {
      const result = db
        .prepare(
          "INSERT INTO products (organization_id, name, unit) VALUES (?, ?, ?)"
        )
        .run(req.user.organization_id, name, unit);

      res.status(201).json({
        message: "Thêm sản phẩm thành công.",
        product: {
          id: result.lastInsertRowid,
          organization_id: req.user.organization_id,
          name,
          unit,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Lỗi khi thêm sản phẩm." });
    }
  }
);

// Cập nhật sản phẩm
router.put(
  "/:id",
  authenticateToken,
  requireRole("farm_admin", "processor_admin", "distributor_admin"),
  (req, res) => {
    const { name, unit } = req.body;
    const productId = Number(req.params.id);

    if (!name || !unit) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp tên và đơn vị tính." });
    }

    const db = getDb();
    try {
      const result = db
        .prepare(
          "UPDATE products SET name = ?, unit = ? WHERE id = ? AND organization_id = ?"
        )
        .run(name, unit, productId, req.user.organization_id);

      if (result.changes === 0) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm hoặc không có quyền." });
      }

      res.json({ message: "Cập nhật sản phẩm thành công." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Lỗi khi cập nhật sản phẩm." });
    }
  }
);

// Xóa sản phẩm
router.delete(
  "/:id",
  authenticateToken,
  requireRole("farm_admin", "processor_admin", "distributor_admin"),
  (req, res) => {
    const productId = Number(req.params.id);
    const db = getDb();

    try {
      // Check if product is used in batches
      const inUse = db
        .prepare("SELECT 1 FROM batches WHERE product_id = ? LIMIT 1")
        .get(productId);
      if (inUse) {
        return res
          .status(400)
          .json({ message: "Không thể xóa sản phẩm đã có lô hàng." });
      }

      const result = db
        .prepare("DELETE FROM products WHERE id = ? AND organization_id = ?")
        .run(productId, req.user.organization_id);

      if (result.changes === 0) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm hoặc không có quyền." });
      }

      res.json({ message: "Xóa sản phẩm thành công." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Lỗi khi xóa sản phẩm." });
    }
  }
);

export default router;
