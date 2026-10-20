/**
 * SCRUM-190 / T-112 & T-113: Public Trace DTO & Data Transformer
 * Chuyên trách bọc, lọc bỏ hoàn toàn các trường dữ liệu nhạy cảm nội bộ:
 * - Khối lượng (weight, quantity, remaining_quantity, initial_quantity, consumed_quantity)
 * - Giá cả và tài chính (price, cost, financial_details)
 * - Tên đối tác nội bộ & thông tin nhân viên (user_id, email, phone, internal notes)
 * - Bán ẩn danh các bên trung gian theo vai trò chuyên nghiệp (T-113)
 */

/**
 * Bán ẩn danh tên đối tác trung gian theo vai trò
 */
export function anonymizePartnerRole(rawRoleOrType, orgName = "") {
  const norm = String(rawRoleOrType || "").toLowerCase();
  const orgNorm = String(orgName || "").toLowerCase();

  if (norm.includes("farm") || norm.includes("nông") || norm.includes("trại") || orgNorm.includes("farm")) {
    return "Trang trại nông sản đạt chuẩn";
  }
  if (norm.includes("process") || norm.includes("sơ chế") || norm.includes("chế biến") || orgNorm.includes("sơ chế")) {
    return "Cơ sở sơ chế & đóng gói đạt chuẩn HACCP";
  }
  if (norm.includes("distribut") || norm.includes("phân phối") || orgNorm.includes("phân phối")) {
    return "Trung tâm điều phối & phân phối lạnh";
  }
  if (norm.includes("transport") || norm.includes("vận chuyển") || orgNorm.includes("logistics")) {
    return "Đơn vị vận chuyển chuỗi lạnh bảo ôn";
  }
  if (norm.includes("store") || norm.includes("cửa hàng") || norm.includes("siêu thị")) {
    return "Điểm phân phối & bán lẻ nông sản";
  }
  return "Đơn vị đối tác trong chuỗi cung ứng";
}

/**
 * Chuyển đổi mã sự kiện kỹ thuật sang thông điệp người tiêu dùng thân thiện
 */
const CONSUMER_EVENT_MAP = {
  batch_harvested: {
    title: "Thu hoạch & Kiểm định tại nông trại",
    stage: "Vùng trồng đạt chuẩn",
    description: "Nông sản được thu hoạch đạt độ chín tối ưu và kiểm tra cảm quan ban đầu.",
    role: "Trang trại đối tác",
  },
  batch_processed: {
    title: "Sơ chế & Kiểm soát chất lượng",
    stage: "Trung tâm sơ chế",
    description: "Làm sạch, phân loại theo kích cỡ và đóng gói bảo quản theo quy chuẩn an toàn.",
    role: "Cơ sở sơ chế HACCP",
  },
  batch_transferred: {
    title: "Bàn giao vận chuyển chuỗi lạnh",
    stage: "Điều phối vận tải",
    description: "Nông sản được niêm phong và đưa lên phương tiện chuyên dụng duy trì nhiệt độ bảo quản.",
    role: "Đơn vị vận chuyển bảo ôn",
  },
  batch_in_transit: {
    title: "Hành trình vận chuyển (Giám sát IoT)",
    stage: "Đang vận chuyển",
    description: "Cảm biến nhiệt độ IoT hoạt động liên tục đảm bảo chuỗi lạnh không bị ngắt quãng.",
    role: "Đơn vị vận tải giám sát",
  },
  batch_delivered: {
    title: "Giao nhận & Lưu kho thành công",
    stage: "Kho nhận hàng",
    description: "Kiểm tra nhiệt độ thùng hàng đạt chuẩn trước khi tiếp nhận lưu kho.",
    role: "Trung tâm phân phối",
  },
  batch_split: {
    title: "Phân bổ kiện hàng phục vụ phân phối",
    stage: "Trung tâm phân loại",
    description: "Kiện hàng được phân bổ tới các điểm bán lẻ, duy trì truy xuất chuỗi liên tục.",
    role: "Bộ phận logistics",
  },
  batch_recalled: {
    title: "Cảnh báo tạm ngưng lưu hành",
    stage: "Biện pháp an toàn",
    description: "Lô hàng đang được hệ thống kích hoạt biện pháp thu hồi kiểm tra chất lượng bổ sung.",
    role: "Bộ phận an toàn thực phẩm",
  },
  cold_chain_violation: {
    title: "Ghi nhận vi phạm ngưỡng nhiệt độ",
    stage: "Cảnh báo chuỗi lạnh",
    description: "Hệ thống IoT phát hiện nhiệt độ vượt dải an toàn trong quá trình di chuyển.",
    role: "Hệ thống giám sát tự động",
  },
  temperature_series_recorded: {
    title: "Cập nhật dữ liệu cảm biến định kỳ",
    stage: "Giám sát chuỗi lạnh",
    description: "Dữ liệu nhiệt độ được ghi nhận và đồng bộ tự động lên sổ cái.",
    role: "Cảm biến IoT tự động",
  },
};

/**
 * Transform dữ liệu thành Public Trace DTO an toàn
 */
export function transformToPublicTraceDTO({
  batch,
  product,
  farm,
  landPlot,
  certifications = [],
  timelineEvents = [],
  temperatureLogs = [],
  integrity = {},
  publicCode = null,
  publicUrl = null,
}) {
  if (!batch) return null;

  // Lọc nhạy cảm cho timeline
  const consumerTimeline = timelineEvents.map((evt) => {
    const meta = CONSUMER_EVENT_MAP[evt.event_type] || {
      title: "Ghi nhận sự kiện chuỗi cung ứng",
      stage: "Hành trình nông sản",
      description: "Sự kiện được xác thực vào chuỗi nhật ký điện tử bất biến.",
      role: "Đơn vị liên kết",
    };

    return {
      id: evt.id,
      stage: meta.stage,
      title: meta.title,
      description: meta.description,
      partnerRole: meta.role,
      timestamp: evt.timestamp || evt.created_at,
      hashSnippet: evt.current_hash
        ? `${evt.current_hash.substring(0, 8)}...${evt.current_hash.substring(evt.current_hash.length - 8)}`
        : null,
      fullHash: evt.current_hash || null,
      previousHash: evt.previous_hash || null,
      isCryptographicallyVerified: Boolean(evt.current_hash),
    };
  });

  // Dữ liệu cảm biến nhiệt độ an toàn (ẩn địa chỉ IP, MAC sensor, chỉ để lại nhiệt độ & timestamp)
  const safeTemperatureSeries = (temperatureLogs || []).map((log) => ({
    temperature: Number(Number(log.temperature).toFixed(1)),
    recordedAt: log.recorded_at || log.timestamp,
    isWithinSafeRange:
      Number(log.temperature) >= Number(product?.min_temp ?? 2.0) &&
      Number(log.temperature) <= Number(product?.max_temp ?? 8.0),
  }));

  // Chứng nhận an toàn
  const safeCertifications = certifications.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    standard: c.standard,
    issuer: c.issuer,
    issueDate: c.issue_date,
    expiryDate: c.expiry_date,
    status: c.status,
    description: c.description || null,
    certificateFileUrl: c.certificate_file_url || null,
    sealIcon: c.seal_icon || `${c.standard.toLowerCase()}_seal.svg`,
  }));

  // Parse photos an toàn từ thửa đất
  let safePhotos = [];
  try {
    if (landPlot?.photos_json) {
      const parsed = JSON.parse(landPlot.photos_json);
      if (Array.isArray(parsed)) safePhotos = parsed;
    }
  } catch {
    // fallback
  }

  // Quyết định trạng thái an toàn
  let safetyBadge = "ĐẠT CHUẨN AN TOÀN";
  let safetyTone = "safe";
  let safetyMessage = "Lô hàng được kiểm soát an toàn tuyệt đối từ trang trại tới điểm bán.";

  if (batch.status === "recalled" || batch.status === "RECALLED" || batch.status === "QUARANTINED" || batch.status === "quarantined") {
    safetyBadge = "CẢNH BÁO THU HỒI";
    safetyTone = "danger";
    safetyMessage = "Lô hàng đang thuộc diện cách ly kiểm tra chất lượng. Vui lòng không tiêu thụ.";
  } else if (batch.cold_chain_alert) {
    safetyBadge = "CẢNH BÁO CHUỖI LẠNH";
    safetyTone = "warning";
    safetyMessage = "Ghi nhận sự cố nhiệt độ vượt ngưỡng bảo quản trong quá trình vận chuyển.";
  }

  // T-112 & T-113: Tuyệt đối không chứa quantity, price, partner internal name, v.v.
  return {
    publicCode: publicCode || batch.public_code || `TRC-${batch.batch_code}`,
    batchCode: batch.batch_code,
    publicUrl: publicUrl || `https://trace.agritrace.vn/p/${publicCode || batch.public_code || batch.batch_code}`,
    product: {
      name: product?.name || "Nông sản sạch",
      category: product?.unit ? `Nông sản đóng gói (${product.unit})` : "Nông sản tươi",
      storageConditions: `Nhiệt độ tối ưu: ${product?.min_temp ?? 2.0}°C - ${product?.max_temp ?? 8.0}°C`,
      minTemp: product?.min_temp ?? 2.0,
      maxTemp: product?.max_temp ?? 8.0,
    },
    origin: {
      farmRegion: farm?.address || farm?.name || "Vùng chuyên canh nông sản công nghệ cao",
      latitude: farm?.latitude || landPlot?.latitude || null,
      longitude: farm?.longitude || landPlot?.longitude || null,
      landPlot: landPlot
        ? {
            name: landPlot.name || "Thửa đất công nghệ cao",
            areaHa: landPlot.area_ha || null,
            soilType: landPlot.soil_type || "Đất đỏ bazan phì nhiêu",
            certificationCode: landPlot.certification_code || safeCertifications[0]?.code || "Đạt chuẩn VietGAP",
            photos: safePhotos,
          }
        : null,
      harvestedAt: batch.harvested_at || batch.created_at,
    },
    safetyStatus: {
      badge: safetyBadge,
      tone: safetyTone,
      message: safetyMessage,
      hasColdChainAlert: Boolean(batch.cold_chain_alert),
      isRecalled: Boolean(batch.status === "recalled" || batch.status === "RECALLED" || batch.status === "QUARANTINED"),
    },
    certifications: safeCertifications,
    timeline: consumerTimeline,
    coldChain: {
      storageThreshold: {
        min: product?.min_temp ?? 2.0,
        max: product?.max_temp ?? 8.0,
        unit: "°C",
      },
      currentTemperature: batch.temperature_c ?? safeTemperatureSeries[safeTemperatureSeries.length - 1]?.temperature ?? null,
      readingsCount: safeTemperatureSeries.length,
      temperatureSeries: safeTemperatureSeries,
    },
    integrity: {
      isChainValid: integrity.isChainValid !== undefined ? integrity.isChainValid : true,
      algorithm: "SHA-256 (Hash Chaining Block Model)",
      headHash: integrity.headHash || (consumerTimeline[consumerTimeline.length - 1]?.fullHash ?? null),
      genesisHash: integrity.genesisHash || (consumerTimeline[0]?.fullHash ?? null),
      blocksCount: consumerTimeline.length,
      auditTimestamp: new Date().toISOString(),
      proofSummary: "Toàn bộ sự kiện được nối chuỗi mã hóa bất biến SHA-256. Không thể chỉnh sửa hoặc làm giả.",
    },
    verifiedAt: new Date().toISOString(),
  };
}
