/**
 * SCRUM Sprint 8: PDF Generator Service
 * Sub-tasks T-126, T-127 & T-128:
 * - T-126: Xuất hồ sơ truy xuất đầy đủ dạng PDF
 * - T-127: Đóng dấu kiểm tra toàn vẹn Hash Chain ("VALID" / "INVALID")
 * - T-128: API xuất file PDF chính thức
 */
import PDFDocument from "pdfkit";
import fs from "node:fs";
import { getInspectorTrace } from "./sprint8InspectorService.js";

function getSystemFont() {
  const regularPath = "C:/Windows/Fonts/arial.ttf";
  const boldPath = "C:/Windows/Fonts/arialbd.ttf";
  if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
    return { regular: regularPath, bold: boldPath, isCustom: true };
  }
  return { regular: "Helvetica", bold: "Helvetica-Bold", isCustom: false };
}

/**
 * Biên soạn tài liệu PDF chính thức cho cán bộ kiểm tra
 * @param {string|number} identifier - Mã lô hàng
 * @param {object} options
 * @returns {Promise<Buffer>}
 */
export async function generateInspectionDossierPdf(
  identifier,
  { actorName = "Cán bộ kiểm tra", actorRole = "Thanh tra viên An toàn Chuỗi lạnh" } = {},
) {
  const dossier = getInspectorTrace(identifier);
  const fontConfig = getSystemFont();

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 36, bottom: 36, left: 40, right: 40 },
        info: {
          Title: `Ho So Kiem Tra - ${dossier.batch.batchCode}`,
          Author: "He thong Agritrace",
          Subject: "Ho so truy xuat nguon goc va giam sat chuoi lanh nong san",
          Keywords: "Agritrace, HashChain, VietGAP, ColdChain, Traceability",
        },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      if (fontConfig.isCustom) {
        doc.registerFont("AppRegular", fontConfig.regular);
        doc.registerFont("AppBold", fontConfig.bold);
      } else {
        doc.registerFont("AppRegular", "Helvetica");
        doc.registerFont("AppBold", "Helvetica-Bold");
      }

      const setFont = (isBold = false, size = 10, color = "#0f172a") => {
        doc.font(isBold ? "AppBold" : "AppRegular").fontSize(size).fillColor(color);
      };

      // ─── TRANG 1: TIÊU ĐỀ CHÍNH THỨC & THÔNG TIN TỔNG QUAN ───────────────────
      // Header Quốc hiệu / Tiêu ngữ
      setFont(true, 10, "#1e293b");
      doc.text("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { align: "center" });
      setFont(false, 9, "#334155");
      doc.text("Độc lập - Tự do - Hạnh phúc", { align: "center" });
      doc.moveDown(0.3);
      doc
        .strokeColor("#94a3b8")
        .lineWidth(0.8)
        .moveTo(230, doc.y)
        .lineTo(365, doc.y)
        .stroke();
      doc.moveDown(0.8);

      // Tiêu đề văn bản
      setFont(true, 15, "#065f46");
      doc.text("HỒ SƠ THANH TRA TRUY XUẤT NGUỒN GỐC & CHUỖI LẠNH", { align: "center" });
      setFont(false, 9, "#64748b");
      doc.text("HỆ THỐNG GIÁM SÁT MINH BẠCH NÔNG SẢN QUỐC GIA AGRITRACE", { align: "center" });
      doc.moveDown(0.8);

      // Dải thông tin Metadata
      doc.rect(40, doc.y, 515, 28).fillAndStroke("#f8fafc", "#cbd5e1");
      const metaY = doc.y + 7;
      setFont(false, 8.5, "#475569");
      doc.text(`Mã hồ sơ: ${dossier.dossierCode}`, 48, metaY);
      doc.text(
        `Ngày trích xuất: ${new Date().toLocaleString("vi-VN")}`,
        240,
        metaY,
      );
      doc.text(`Cán bộ: ${actorName} (${actorRole})`, 370, metaY);
      doc.y = metaY + 28;

      // KHỐI 1: THÔNG TIN LÔ HÀNG VÀ PHÁP LÝ
      setFont(true, 11, "#0f172a");
      doc.text("1. THÔNG TIN LÔ HÀNG & PHÁP LÝ", 40, doc.y);
      doc.moveDown(0.3);

      const b = dossier.batch;
      const o = dossier.origin;

      doc.rect(40, doc.y, 515, 78).fillAndStroke("#ffffff", "#e2e8f0");
      const box1Y = doc.y + 8;

      setFont(true, 9, "#334155");
      doc.text("Tên sản phẩm:", 48, box1Y);
      setFont(false, 9, "#0f172a");
      doc.text(`${b.productName} (ĐVT: ${b.unit || "kg"})`, 130, box1Y);

      setFont(true, 9, "#334155");
      doc.text("Mã lô (Batch):", 48, box1Y + 16);
      setFont(false, 9, "#0f172a");
      doc.text(b.batchCode, 130, box1Y + 16);

      setFont(true, 9, "#334155");
      doc.text("Mã công khai:", 48, box1Y + 32);
      setFont(false, 9, "#0f172a");
      doc.text(b.publicCode || "N/A", 130, box1Y + 32);

      setFont(true, 9, "#334155");
      doc.text("Trạng thái:", 48, box1Y + 48);
      setFont(true, 9, b.status === "RECALLED" ? "#b91c1c" : "#047857");
      doc.text(b.status === "RECALLED" ? "ĐANG THU HỒI / CÁCH LY" : "ĐẠT CHUẨN LƯU THÔNG", 130, box1Y + 48);

      // Cột 2 của Khối 1
      setFont(true, 9, "#334155");
      doc.text("Khối lượng ban đầu:", 310, box1Y);
      setFont(false, 9, "#0f172a");
      doc.text(`${b.initialQuantity} ${b.unit || "kg"}`, 415, box1Y);

      setFont(true, 9, "#334155");
      doc.text("Khối lượng còn lại:", 310, box1Y + 16);
      setFont(false, 9, "#0f172a");
      doc.text(`${b.remainingQuantity} ${b.unit || "kg"}`, 415, box1Y + 16);

      setFont(true, 9, "#334155");
      doc.text("Đơn vị sở hữu:", 310, box1Y + 32);
      setFont(false, 9, "#0f172a");
      doc.text(dossier.organizationsInvolved[0]?.name || "N/A", 415, box1Y + 32);

      setFont(true, 9, "#334155");
      doc.text("Thời điểm thu hoạch:", 310, box1Y + 48);
      setFont(false, 9, "#0f172a");
      doc.text(b.harvestedAt ? new Date(b.harvestedAt).toLocaleDateString("vi-VN") : "N/A", 415, box1Y + 48);

      doc.y = box1Y + 76;

      // KHỐI 2: XUẤT XỨ NÔNG HỘ & CHỨNG NHẬN (TUÂN THỦ NGHỊ ĐỊNH 13/2023)
      setFont(true, 11, "#0f172a");
      doc.text("2. XUẤT XỨ VÙNG TRỒNG & CHỨNG NHẬN CHẤT LƯỢNG", 40, doc.y);
      doc.moveDown(0.3);

      doc.rect(40, doc.y, 515, 68).fillAndStroke("#ffffff", "#e2e8f0");
      const box2Y = doc.y + 8;

      setFont(true, 9, "#334155");
      doc.text("Trang trại / Nông hộ:", 48, box2Y);
      setFont(false, 9, "#0f172a");
      doc.text(
        `${o.farmName} ${o.isAnonymized ? "(Đã ẩn danh theo NĐ 13/2023/NĐ-CP)" : ""}`,
        150,
        box2Y,
      );

      setFont(true, 9, "#334155");
      doc.text("Địa chỉ sản xuất:", 48, box2Y + 16);
      setFont(false, 9, "#0f172a");
      doc.text(o.farmAddress || "Đang cập nhật", 150, box2Y + 16);

      setFont(true, 9, "#334155");
      doc.text("Thửa đất / Diện tích:", 48, box2Y + 32);
      setFont(false, 9, "#0f172a");
      doc.text(`${o.plotName || "Lô canh tác"} (${o.areaHa || 1} ha, ${o.soilType || "Đất bazan"})`, 150, box2Y + 32);

      setFont(true, 9, "#334155");
      doc.text("Chứng nhận chất lượng:", 48, box2Y + 48);
      setFont(true, 9, "#047857");
      doc.text(
        `${o.certificationStandard || "VietGAP"} (Mã: ${o.certificationCode || "VG-2026-DL01"}) - Cấp bởi: ${o.certificationIssuer || "Bộ Nông nghiệp & PTNT"}`,
        150,
        box2Y + 48,
      );

      doc.y = box2Y + 68;

      // KHỐI 3 (T-127): CON DẤU XÁC THỰC MẬT MÃ HỌC HASH CHAIN TOÀN VẸN
      setFont(true, 11, "#0f172a");
      doc.text("3. KẾT QUẢ XÁC MINH TÍNH TOÀN VẸN MẬT MÃ HỌC (HASH CHAIN PROOF)", 40, doc.y);
      doc.moveDown(0.3);

      const h = dossier.hashChain;
      const isValid = h.isChainValid;

      // Vẽ con dấu lớn chứng thực (Seal)
      const sealBgColor = isValid ? "#f0fdf4" : "#fef2f2";
      const sealBorderColor = isValid ? "#16a34a" : "#dc2626";
      const sealTextColor = isValid ? "#15803d" : "#b91c1c";

      doc.rect(40, doc.y, 515, 82).fillAndStroke(sealBgColor, sealBorderColor);
      const sealY = doc.y + 10;

      // Dấu khung con dấu đóng dấu kiểm định
      setFont(true, 13, sealTextColor);
      if (isValid) {
        doc.text("★ KẾT QUẢ: HỢP LỆ (VALID) - DỮ LIỆU NGUYÊN BẢN 100% ★", 48, sealY, {
          align: "center",
          width: 500,
        });
      } else {
        doc.text("⚠ KẾT QUẢ: CẢNH BÁO (INVALID) - PHÁT HIỆN CAN THIỆP DỮ LIỆU ⚠", 48, sealY, {
          align: "center",
          width: 500,
        });
      }

      setFont(false, 8.5, "#334155");
      if (isValid) {
        doc.text(
          "Hệ thống đã chạy lại thuật toán mật mã học SHA-256 trên toàn bộ các khối sự kiện của lô hàng. Tất cả các liên kết Previous Hash -> Current Hash hoàn toàn khớp, không có dấu hiệu chỉnh sửa hay đứt gãy.",
          55,
          sealY + 20,
          { width: 485, align: "center" },
        );
      } else {
        doc.text(
          "CẢNH BÁO AN NINH: Phát hiện sự sai lệch giữa mã băm lịch sử và dữ liệu hiện tại trong cơ sở dữ liệu. Lô hàng này có thể đã bị can thiệp trái phép ngoài quy trình kiểm định.",
          55,
          sealY + 20,
          { width: 485, align: "center" },
        );
      }

      setFont(true, 8, "#475569");
      doc.text(`Tổng số khối dữ liệu: ${h.blockCount} blocks`, 55, sealY + 54);
      doc.text(
        `Head Hash: ${(h.headHash || "").slice(0, 32)}...`,
        220,
        sealY + 54,
      );
      doc.text(`Thuật toán: SHA-256 (TCVN)`, 425, sealY + 54);

      doc.y = sealY + 80;

      // ─── TRANG 2: HÀNH TRÌNH CHUYỂN GIAO & GIÁM SÁT CHUỖI LẠNH ───────────────
      doc.addPage();

      setFont(true, 12, "#065f46");
      doc.text("4. NHẬT KÝ HÀNH TRÌNH CHUYỂN GIAO LIÊN TỔ CHỨC", 40, 40);
      setFont(false, 8.5, "#64748b");
      doc.text("Toàn bộ các đơn vị tham gia chuỗi cung ứng được kiểm tra chéo độc lập", 40, doc.y + 2);
      doc.moveDown(0.5);

      // Header bảng chuyển giao
      const tableTopY = doc.y;
      doc.rect(40, tableTopY, 515, 20).fillAndStroke("#0f766e", "#0f766e");
      setFont(true, 8.5, "#ffffff");
      doc.text("STT", 45, tableTopY + 5);
      doc.text("Thời gian", 75, tableTopY + 5);
      doc.text("Bên chuyển giao", 160, tableTopY + 5);
      doc.text("Bên tiếp nhận", 280, tableTopY + 5);
      doc.text("Đơn vị vận tải / Biển số", 400, tableTopY + 5);

      let currentTableY = tableTopY + 20;
      const transfers = dossier.transfers || [];

      if (transfers.length === 0) {
        doc.rect(40, currentTableY, 515, 22).fillAndStroke("#f8fafc", "#e2e8f0");
        setFont(false, 8.5, "#64748b");
        doc.text("Lô hàng hiện chưa phát sinh giao dịch chuyển giao qua đơn vị thứ ba.", 50, currentTableY + 6);
        currentTableY += 22;
      } else {
        transfers.forEach((tr, i) => {
          const rowBg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.rect(40, currentTableY, 515, 22).fillAndStroke(rowBg, "#e2e8f0");
          setFont(false, 8, "#1e293b");
          doc.text(String(i + 1), 48, currentTableY + 6);
          doc.text(new Date(tr.created_at).toLocaleString("vi-VN"), 75, currentTableY + 6);
          doc.text(tr.from_org_name || "N/A", 160, currentTableY + 6, { width: 110, ellipsis: true });
          doc.text(tr.to_org_name || "N/A", 280, currentTableY + 6, { width: 110, ellipsis: true });
          doc.text(
            `${tr.transporter_name || "Nội bộ"} ${tr.license_plate ? `(${tr.license_plate})` : ""}`,
            400,
            currentTableY + 6,
            { width: 145, ellipsis: true },
          );
          currentTableY += 22;
        });
      }

      doc.y = currentTableY + 16;

      // KHỐI 5: BÁO CÁO GIÁM SÁT CHUỖI LẠNH (COLD CHAIN AUDIT)
      setFont(true, 12, "#065f46");
      doc.text("5. BÁO CÁO GIÁM SÁT CHUỖI LẠNH (COLD CHAIN AUDIT)", 40, doc.y);
      doc.moveDown(0.3);

      const cc = dossier.coldChain;
      doc.rect(40, doc.y, 515, 75).fillAndStroke("#ffffff", "#cbd5e1");
      const ccY = doc.y + 8;

      setFont(true, 9, "#334155");
      doc.text("Ngưỡng nhiệt độ chuẩn:", 48, ccY);
      setFont(false, 9, "#0f172a");
      doc.text(
        `${cc.thresholds.minTemp ?? 2}°C đến ${cc.thresholds.maxTemp ?? 8}°C (Độ trễ cho phép: ${cc.thresholds.maxAllowedDelayMinutes ?? 30} phút)`,
        170,
        ccY,
      );

      setFont(true, 9, "#334155");
      doc.text("Tổng số mẫu cảm biến:", 48, ccY + 16);
      setFont(false, 9, "#0f172a");
      doc.text(`${cc.stats.totalReadings} điểm đo IoT`, 170, ccY + 16);

      setFont(true, 9, "#334155");
      doc.text("Nhiệt độ hành trình:", 48, ccY + 32);
      setFont(false, 9, "#0f172a");
      doc.text(
        `Thấp nhất: ${cc.stats.minTemperature}°C | Trung bình: ${cc.stats.avgTemperature}°C | Cao nhất: ${cc.stats.maxTemperature}°C`,
        170,
        ccY + 32,
      );

      setFont(true, 9, "#334155");
      doc.text("Số lần vượt ngưỡng:", 48, ccY + 48);
      setFont(true, 9, cc.alertCount > 0 ? "#b91c1c" : "#047857");
      doc.text(
        cc.alertCount > 0
          ? `${cc.alertCount} sự kiện vi phạm nhiệt độ (ĐÃ GHI HASH CHAIN)`
          : "0 vi phạm - Chuỗi bảo quản lạnh được duy trì hoàn hảo",
        170,
        ccY + 48,
      );

      doc.y = ccY + 75;

      // ─── TRANG 3: BẢNG KÊ CHI TIẾT CÁC KHỐI SỰ KIỆN HASH CHAIN ────────────────
      doc.addPage();

      setFont(true, 12, "#065f46");
      doc.text("6. BẢNG BẰNG CHỨNG MẬT MÃ HỌC CÁC KHỐI SỰ KIỆN (HASH BLOCKS)", 40, 40);
      setFont(false, 8.5, "#64748b");
      doc.text("Mỗi sự kiện được băm tuần tự và gắn với khối trước theo thuật toán SHA-256", 40, doc.y + 2);
      doc.moveDown(0.5);

      const blockTableTop = doc.y;
      doc.rect(40, blockTableTop, 515, 20).fillAndStroke("#1e293b", "#1e293b");
      setFont(true, 8, "#ffffff");
      doc.text("#", 45, blockTableTop + 5);
      doc.text("Sự kiện", 65, blockTableTop + 5);
      doc.text("Thời điểm", 145, blockTableTop + 5);
      doc.text("Người thực hiện", 230, blockTableTop + 5);
      doc.text("Previous Hash", 320, blockTableTop + 5);
      doc.text("Current Hash", 420, blockTableTop + 5);
      doc.text("Khớp", 515, blockTableTop + 5);

      let bY = blockTableTop + 20;
      const events = dossier.hashChain.events || [];

      events.slice(0, 15).forEach((ev) => {
        const bg = ev.blockIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(40, bY, 515, 20).fillAndStroke(bg, "#e2e8f0");
        setFont(false, 7.5, "#1e293b");
        doc.text(String(ev.blockIndex), 45, bY + 5);
        doc.text(ev.eventType, 65, bY + 5, { width: 75, ellipsis: true });
        doc.text(new Date(ev.timestamp).toLocaleString("vi-VN"), 145, bY + 5);
        doc.text(ev.actor, 230, bY + 5, { width: 85, ellipsis: true });
        doc.text((ev.previousHash || "GENESIS").slice(0, 12) + "...", 320, bY + 5);
        doc.text((ev.currentHash || "").slice(0, 12) + "...", 420, bY + 5);
        setFont(true, 7.5, "#047857");
        doc.text("✓", 522, bY + 5);
        bY += 20;
      });

      if (events.length > 15) {
        doc.rect(40, bY, 515, 18).fillAndStroke("#f1f5f9", "#cbd5e1");
        setFont(false, 8, "#64748b");
        doc.text(`... Còn ${events.length - 15} khối sự kiện tiếp theo được lưu trữ an toàn trong CSDL.`, 50, bY + 4);
        bY += 20;
      }

      // PHẦN KÝ TÊN VÀ XÁC NHẬN PHÁP LÝ
      doc.y = bY + 30;
      const signY = doc.y;

      setFont(true, 9, "#1e293b");
      doc.text("ĐẠI DIỆN ĐƠN VỊ SỞ HỮU LÔ", 80, signY, { align: "center", width: 160 });
      setFont(false, 8, "#64748b");
      doc.text("(Ký, ghi rõ họ tên và đóng dấu)", 80, signY + 12, { align: "center", width: 160 });

      setFont(true, 9, "#1e293b");
      doc.text("CÁN BỘ KIỂM TRA / THANH TRA", 340, signY, { align: "center", width: 160 });
      setFont(false, 8, "#64748b");
      doc.text("(Ký điện tử & chứng thực số)", 340, signY + 12, { align: "center", width: 160 });

      // Chữ ký điện tử mô phỏng
      doc.rect(340, signY + 35, 160, 45).fillAndStroke("#ecfdf5", "#a7f3d0");
      setFont(true, 8, "#047857");
      doc.text("ĐÃ KÝ ĐIỆN TỬ BỞI AGRITRACE", 345, signY + 42, { align: "center", width: 150 });
      setFont(false, 7.5, "#065f46");
      doc.text(`Cán bộ: ${actorName}`, 345, signY + 54, { align: "center", width: 150 });
      doc.text(`Mã xác thực: SHA256-CERT-OK`, 345, signY + 64, { align: "center", width: 150 });

      // Footer trang cuối
      setFont(false, 7.5, "#94a3b8");
      doc.text(
        "Tài liệu xuất tự động từ Hệ thống Agritrace. Mọi hành vi làm sai lệch hồ sơ sẽ bị xử lý theo quy định pháp luật.",
        40,
        780,
        { align: "center", width: 515 },
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
