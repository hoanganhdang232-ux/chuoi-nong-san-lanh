import { getDb } from "../db/database.js";
import { createEventLog } from "./batchService.js";
import { sendNotificationToOrg } from "./notificationService.js";
import { broadcastRecallEvent } from "./sseService.js";

/**
 * SPRINT 6: COLD CHAIN MONITORING SERVICE
 * Handles:
 * - T-90: Product Cold Chain Configuration
 * - T-93: Telemetry Ingestion Pipeline
 * - T-95 / T-96: Cold Chain Continuous Violation Detection Algorithm (>30 min delay)
 * - T-97 / T-98: COLD_CHAIN_VIOLATION Event Creation & Hash Chain Integration
 * - T-100: Temperature History & Travel Chart Data API
 * - T-102: In-app Notification & Real-time Alerting
 * - T-104: Hourly Aggregation Worker (>30 days old)
 * - T-105: Historical Log Archiving Service
 */

export const DEFAULT_MIN_TEMP = 2.0;
export const DEFAULT_MAX_TEMP = 8.0;
export const DEFAULT_MAX_DELAY_MINUTES = 30;
export const MAX_SAMPLE_GAP_MINUTES = 15; // Gap allowed between consecutive telemetry samples before resetting window

/**
 * T-90: Cập nhật cấu hình ngưỡng nhiệt độ và độ trễ cho sản phẩm.
 */
export function updateProductColdChainConfig(
  productId,
  organizationId,
  { min_temp, max_temp, max_allowed_delay_minutes },
  userRole,
) {
  const db = getDb();
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!product) {
    const err = new Error("Không tìm thấy sản phẩm.");
    err.statusCode = 404;
    throw err;
  }

  // Phân quyền: Chỉ admin tổ chức sở hữu hoặc auditor mới được sửa cấu hình
  if (userRole !== "auditor" && product.organization_id !== organizationId) {
    const err = new Error("Bạn không có quyền thay đổi cấu hình sản phẩm của tổ chức khác.");
    err.statusCode = 403;
    throw err;
  }

  const minTemp = min_temp !== undefined ? Number(min_temp) : (product.min_temp ?? DEFAULT_MIN_TEMP);
  const maxTemp = max_temp !== undefined ? Number(max_temp) : (product.max_temp ?? DEFAULT_MAX_TEMP);
  const delayMinutes =
    max_allowed_delay_minutes !== undefined
      ? parseInt(max_allowed_delay_minutes, 10)
      : (product.max_allowed_delay_minutes ?? DEFAULT_MAX_DELAY_MINUTES);

  if (!Number.isFinite(minTemp)) {
    const err = new Error("Nhiệt độ tối thiểu (min_temp) phải là số hợp lệ.");
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(maxTemp)) {
    const err = new Error("Nhiệt độ tối đa (max_temp) phải là số hợp lệ.");
    err.statusCode = 400;
    throw err;
  }
  if (minTemp > maxTemp) {
    const err = new Error("Nhiệt độ tối thiểu không được lớn hơn nhiệt độ tối đa.");
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(delayMinutes) || delayMinutes < 0) {
    const err = new Error("Thời gian cho phép vượt ngưỡng (phút) phải là số nguyên không âm.");
    err.statusCode = 400;
    throw err;
  }

  db.prepare(
    `UPDATE products
     SET min_temp = ?, max_temp = ?, max_allowed_delay_minutes = ?
     WHERE id = ?`,
  ).run(minTemp, maxTemp, delayMinutes, productId);

  return db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
}

/**
 * Lấy cấu hình ngưỡng chuỗi lạnh của sản phẩm
 */
export function getProductColdChainConfig(productId) {
  const db = getDb();
  const product = db
    .prepare(
      "SELECT id, organization_id, name, unit, min_temp, max_temp, max_allowed_delay_minutes FROM products WHERE id = ?",
    )
    .get(productId);
  if (!product) {
    const err = new Error("Không tìm thấy sản phẩm.");
    err.statusCode = 404;
    throw err;
  }
  return {
    productId: product.id,
    productName: product.name,
    minTemp: product.min_temp ?? DEFAULT_MIN_TEMP,
    maxTemp: product.max_temp ?? DEFAULT_MAX_TEMP,
    maxAllowedDelayMinutes: product.max_allowed_delay_minutes ?? DEFAULT_MAX_DELAY_MINUTES,
  };
}

/**
 * T-95 / T-96 / T-97 / T-98:
 * Thuật toán phân tích chuỗi log nhiệt độ và phát hiện vi phạm chuỗi lạnh theo độ trễ liên tục.
 * Phân biệt chính xác giữa:
 * - Vi phạm ngắt quãng (Intermittent spike < max_allowed_delay_minutes): Chấp nhận được, không báo động.
 * - Vi phạm liên tục (Continuous violation > max_allowed_delay_minutes): BÁO ĐỘNG & Ghi Hash Chain.
 */
export function evaluateBatchColdChain(batchId, { actorId = null } = {}) {
  const db = getDb();
  const batch = db
    .prepare(
      `SELECT b.*, p.name AS product_name, p.min_temp, p.max_temp, p.max_allowed_delay_minutes
       FROM batches b
       LEFT JOIN products p ON p.id = b.product_id
       WHERE b.id = ?`,
    )
    .get(batchId);

  if (!batch) return null;

  const minThreshold = batch.min_temp ?? DEFAULT_MIN_TEMP;
  const maxThreshold = batch.max_temp ?? DEFAULT_MAX_TEMP;
  const maxAllowedDelayMs = (batch.max_allowed_delay_minutes ?? DEFAULT_MAX_DELAY_MINUTES) * 60 * 1000;
  const maxGapMs = MAX_SAMPLE_GAP_MINUTES * 60 * 1000;

  // Lấy toàn bộ log nhiệt độ sắp xếp tăng dần theo thời gian
  const logs = db
    .prepare(
      `SELECT id, batch_id, shipment_id, temperature, source, sensor_id,
              coalesce(recorded_at, timestamp) AS recorded_at
       FROM temperature_logs
       WHERE batch_id = ?
       ORDER BY coalesce(recorded_at, timestamp) ASC, id ASC`,
    )
    .all(batchId);

  if (logs.length === 0) {
    return {
      batchId,
      status: "NO_DATA",
      alertActive: false,
      violations: [],
    };
  }

  let windowStart = null;
  let windowEnd = null;
  let previousTime = null;
  let currentWindowType = null; // 'HIGH_TEMP' | 'LOW_TEMP'
  let windowSamples = [];

  const detectedViolations = [];
  let currentActiveViolation = null;

  for (const log of logs) {
    const temp = Number(log.temperature);
    const at = new Date(log.recorded_at).getTime();

    const isHigh = temp > maxThreshold;
    const isLow = temp < minThreshold;
    const isOutOfRange = isHigh || isLow;
    const violationType = isHigh ? "HIGH_TEMP" : isLow ? "LOW_TEMP" : null;

    if (isOutOfRange) {
      // Nếu đã có cửa sổ nhưng khoảng cách giữa 2 mẫu quá lớn hoặc đổi loại vi phạm (nóng/lạnh) -> Reset cửa sổ
      if (
        previousTime === null ||
        at - previousTime > maxGapMs ||
        (currentWindowType && currentWindowType !== violationType)
      ) {
        windowStart = at;
        windowEnd = at;
        currentWindowType = violationType;
        windowSamples = [log];
      } else {
        windowEnd = at;
        windowSamples.push(log);
      }

      const durationMs = windowEnd - windowStart;

      // Đã vượt quá thời gian trễ tối đa cho phép liên tục (> maxAllowedDelayMs)
      if (durationMs > maxAllowedDelayMs) {
        const violationInfo = {
          batchId,
          violationType: currentWindowType,
          startTime: new Date(windowStart).toISOString(),
          endTime: new Date(windowEnd).toISOString(),
          durationMinutes: Math.round(durationMs / 60000),
          allowedDelayMinutes: batch.max_allowed_delay_minutes ?? DEFAULT_MAX_DELAY_MINUTES,
          thresholdMin: minThreshold,
          thresholdMax: maxThreshold,
          minTempRecorded: Math.min(...windowSamples.map((s) => Number(s.temperature))),
          maxTempRecorded: Math.max(...windowSamples.map((s) => Number(s.temperature))),
          peakTemp:
            currentWindowType === "HIGH_TEMP"
              ? Math.max(...windowSamples.map((s) => Number(s.temperature)))
              : Math.min(...windowSamples.map((s) => Number(s.temperature))),
          sampleCount: windowSamples.length,
          lastSensorId: log.sensor_id || log.source || "sensor",
          shipmentId: log.shipment_id || null,
        };

        currentActiveViolation = violationInfo;
      }
    } else {
      // Nhiệt độ quay trở lại dải an toàn!
      // Nếu cửa sổ vi phạm trước đó là ngắt quãng (<= maxAllowedDelayMs), đây là vi phạm ngắt quãng chấp nhận được
      if (currentActiveViolation) {
        detectedViolations.push({ ...currentActiveViolation });
      }
      windowStart = null;
      windowEnd = null;
      currentWindowType = null;
      windowSamples = [];
      currentActiveViolation = null;
    }

    previousTime = at;
  }

  // Nếu chuỗi log kết thúc mà vẫn đang trong tình trạng vi phạm liên tục
  const isCurrentlyViolating = currentActiveViolation !== null;
  if (isCurrentlyViolating) {
    detectedViolations.push({ ...currentActiveViolation });
  }

  const lastLog = logs.at(-1);

  // Xử lý cảnh báo (cold_chain_alerts) và sự kiện (COLD_CHAIN_VIOLATION)
  const activeAlert = db
    .prepare(
      "SELECT * FROM cold_chain_alerts WHERE batch_id = ? AND alert_type = 'temperature' AND resolved_at IS NULL ORDER BY id DESC LIMIT 1",
    )
    .get(batchId);

  let newViolationRecorded = false;

  if (isCurrentlyViolating) {
    const violation = currentActiveViolation;
    if (!activeAlert) {
      // 1. T-97: Tạo bản ghi cảnh báo trong cold_chain_alerts
      const alertMsg =
        violation.violationType === "HIGH_TEMP"
          ? `Vi phạm chuỗi lạnh: Nhiệt độ (${violation.peakTemp}°C) vượt quá ngưỡng an toàn ${maxThreshold}°C liên tục ${violation.durationMinutes} phút (ngưỡng cho phép: ${violation.allowedDelayMinutes} phút).`
          : `Vi phạm chuỗi lạnh: Nhiệt độ (${violation.peakTemp}°C) hạ thấp dưới ngưỡng tối thiểu ${minThreshold}°C liên tục ${violation.durationMinutes} phút (ngưỡng cho phép: ${violation.allowedDelayMinutes} phút).`;

      db.prepare(
        `INSERT INTO cold_chain_alerts(batch_id, alert_type, message, started_at, detected_at)
         VALUES (?, 'temperature', ?, ?, ?)`,
      ).run(batchId, alertMsg, violation.startTime, violation.endTime);

      // 2. T-98: Ghi sự kiện COLD_CHAIN_VIOLATION nối tiếp vào chuỗi Hash Chain
      createEventLog({
        batchId,
        eventType: "COLD_CHAIN_VIOLATION",
        actorId: actorId || null,
        data: {
          violation_type: violation.violationType,
          started_at: violation.startTime,
          detected_at: violation.endTime,
          duration_minutes: violation.durationMinutes,
          allowed_delay_minutes: violation.allowedDelayMinutes,
          threshold_min: violation.thresholdMin,
          threshold_max: violation.thresholdMax,
          peak_temperature_c: violation.peakTemp,
          min_temp_recorded: violation.minTempRecorded,
          max_temp_recorded: violation.maxTempRecorded,
          sample_count: violation.sampleCount,
          sensor_id: violation.lastSensorId,
          shipment_id: violation.shipmentId,
        },
        timestamp: violation.endTime,
      });

      // 3. T-102: Phát thông báo In-app & SSE cho các bên liên quan
      sendNotificationToOrg({
        orgId: batch.organization_id,
        title: `🚨 Vi phạm chuỗi lạnh: Lô ${batch.batch_code}`,
        message: alertMsg,
        type: "COLD_CHAIN_ALERT",
        kind: "cold_chain",
      });

      // Nếu lô đang trong quá trình chuyển giao (transfer), thông báo cả bên nhận
      const activeTransfer = db
        .prepare(
          "SELECT to_organization_id FROM batch_transfers WHERE batch_id = ? AND status = 'pending' LIMIT 1",
        )
        .get(batchId);
      if (activeTransfer && activeTransfer.to_organization_id !== batch.organization_id) {
        sendNotificationToOrg({
          orgId: activeTransfer.to_organization_id,
          title: `🚨 Cảnh báo chuyển giao: Lô ${batch.batch_code} vi phạm nhiệt độ`,
          message: alertMsg,
          type: "COLD_CHAIN_ALERT",
          kind: "cold_chain",
        });
      }

      // Broadcast SSE thời gian thực
      broadcastRecallEvent("cold_chain_alert", {
        batchId,
        batchCode: batch.batch_code,
        message: alertMsg,
        violation,
      });

      newViolationRecorded = true;
    }

    // Cập nhật trạng thái lô hàng
    db.prepare(
      `UPDATE batches
       SET temperature_c = ?, cold_chain_alert = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(lastLog.temperature, batchId);
  } else {
    // Không vi phạm ở thời điểm hiện tại
    if (activeAlert) {
      // Đóng cảnh báo cũ đã được khắc phục
      db.prepare(
        "UPDATE cold_chain_alerts SET resolved_at = ? WHERE id = ?",
      ).run(lastLog.recorded_at, activeAlert.id);
    }

    db.prepare(
      `UPDATE batches
       SET temperature_c = ?, cold_chain_alert = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(lastLog.temperature, batchId);
  }

  return {
    batchId,
    batchCode: batch.batch_code,
    productName: batch.product_name,
    thresholds: {
      minTemp: minThreshold,
      maxTemp: maxThreshold,
      maxAllowedDelayMinutes: batch.max_allowed_delay_minutes ?? DEFAULT_MAX_DELAY_MINUTES,
    },
    latestTemperature: Number(lastLog.temperature),
    latestRecordedAt: lastLog.recorded_at,
    isCurrentlyViolating,
    newViolationRecorded,
    totalViolationsCount: detectedViolations.length,
    violations: detectedViolations,
  };
}

/**
 * T-93: Public Ingestion API xử lý luồng dữ liệu cảm biến IoT gửi về từ xe vận chuyển.
 * Hỗ trợ nhận một mẫu đơn lẻ hoặc danh sách mảng nhiều mẫu.
 */
export function ingestTemperatureTelemetry(payload, { actorId = null } = {}) {
  let rawReadings = [];
  if (Array.isArray(payload)) {
    rawReadings = payload;
  } else if (payload && Array.isArray(payload.readings)) {
    rawReadings = payload.readings;
  } else if (payload && typeof payload === "object") {
    rawReadings = [payload];
  }

  if (rawReadings.length === 0) {
    const err = new Error("Dữ liệu telemetry không hợp lệ. Cần truyền ít nhất 1 mẫu nhiệt độ.");
    err.statusCode = 400;
    throw err;
  }

  if (rawReadings.length > 5000) {
    const err = new Error("Số lượng mẫu trong 1 đợt đẩy telemetry không được vượt quá 5,000 mẫu.");
    err.statusCode = 400;
    throw err;
  }

  const db = getDb();
  const batchLookup = new Map();

  // Chuẩn hóa và xác thực dữ liệu từng mẫu
  const validReadings = [];
  for (let i = 0; i < rawReadings.length; i++) {
    const item = rawReadings[i];
    const temp = Number(item.temperature);
    if (!Number.isFinite(temp) || temp < -50 || temp > 100) {
      const err = new Error(`Mẫu số ${i + 1}: Nhiệt độ (${item.temperature}) không hợp lệ (phải từ -50°C đến 100°C).`);
      err.statusCode = 400;
      throw err;
    }

    let batchId = item.batch_id ? Number(item.batch_id) : null;
    const batchCode = item.batch_code ? String(item.batch_code).trim() : null;

    if (!batchId && !batchCode) {
      const err = new Error(`Mẫu số ${i + 1}: Bắt buộc phải có batch_id hoặc batch_code.`);
      err.statusCode = 400;
      throw err;
    }

    // Tra cứu batch_id nếu truyền batch_code
    if (!batchId && batchCode) {
      if (!batchLookup.has(batchCode)) {
        const found = db.prepare("SELECT id FROM batches WHERE batch_code = ?").get(batchCode);
        if (!found) {
          const err = new Error(`Mẫu số ${i + 1}: Không tìm thấy lô hàng có mã '${batchCode}'.`);
          err.statusCode = 404;
          throw err;
        }
        batchLookup.set(batchCode, found.id);
      }
      batchId = batchLookup.get(batchCode);
    } else if (batchId) {
      if (!batchLookup.has(batchId)) {
        const found = db.prepare("SELECT id FROM batches WHERE id = ?").get(batchId);
        if (!found) {
          const err = new Error(`Mẫu số ${i + 1}: Không tìm thấy lô hàng ID ${batchId}.`);
          err.statusCode = 404;
          throw err;
        }
        batchLookup.set(batchId, found.id);
      }
    }

    let recordedAt = item.recorded_at || item.timestamp;
    if (recordedAt) {
      const d = new Date(recordedAt);
      if (Number.isNaN(d.getTime())) {
        const err = new Error(`Mẫu số ${i + 1}: Thời điểm ghi nhận '${recordedAt}' không đúng định dạng ngày giờ.`);
        err.statusCode = 400;
        throw err;
      }
      recordedAt = d.toISOString();
    } else {
      recordedAt = new Date().toISOString();
    }

    validReadings.push({
      batchId,
      shipmentId: item.shipment_id ? Number(item.shipment_id) : null,
      temperature: temp,
      sensorId: item.sensor_id ? String(item.sensor_id).trim() : (item.source || "SENSOR-IoT"),
      recordedAt,
    });
  }

  // Bulk Insert trong 1 transaction an toàn
  const affectedBatchIds = new Set();
  db.exec("BEGIN IMMEDIATE");
  try {
    const insertStmt = db.prepare(
      `INSERT INTO temperature_logs(batch_id, shipment_id, temperature, source, sensor_id, timestamp, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const r of validReadings) {
      insertStmt.run(r.batchId, r.shipmentId, r.temperature, r.sensorId, r.sensorId, r.recordedAt, r.recordedAt);
      affectedBatchIds.add(r.batchId);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  // Chạy thuật toán phát hiện vi phạm cho tất cả các lô bị ảnh hưởng
  const evaluationResults = [];
  for (const bId of affectedBatchIds) {
    try {
      const evalRes = evaluateBatchColdChain(bId, { actorId });
      if (evalRes) evaluationResults.push(evalRes);
    } catch (evalErr) {
      console.error(`Lỗi đánh giá chuỗi lạnh lô ${bId}:`, evalErr);
    }
  }

  return {
    success: true,
    count: validReadings.length,
    processedAt: new Date().toISOString(),
    affectedBatchesCount: affectedBatchIds.size,
    evaluations: evaluationResults,
    violationsDetected: evaluationResults.filter((e) => e.isCurrentlyViolating),
  };
}

/**
 * T-100: Lấy chuỗi lịch sử nhiệt độ đầy đủ kèm thông tin dải an toàn để vẽ biểu đồ hành trình.
 */
export function getBatchTemperatureHistory(batchId) {
  const db = getDb();
  const batch = db
    .prepare(
      `SELECT b.id, b.batch_code, b.initial_quantity, b.remaining_quantity,
              b.current_location, b.temperature_c, b.cold_chain_alert, b.status,
              p.id AS product_id, p.name AS product_name, p.unit AS product_unit,
              p.min_temp, p.max_temp, p.max_allowed_delay_minutes
       FROM batches b
       LEFT JOIN products p ON p.id = b.product_id
       WHERE b.id = ?`,
    )
    .get(batchId);

  if (!batch) {
    const err = new Error("Không tìm thấy lô hàng.");
    err.statusCode = 404;
    throw err;
  }

  const minTemp = batch.min_temp ?? DEFAULT_MIN_TEMP;
  const maxTemp = batch.max_temp ?? DEFAULT_MAX_TEMP;
  const maxAllowedDelayMinutes = batch.max_allowed_delay_minutes ?? DEFAULT_MAX_DELAY_MINUTES;

  // Lấy chi tiết logs
  const logs = db
    .prepare(
      `SELECT id, batch_id, shipment_id, temperature, source, sensor_id,
              coalesce(recorded_at, timestamp) AS recorded_at
       FROM temperature_logs
       WHERE batch_id = ?
       ORDER BY coalesce(recorded_at, timestamp) ASC, id ASC`,
    )
    .all(batchId);

  // Tính toán thống kê Min, Max, Avg
  let minRecorded = null;
  let maxRecorded = null;
  let sumTemp = 0;
  const mappedLogs = logs.map((log) => {
    const t = Number(log.temperature);
    if (minRecorded === null || t < minRecorded) minRecorded = t;
    if (maxRecorded === null || t > maxRecorded) maxRecorded = t;
    sumTemp += t;
    const isOut = t < minTemp || t > maxTemp;
    return {
      id: log.id,
      temperature: t,
      recordedAt: log.recorded_at,
      sensorId: log.sensor_id || log.source || "sensor",
      shipmentId: log.shipment_id,
      isOutOfRange: isOut,
    };
  });

  const avgTemp = logs.length > 0 ? Number((sumTemp / logs.length).toFixed(1)) : null;

  // Lấy danh sách sự kiện vi phạm từ event_logs
  const violationEvents = db
    .prepare(
      `SELECT id, event_type, data_json, current_hash, timestamp
       FROM event_logs
       WHERE batch_id = ? AND upper(event_type) IN ('COLD_CHAIN_VIOLATION', 'TEMPERATURE_VIOLATION')
       ORDER BY timestamp DESC`,
    )
    .all(batchId)
    .map((e) => {
      let data = {};
      try {
        data = JSON.parse(e.data_json);
      } catch {
        // ignore
      }
      return {
        id: e.id,
        eventType: e.event_type,
        currentHash: e.current_hash,
        timestamp: e.timestamp,
        data,
      };
    });

  // Lấy cảnh báo hiện tại nếu có
  const activeAlert = db
    .prepare(
      "SELECT * FROM cold_chain_alerts WHERE batch_id = ? AND alert_type = 'temperature' AND resolved_at IS NULL ORDER BY id DESC LIMIT 1",
    )
    .get(batchId);

  return {
    batch: {
      id: batch.id,
      batchCode: batch.batch_code,
      productName: batch.product_name,
      productUnit: batch.product_unit,
      currentLocation: batch.current_location,
      currentTemperature: batch.temperature_c,
      coldChainAlert: Boolean(batch.cold_chain_alert),
      status: batch.status,
    },
    config: {
      minTemp,
      maxTemp,
      maxAllowedDelayMinutes,
    },
    stats: {
      totalReadings: logs.length,
      minRecorded,
      maxRecorded,
      avgRecorded: avgTemp,
      lastReading: logs.length > 0 ? mappedLogs.at(-1) : null,
      activeAlert: activeAlert
        ? {
            id: activeAlert.id,
            message: activeAlert.message,
            startedAt: activeAlert.started_at,
            detectedAt: activeAlert.detected_at,
          }
        : null,
    },
    logs: mappedLogs,
    violationEvents,
  };
}

/**
 * T-104: Background Worker nén (aggregate) dữ liệu nhiệt độ cũ (> daysOld ngày).
 * Tính giá trị trung bình theo từng giờ và lưu vào bảng temperature_hourly_aggregates.
 */
export function aggregateOldTemperatureLogs(daysOld = 30) {
  const db = getDb();
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

  // Tìm các nhóm theo batch_id và theo từng giờ
  const hourlyGroups = db
    .prepare(
      `SELECT batch_id,
              strftime('%Y-%m-%d %H:00:00', coalesce(recorded_at, timestamp)) AS hour_bucket,
              AVG(temperature) AS avg_temp,
              MIN(temperature) AS min_temp,
              MAX(temperature) AS max_temp,
              COUNT(*) AS count
       FROM temperature_logs
       WHERE coalesce(recorded_at, timestamp) < ?
       GROUP BY batch_id, hour_bucket`,
    )
    .all(cutoffDate);

  if (hourlyGroups.length === 0) {
    return { aggregatedCount: 0, cutoffDate };
  }

  const insertAgg = db.prepare(
    `INSERT INTO temperature_hourly_aggregates(batch_id, hour_bucket, avg_temperature, min_temperature, max_temperature, reading_count)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(batch_id, hour_bucket) DO UPDATE SET
       avg_temperature = excluded.avg_temperature,
       min_temperature = excluded.min_temperature,
       max_temperature = excluded.max_temperature,
       reading_count = excluded.reading_count`,
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const g of hourlyGroups) {
      insertAgg.run(
        g.batch_id,
        g.hour_bucket,
        Number(Number(g.avg_temp).toFixed(2)),
        Number(g.min_temp),
        Number(g.max_temp),
        g.count,
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { aggregatedCount: hourlyGroups.length, cutoffDate };
}

/**
 * T-105: Archiving Service chuyển log chi tiết quá hạn (> daysOld ngày) sang bảng temperature_logs_archive
 * sau khi đã hoàn thành nén dữ liệu.
 */
export function archiveOldTemperatureLogs(daysOld = 30) {
  const db = getDb();
  // 1. Chạy nén trước khi di chuyển
  const { aggregatedCount, cutoffDate } = aggregateOldTemperatureLogs(daysOld);

  db.exec("BEGIN IMMEDIATE");
  let archivedCount = 0;
  try {
    // 2. Chuyển log sang bảng lưu trữ archive
    const insertArchive = db.prepare(
      `INSERT OR REPLACE INTO temperature_logs_archive(id, batch_id, shipment_id, temperature, source, sensor_id, timestamp, recorded_at, archived_at)
       SELECT id, batch_id, shipment_id, temperature, source, sensor_id, timestamp, coalesce(recorded_at, timestamp), CURRENT_TIMESTAMP
       FROM temperature_logs
       WHERE coalesce(recorded_at, timestamp) < ?`,
    );
    const archiveResult = insertArchive.run(cutoffDate);
    archivedCount = archiveResult.changes;

    // 3. Xóa các log chi tiết đã archive khỏi bảng chính để giữ CSDL luôn nhẹ
    db.prepare(
      "DELETE FROM temperature_logs WHERE coalesce(recorded_at, timestamp) < ?",
    ).run(cutoffDate);

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return {
    success: true,
    cutoffDate,
    aggregatedBuckets: aggregatedCount,
    archivedCount,
  };
}

/**
 * Thống kê tổng quan chuỗi lạnh cho Dashboard
 */
export function getColdChainOverview(organizationId, userRole) {
  const db = getDb();
  const isAuditor = userRole === "auditor";

  const orgCondition = isAuditor ? "" : "WHERE organization_id = ?";
  const params = isAuditor ? [] : [organizationId];

  const totalBatches = db
    .prepare(`SELECT COUNT(*) AS c FROM batches ${orgCondition}`)
    .get(...params).c;

  const alertBatches = db
    .prepare(
      `SELECT COUNT(*) AS c FROM batches ${orgCondition ? orgCondition + " AND" : "WHERE"} cold_chain_alert = 1`,
    )
    .get(...params).c;

  const totalLogs = db
    .prepare(
      `SELECT COUNT(*) AS c FROM temperature_logs tl
       ${isAuditor ? "" : "INNER JOIN batches b ON b.id = tl.batch_id WHERE b.organization_id = ?"}`,
    )
    .get(...params).c;

  const activeAlerts = db
    .prepare(
      `SELECT cca.*, b.batch_code, p.name AS product_name
       FROM cold_chain_alerts cca
       INNER JOIN batches b ON b.id = cca.batch_id
       LEFT JOIN products p ON p.id = b.product_id
       ${isAuditor ? "" : "WHERE b.organization_id = ?"}
       AND cca.resolved_at IS NULL
       ORDER BY cca.id DESC LIMIT 10`,
    )
    .all(...params);

  return {
    totalBatches,
    alertBatches,
    compliantBatches: Math.max(0, totalBatches - alertBatches),
    totalLogs,
    activeAlerts,
  };
}
