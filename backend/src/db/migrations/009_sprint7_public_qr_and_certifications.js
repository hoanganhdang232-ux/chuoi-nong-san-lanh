/**
 * DB Migration 009: Sprint 7 - Public QR Trace & Certifications
 * T-107: Add public_code to batches for public trace URLs
 * T-122: Create certifications table and add photos_json, soil_type to land_plots
 */
import crypto from "node:crypto";

export function generatePublicCode(batchId) {
  const randomSuffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TRC-${String(batchId).padStart(4, "0")}-${randomSuffix}`;
}

export function up(db) {
  // 1. T-107: Add public_code to batches
  const batchCols = db
    .prepare("PRAGMA table_info(batches)")
    .all()
    .map((col) => col.name);

  if (!batchCols.includes("public_code")) {
    db.exec("ALTER TABLE batches ADD COLUMN public_code TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_public_code ON batches(public_code)");

    // Backfill existing batches with unique public codes
    const existingBatches = db.prepare("SELECT id, batch_code FROM batches WHERE public_code IS NULL").all();
    const updateStmt = db.prepare("UPDATE batches SET public_code = ? WHERE id = ?");

    for (const b of existingBatches) {
      // Create clean deterministic yet unique public code
      const hash = crypto.createHash("sha256").update(`${b.batch_code}-${b.id}`).digest("hex").slice(0, 8).toUpperCase();
      const code = `TRC-${hash}`;
      updateStmt.run(code, b.id);
    }
  }

  // 2. T-122: Add photos_json, soil_type to land_plots
  const plotCols = db
    .prepare("PRAGMA table_info(land_plots)")
    .all()
    .map((col) => col.name);

  if (!plotCols.includes("photos_json")) {
    db.exec("ALTER TABLE land_plots ADD COLUMN photos_json TEXT");
  }
  if (!plotCols.includes("soil_type")) {
    db.exec("ALTER TABLE land_plots ADD COLUMN soil_type TEXT DEFAULT 'Đất đỏ bazan phì nhiêu'");
  }
  if (!plotCols.includes("certification_code")) {
    db.exec("ALTER TABLE land_plots ADD COLUMN certification_code TEXT");
  }

  // 3. T-122: Certifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS certifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      standard TEXT NOT NULL CHECK(standard IN ('VietGAP', 'GlobalGAP', 'OCOP', 'Organic', 'HACCP', 'ISO22000')),
      issuer TEXT NOT NULL,
      organization_id INTEGER,
      farm_id INTEGER,
      product_id INTEGER,
      land_plot_id INTEGER,
      issue_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'VALID' CHECK(status IN ('VALID', 'EXPIRED', 'SUSPENDED')),
      certificate_file_url TEXT,
      seal_icon TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (farm_id) REFERENCES farms(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (land_plot_id) REFERENCES land_plots(id)
    );
    CREATE INDEX IF NOT EXISTS idx_certifications_prod ON certifications(product_id);
    CREATE INDEX IF NOT EXISTS idx_certifications_farm ON certifications(farm_id);
    CREATE INDEX IF NOT EXISTS idx_certifications_plot ON certifications(land_plot_id);
    CREATE INDEX IF NOT EXISTS idx_certifications_std ON certifications(standard);
  `);

  // 4. Seed demo certifications if none exist
  const certCount = db.prepare("SELECT COUNT(*) AS count FROM certifications").get().count;
  const org = db.prepare("SELECT id FROM organizations LIMIT 1").get();
  const farm = db.prepare("SELECT id FROM farms LIMIT 1").get();
  const prod = db.prepare("SELECT id FROM products LIMIT 1").get();
  const plot = db.prepare("SELECT id FROM land_plots LIMIT 1").get();

  if (certCount === 0 && org && farm && prod) {

    const insertCert = db.prepare(`
      INSERT INTO certifications (
        code, name, standard, issuer, organization_id, farm_id, product_id, land_plot_id,
        issue_date, expiry_date, status, certificate_file_url, seal_icon, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertCert.run(
      "VIETGAP-2026-LD-0881",
      "Chứng nhận Thực hành Nông nghiệp Tốt (VietGAP Trồng trọt)",
      "VietGAP",
      "Trung tâm Giám định & Chứng nhận Nông nghiệp Quốc gia",
      org?.id || 1,
      farm?.id || 1,
      prod?.id || 1,
      plot?.id || 1,
      "2025-01-15",
      "2028-01-15",
      "VALID",
      "/certificates/vietgap-cert-0881.pdf",
      "vietgap_seal.svg",
      "Đạt chuẩn VietGAP theo TCVN 11892-1:2017 về kiểm soát dư lượng thuốc BVTV, vi sinh vật và kim loại nặng.",
    );

    insertCert.run(
      "GLOBALGAP-GGN-405988",
      "Tiêu chuẩn Nông nghiệp Toàn cầu GlobalG.A.P IFA v5.4",
      "GlobalGAP",
      "Control Union Certifications Vietnam",
      org?.id || 1,
      farm?.id || 1,
      prod?.id || 1,
      plot?.id || 1,
      "2025-03-20",
      "2027-03-20",
      "VALID",
      "/certificates/globalgap-ggn-405988.pdf",
      "globalgap_seal.svg",
      "Đạt tiêu chuẩn an toàn thực phẩm toàn cầu, an toàn lao động và bảo tồn đa dạng sinh học.",
    );

    insertCert.run(
      "OCOP-4STAR-LD-2026",
      "Chứng nhận Sản phẩm OCOP 4 Sao Tỉnh Lâm Đồng",
      "OCOP",
      "Ủy ban Nhân dân Tỉnh Lâm Đồng - Hội đồng Đánh giá OCOP",
      org?.id || 1,
      farm?.id || 1,
      prod?.id || 1,
      plot?.id || 1,
      "2025-06-10",
      "2028-06-10",
      "VALID",
      "/certificates/ocop-4star-ld.pdf",
      "ocop_seal.svg",
      "Sản phẩm nông sản đặc trưng chất lượng cao, thương hiệu địa phương tiêu biểu.",
    );

    // Update land plots with realistic rich photos
    if (plot) {
      const demoPhotos = JSON.stringify([
        {
          title: "Toàn cảnh thửa đất canh tác thông minh",
          caption: "Khu vực nhà màng công nghệ cao ứng dụng tưới nhỏ giọt Israel",
          url: "https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?auto=format&fit=crop&w=1200&q=80",
          thumbnail: "https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?auto=format&fit=crop&w=400&q=80",
        },
        {
          title: "Vùng trồng nông sản chuẩn VietGAP",
          caption: "Đất đỏ bazan tầng dày, nguồn nước giếng ngầm kiểm định định kỳ",
          url: "https://images.unsplash.com/photo-1592417817098-8f3d6910985c?auto=format&fit=crop&w=1200&q=80",
          thumbnail: "https://images.unsplash.com/photo-1592417817098-8f3d6910985c?auto=format&fit=crop&w=400&q=80",
        },
        {
          title: "Kiểm tra dư lượng & Thu hoạch thủ công",
          caption: "Kỹ sư nông nghiệp lấy mẫu kiểm tra trước thời điểm thu hoạch 3 ngày",
          url: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=1200&q=80",
          thumbnail: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=400&q=80",
        },
      ]);

      db.prepare(
        "UPDATE land_plots SET photos_json = ?, soil_type = ?, certification_code = ? WHERE id = ?",
      ).run(demoPhotos, "Đất đỏ Bazan Feralit phì nhiêu, pH 6.2", "VIETGAP-2026-LD-0881", plot.id);
    }
  }
}

export function down(db) {
  db.exec("DROP TABLE IF EXISTS certifications;");
}
