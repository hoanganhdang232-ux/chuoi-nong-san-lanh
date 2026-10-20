import { getDb } from "../db/database.js";
import { parseBatchIds, createEventLog } from "./batchService.js";

export function traceForward(rootBatchId) {
  const allBatches = getDb().prepare("SELECT * FROM batches ORDER BY id").all();
  const byId = new Map(allBatches.map((batch) => [batch.id, batch]));
  const descendants = [];
  const visited = new Set();
  const queue = [Number(rootBatchId)];

  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    const current = byId.get(currentId);
    if (!current) continue;
    descendants.push(current);

    for (const candidate of allBatches) {
      if (
        candidate.parent_batch_id === currentId ||
        parseBatchIds(candidate.source_batch_ids).includes(currentId)
      ) {
        if (!visited.has(candidate.id)) queue.push(candidate.id);
      }
    }
  }

  return descendants;
}

export function activateRecall({ rootBatchId, reason, actorId }) {
  const db = getDb();
  const root = db
    .prepare("SELECT * FROM batches WHERE id = ?")
    .get(rootBatchId);
  if (!root) throw new Error("Không tìm thấy lô gốc.");
  if (typeof reason !== "string" || reason.trim().length < 5) {
    throw new Error("Lý do thu hồi cần có ít nhất 5 ký tự.");
  }

  const affectedBatches = traceForward(rootBatchId);
  db.exec("BEGIN IMMEDIATE");
  try {
    const inserted = db
      .prepare(
        "INSERT INTO recall_cases(root_batch_id, reason, triggered_by) VALUES (?, ?, ?)",
      )
      .run(rootBatchId, reason.trim(), actorId);
    const recallId = inserted.lastInsertRowid;
    const insertItem = db.prepare(
      "INSERT INTO recall_items(recall_id, batch_id, organization_id, current_location, remaining_quantity, consumed_quantity) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const recipients = new Map();
    const notification = db.prepare(
      "INSERT INTO notifications(user_id, organization_id, kind, title, message) VALUES (?, ?, 'recall', ?, ?)",
    );

    for (const batch of affectedBatches) {
      const remaining = Number(batch.remaining_quantity || 0);
      const consumed = Number(batch.consumed_quantity || 0);
      insertItem.run(
        recallId,
        batch.id,
        batch.organization_id,
        batch.current_location,
        remaining,
        consumed,
      );
      db.prepare(
        "UPDATE batches SET status = 'recalled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(batch.id);
      createEventLog({
        batchId: batch.id,
        eventType: "batch_recalled",
        actorId,
        data: {
          recall_id: recallId,
          root_batch_id: rootBatchId,
          reason: reason.trim(),
        },
      });

      if (!recipients.has(batch.organization_id)) {
        recipients.set(
          batch.organization_id,
          db
            .prepare(
              "SELECT id, organization_id FROM users WHERE organization_id = ? AND is_active = 1",
            )
            .all(batch.organization_id),
        );
      }
      for (const user of recipients.get(batch.organization_id)) {
        notification.run(
          user.id,
          user.organization_id,
          "Lệnh thu hồi khẩn cấp",
          `Lô ${batch.batch_code} thuộc phạm vi thu hồi ${recallId}. Ngừng phân phối và cách ly hàng còn lại.`,
        );
      }
    }

    db.exec("COMMIT");
    return getRecallReport(recallId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getRecallReport(recallId) {
  const db = getDb();
  const recall = db
    .prepare(
      `SELECT rc.*, b.batch_code AS root_batch_code, u.name AS triggered_by_name
     FROM recall_cases rc
     INNER JOIN batches b ON b.id = rc.root_batch_id
     INNER JOIN users u ON u.id = rc.triggered_by
     WHERE rc.id = ?`,
    )
    .get(recallId);
  if (!recall) return null;

  const items = db
    .prepare(
      `SELECT ri.batch_id, ri.organization_id, b.batch_code, p.name AS product_name, o.name AS organization_name,
            ri.current_location, ri.remaining_quantity, ri.consumed_quantity, b.status
     FROM recall_items ri
     INNER JOIN batches b ON b.id = ri.batch_id
     INNER JOIN products p ON p.id = b.product_id
     INNER JOIN organizations o ON o.id = ri.organization_id
     WHERE ri.recall_id = ? ORDER BY b.id`,
    )
    .all(recallId);

  return {
    ...recall,
    items,
    totals: items.reduce(
      (totals, item) => ({
        remainingQuantity:
          totals.remainingQuantity + Number(item.remaining_quantity),
        consumedQuantity:
          totals.consumedQuantity + Number(item.consumed_quantity),
      }),
      { remainingQuantity: 0, consumedQuantity: 0 },
    ),
  };
}

export function listRecallReports() {
  const ids = getDb()
    .prepare("SELECT id FROM recall_cases ORDER BY created_at DESC")
    .all();
  return ids.map(({ id }) => getRecallReport(id));
}
