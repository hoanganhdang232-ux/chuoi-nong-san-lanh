/**
 * SCRUM Sprint 8: Analytics Service
 * Sub-task T-129: Analytics Aggregation Query & Service
 * Thống kê tỷ lệ vi phạm chuỗi lạnh theo đơn vị vận chuyển / nhà xe
 */
import { getDb } from "../db/database.js";

/**
 * Tính toán thống kê tỷ lệ vi phạm chuỗi lạnh của các đơn vị vận tải
 * @param {object} options
 * @param {string} options.startDate
 * @param {string} options.endDate
 * @param {string} options.sortBy - 'violation_rate_desc' | 'violation_rate_asc' | 'shipments_desc' | 'name'
 */
export function getTransporterViolationStats({ startDate, endDate, sortBy = "violation_rate_desc" } = {}) {
  const db = getDb();

  // 1. Lấy danh sách toàn bộ các nhà xe / đơn vị logistics
  const transporters = db
    .prepare(
      `SELECT id, code, name, contact_phone, license_plate, temperature_control_type, is_active, created_at
       FROM transporters
       ORDER BY id ASC`,
    )
    .all();

  const results = [];
  let totalShipmentsAll = 0;
  let totalViolationsAll = 0;

  for (const trp of transporters) {
    // 1. Đếm tổng số chuyến vận chuyển của nhà xe này trong bảng batch_transfers
    let transferQuery = `
      SELECT id, batch_id, status, created_at
      FROM batch_transfers
      WHERE transporter_id = ?
    `;
    const transferParams = [trp.id];

    if (startDate) {
      transferQuery += " AND created_at >= ?";
      transferParams.push(startDate);
    }
    if (endDate) {
      transferQuery += " AND created_at <= ?";
      transferParams.push(endDate);
    }

    const transfers = db.prepare(transferQuery).all(...transferParams);

    // 2. Tra cứu các lô hàng được vận chuyển bởi nhà xe này
    const batchIds = Array.from(new Set(transfers.map((t) => t.batch_id).filter(Boolean)));

    // Đếm số sự kiện vi phạm nhiệt độ (từ cold_chain_alerts hoặc temperature_logs vượt ngưỡng)
    let violationCount = 0;
    let violatingShipmentsCount = 0;
    const violatingBatchIds = new Set();

    if (batchIds.length > 0) {
      const placeholders = batchIds.map(() => "?").join(",");

      // Kiểm tra trong bảng cold_chain_alerts
      const alerts = db
        .prepare(
          `SELECT DISTINCT batch_id
           FROM cold_chain_alerts
           WHERE batch_id IN (${placeholders})`,
        )
        .all(...batchIds);

      alerts.forEach((a) => violatingBatchIds.add(a.batch_id));
      violationCount = alerts.length;
    }

    // Kiểm tra thêm trực tiếp các logs nhiệt độ gắn với transporter_id
    let tempLogQuery = `
      SELECT COUNT(*) AS total_readings,
             SUM(CASE WHEN temperature > 8 OR temperature < 0 THEN 1 ELSE 0 END) AS out_of_range_readings
      FROM temperature_logs
      WHERE transporter_id = ?
    `;
    const tempParams = [trp.id];
    if (startDate) {
      tempLogQuery += " AND (recorded_at >= ? OR timestamp >= ?)";
      tempParams.push(startDate, startDate);
    }
    if (endDate) {
      tempLogQuery += " AND (recorded_at <= ? OR timestamp <= ?)";
      tempParams.push(endDate, endDate);
    }

    const tempStats = db.prepare(tempLogQuery).get(...tempParams);
    const outOfRange = Number(tempStats?.out_of_range_readings || 0);
    const totalReadings = Number(tempStats?.total_readings || 0);

    if (outOfRange > 0 && violationCount === 0) {
      violationCount = outOfRange;
    }

    // Tính số chuyến có vi phạm
    transfers.forEach((t) => {
      if (violatingBatchIds.has(t.batch_id)) {
        violatingShipmentsCount++;
      }
    });

    // Nếu có bản ghi vi phạm từ cảm biến nhưng transfers ít hơn, đảm bảo tính nhất quán
    if (outOfRange > 0 && transfers.length === 0) {
      // Giả lập hoặc tính theo số ca chạy thực tế từ readings
      violatingShipmentsCount = Math.max(1, Math.ceil(outOfRange / 5));
    }

    const totalShipments = Math.max(transfers.length, violatingShipmentsCount > 0 ? violatingShipmentsCount : 0);
    const compliantShipments = Math.max(0, totalShipments - violatingShipmentsCount);

    const violationRatePct =
      totalShipments > 0
        ? Number(((violatingShipmentsCount / totalShipments) * 100).toFixed(1))
        : 0;

    // Phân hạng mức độ tuân thủ
    let complianceTier = "EXCELLENT";
    let complianceLabel = "Xuất sắc (< 5%)";
    let statusColor = "#10b981"; // emerald

    if (violationRatePct > 30) {
      complianceTier = "CRITICAL";
      complianceLabel = "Báo động (> 30%)";
      statusColor = "#ef4444"; // red
    } else if (violationRatePct > 15) {
      complianceTier = "WARNING";
      complianceLabel = "Cần cải thiện (15% - 30%)";
      statusColor = "#f59e0b"; // amber
    } else if (violationRatePct >= 5) {
      complianceTier = "GOOD";
      complianceLabel = "Đạt chuẩn (5% - 15%)";
      statusColor = "#3b82f6"; // blue
    }

    results.push({
      transporterId: trp.id,
      code: trp.code,
      name: trp.name,
      contactPhone: trp.contact_phone,
      licensePlate: trp.license_plate,
      vehicleType: trp.temperature_control_type,
      isActive: Boolean(trp.is_active),
      totalShipments,
      compliantShipments,
      violatingShipments: violatingShipmentsCount,
      violationCount,
      totalTelemetryReadings: totalReadings,
      violationRatePct,
      complianceTier,
      complianceLabel,
      statusColor,
    });

    totalShipmentsAll += totalShipments;
    totalViolationsAll += violatingShipmentsCount;
  }

  // Sắp xếp kết quả theo yêu cầu
  if (sortBy === "violation_rate_desc") {
    results.sort((a, b) => b.violationRatePct - a.violationRatePct);
  } else if (sortBy === "violation_rate_asc") {
    results.sort((a, b) => a.violationRatePct - b.violationRatePct);
  } else if (sortBy === "shipments_desc") {
    results.sort((a, b) => b.totalShipments - a.totalShipments);
  } else if (sortBy === "name") {
    results.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }

  const avgViolationRate =
    totalShipmentsAll > 0
      ? Number(((totalViolationsAll / totalShipmentsAll) * 100).toFixed(1))
      : 0;

  const activeTransporters = results.filter((r) => r.totalShipments > 0);
  const safest = activeTransporters.length > 0 ? activeTransporters[activeTransporters.length - 1] : null;
  const highestRisk = activeTransporters.length > 0 ? activeTransporters[0] : null;

  return {
    kpis: {
      totalTransporters: transporters.length,
      totalShipments: totalShipmentsAll,
      totalViolations: totalViolationsAll,
      avgViolationRatePct: avgViolationRate,
      safestTransporter: safest ? { name: safest.name, rate: safest.violationRatePct } : null,
      highestRiskTransporter: highestRisk ? { name: highestRisk.name, rate: highestRisk.violationRatePct } : null,
    },
    transporters: results,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Gán đơn vị vận chuyển cho một đợt chuyển giao hoặc lô hàng
 */
export function assignTransporterToTransfer(transferId, transporterId) {
  const db = getDb();
  const transfer = db.prepare("SELECT id FROM batch_transfers WHERE id = ?").get(transferId);
  if (!transfer) {
    const error = new Error("Không tìm thấy đợt chuyển giao.");
    error.statusCode = 404;
    throw error;
  }

  db.prepare("UPDATE batch_transfers SET transporter_id = ? WHERE id = ?").run(transporterId, transferId);
  return { success: true, transferId, transporterId };
}
