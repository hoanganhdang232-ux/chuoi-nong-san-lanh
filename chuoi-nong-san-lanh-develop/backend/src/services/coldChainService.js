import { getDb } from "../db/database.js";
import { createEventLog } from "./batchService.js";

const SAFE_TEMPERATURE_C = 8;
const ALERT_DURATION_MS = 30 * 60 * 1000;
const MAX_SAMPLE_GAP_MS = 10 * 60 * 1000;

export function recordTemperatureSeries({ batchId, readings, actorId }) {
  if (
    !Array.isArray(readings) ||
    readings.length === 0 ||
    readings.length > 1000
  ) {
    throw new Error("Chuỗi cảm biến phải có từ 1 đến 1000 mẫu.");
  }

  const normalized = readings
    .map((reading) => {
      const temperature = Number(reading?.temperature);
      const date = new Date(reading?.timestamp);
      if (
        !Number.isFinite(temperature) ||
        Number.isNaN(date.getTime()) ||
        date > new Date()
      ) {
        throw new Error(
          "Mỗi mẫu cần nhiệt độ hợp lệ và thời điểm không ở tương lai.",
        );
      }
      return { temperature, timestamp: date.toISOString() };
    })
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

  const db = getDb();
  const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
  if (!batch) throw new Error("Không tìm thấy lô hàng.");

  db.exec("BEGIN IMMEDIATE");
  try {
    const insertLog = db.prepare(
      "INSERT INTO temperature_logs(batch_id, temperature, source, timestamp) VALUES (?, ?, 'sensor_simulation', ?)",
    );
    for (const reading of normalized) {
      insertLog.run(batchId, reading.temperature, reading.timestamp);
    }

    const latestReadings = db
      .prepare(
        "SELECT temperature, timestamp FROM temperature_logs WHERE batch_id = ? ORDER BY timestamp ASC, id ASC",
      )
      .all(batchId);
    let runStart = null;
    let previousAt = null;
    let violatingStart = null;
    let violatingEnd = null;

    for (const reading of latestReadings) {
      const at = new Date(reading.timestamp).getTime();
      if (Number(reading.temperature) > SAFE_TEMPERATURE_C) {
        if (previousAt === null || at - previousAt > MAX_SAMPLE_GAP_MS) {
          runStart = at;
          violatingStart = null;
          violatingEnd = null;
        }
        if (at - runStart > ALERT_DURATION_MS) {
          violatingStart ??= runStart;
          violatingEnd = at;
        }
      } else {
        runStart = null;
        violatingStart = null;
        violatingEnd = null;
      }
      previousAt = at;
    }

    const lastReading = normalized.at(-1);
    const activeAlert = db
      .prepare(
        "SELECT id FROM cold_chain_alerts WHERE batch_id = ? AND alert_type = 'temperature' AND resolved_at IS NULL ORDER BY id DESC LIMIT 1",
      )
      .get(batchId);
    let alert = null;

    if (violatingStart !== null) {
      if (!activeAlert) {
        const detectedAt = new Date(violatingEnd).toISOString();
        const inserted = db
          .prepare(
            "INSERT INTO cold_chain_alerts(batch_id, alert_type, message, started_at, detected_at) VALUES (?, 'temperature', ?, ?, ?)",
          )
          .run(
            batchId,
            "Vi phạm chuỗi lạnh: nhiệt độ vượt 8°C liên tục quá 30 phút.",
            new Date(violatingStart).toISOString(),
            detectedAt,
          );
        alert = { id: inserted.lastInsertRowid, detectedAt };

        const recipients = db
          .prepare(
            "SELECT id, organization_id FROM users WHERE organization_id = ? AND is_active = 1",
          )
          .all(batch.organization_id);
        const addNotification = db.prepare(
          "INSERT INTO notifications(user_id, organization_id, kind, title, message) VALUES (?, ?, 'cold_chain_alert', ?, ?)",
        );
        for (const recipient of recipients) {
          addNotification.run(
            recipient.id,
            recipient.organization_id,
            "Vi phạm chuỗi lạnh",
            `Lô ${batch.batch_code} vượt ngưỡng nhiệt độ liên tục hơn 30 phút.`,
          );
        }
        createEventLog({
          batchId,
          eventType: "cold_chain_violation",
          actorId,
          data: {
            threshold_c: SAFE_TEMPERATURE_C,
            duration_minutes: 30,
            started_at: new Date(violatingStart).toISOString(),
            detected_at: detectedAt,
          },
          timestamp: detectedAt,
        });
      } else {
        alert = activeAlert;
      }
      db.prepare(
        "UPDATE batches SET temperature_c = ?, cold_chain_alert = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(lastReading.temperature, batchId);
    } else {
      if (activeAlert) {
        db.prepare(
          "UPDATE cold_chain_alerts SET resolved_at = ? WHERE id = ?",
        ).run(lastReading.timestamp, activeAlert.id);
      }
      db.prepare(
        "UPDATE batches SET temperature_c = ?, cold_chain_alert = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(lastReading.temperature, batchId);
    }

    createEventLog({
      batchId,
      eventType: "temperature_series_recorded",
      actorId,
      data: {
        sample_count: normalized.length,
        latest_temperature_c: lastReading.temperature,
        alert_active: violatingStart !== null,
      },
      timestamp: lastReading.timestamp,
    });

    db.exec("COMMIT");
    return {
      batchId,
      sampleCount: normalized.length,
      latestTemperature: lastReading.temperature,
      thresholdC: SAFE_TEMPERATURE_C,
      alertActive: violatingStart !== null,
      alert,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getTemperatureHistory(batchId) {
  return getDb()
    .prepare(
      "SELECT id, batch_id, temperature, source, timestamp FROM temperature_logs WHERE batch_id = ? ORDER BY timestamp ASC, id ASC",
    )
    .all(batchId);
}
