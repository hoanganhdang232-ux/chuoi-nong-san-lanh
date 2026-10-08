import { getDb } from "../db/database.js";
import { parseBatchIds } from "./batchService.js";

const PUBLIC_EVENT_LABELS = {
  batch_harvested: "Thu hoạch",
  batch_transferred: "Bàn giao vận chuyển",
  batch_in_transit: "Đang vận chuyển",
  batch_delivered: "Đã giao nhận",
  batch_processed: "Sơ chế",
  batch_recalled: "Có lệnh thu hồi",
  cold_chain_violation: "Cảnh báo chuỗi lạnh",
  temperature_series_recorded: "Cập nhật giám sát nhiệt độ",
};

export function getPublicTrace(batchCode) {
  const db = getDb();
  const batch = db
    .prepare(
      `SELECT b.id, b.batch_code, b.status, b.cold_chain_alert,
            p.name AS product_name, f.address AS growing_region
     FROM batches b
     INNER JOIN products p ON p.id = b.product_id
     LEFT JOIN farms f ON f.id = b.source_farm_id
     WHERE b.batch_code = ?`,
    )
    .get(batchCode);
  if (!batch) return null;

  const allBatches = db
    .prepare(
      "SELECT id, parent_batch_id, source_batch_ids, cold_chain_alert FROM batches",
    )
    .all();
  const batchesById = new Map(allBatches.map((row) => [row.id, row]));
  const lineageIds = [];
  const visited = new Set();
  const pending = [batch.id];
  let lineageHasAlert = false;
  while (pending.length) {
    const currentId = pending.pop();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    const current = batchesById.get(currentId);
    if (!current) continue;
    lineageIds.push(currentId);
    lineageHasAlert ||= Boolean(current.cold_chain_alert);
    if (current.parent_batch_id) pending.push(current.parent_batch_id);
    pending.push(...parseBatchIds(current.source_batch_ids));
  }
  const lineagePlaceholders = lineageIds.map(() => "?").join(", ");

  const harvestJournal = db
    .prepare(
      `SELECT timestamp, data_json FROM event_logs WHERE batch_id IN (${lineagePlaceholders}) AND event_type = 'batch_harvested' ORDER BY timestamp`,
    )
    .all(...lineageIds)
    .map((event) => {
      let harvestedAt = event.timestamp;
      try {
        harvestedAt = JSON.parse(event.data_json).harvested_at || harvestedAt;
      } catch {
        // Use the immutable event timestamp when legacy event JSON is invalid.
      }
      return { harvestedAt };
    });

  const transportHistory = db
    .prepare(
      `SELECT event_type, timestamp FROM event_logs
       WHERE batch_id IN (${lineagePlaceholders}) ORDER BY timestamp, id`,
    )
    .all(...lineageIds)
    .filter((event) => PUBLIC_EVENT_LABELS[event.event_type])
    .map((event) => ({
      stage: PUBLIC_EVENT_LABELS[event.event_type],
      timestamp: event.timestamp,
    }));

  const temperatureSeries = db
    .prepare(
      "SELECT temperature, timestamp FROM temperature_logs WHERE batch_id = ? ORDER BY timestamp, id",
    )
    .all(batch.id);

  return {
    batchCode: batch.batch_code,
    productName: batch.product_name,
    growingRegion: batch.growing_region,
    harvestJournal,
    transportHistory,
    safetyStatus:
      batch.status === "recalled"
        ? "Đang thu hồi"
        : lineageHasAlert
          ? "Vi phạm chuỗi lạnh"
          : "Chưa ghi nhận cảnh báo",
    temperatureSeries,
  };
}
