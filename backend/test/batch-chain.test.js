import test from "node:test";
import assert from "node:assert/strict";

const { getDb } = await import("../src/db/database.js");
const { runMigrations } = await import("../src/db/migrations.js");
const { seedDemoData } = await import("../src/db/seed.js");
const { createEventLog, verifyBatchChain } = await import("../src/services/batchService.js");

const db = getDb();

function resetDatabase() {
  runMigrations();
  db.exec(`
    DROP TRIGGER IF EXISTS event_logs_prevent_update;
    DROP TRIGGER IF EXISTS event_logs_prevent_delete;
  `);
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("DELETE FROM event_logs");
  db.exec("DELETE FROM batch_transfers");
  db.exec("DELETE FROM batches");
  db.exec("DELETE FROM products");
  db.exec("DELETE FROM land_plots");
  db.exec("DELETE FROM farms");
  db.exec("DELETE FROM users");
  db.exec("DELETE FROM organizations");
  db.exec("DELETE FROM sqlite_sequence");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations();
  db.exec(`
    DROP TRIGGER IF EXISTS event_logs_prevent_update;
    DROP TRIGGER IF EXISTS event_logs_prevent_delete;
  `);
  seedDemoData();
}

test.beforeEach(() => {
  resetDatabase();
});

test("AC1 - Lô nguyên vẹn", async () => {
  // Insert a test batch
  const batchResult = db.prepare("INSERT INTO batches(product_id, organization_id, source_farm_id, status, batch_code, initial_quantity, remaining_quantity) VALUES(1, 1, 1, 'registered', 'B001', 100, 100)").run();
  const batchId = batchResult.lastInsertRowid;
  
  createEventLog({ batchId, eventType: "batch_harvested", actorId: 1, data: { foo: "bar1" } });
  createEventLog({ batchId, eventType: "batch_processed", actorId: 1, data: { foo: "bar2" } });
  createEventLog({ batchId, eventType: "batch_packaged", actorId: 1, data: { foo: "bar3" } });

  const result = verifyBatchChain(batchId);
  assert.equal(result.is_valid, true);
  assert.equal(result.total_events, 3);
  assert.equal(result.first_broken_index, null);
  assert.equal(result.error_type, null);
  
  for (const event of result.events) {
    assert.equal(event.status, "VALID");
  }
});

test("AC2 - Sửa nội dung bằng SQL", async () => {
  const batchResult = db.prepare("INSERT INTO batches(product_id, organization_id, source_farm_id, status, batch_code, initial_quantity, remaining_quantity) VALUES(1, 1, 1, 'registered', 'B001', 100, 100)").run();
  const batchId = batchResult.lastInsertRowid;
  
  const e1 = createEventLog({ batchId, eventType: "batch_harvested", actorId: 1, data: { val: 1 } });
  const e2 = createEventLog({ batchId, eventType: "batch_processed", actorId: 1, data: { val: 2 } });
  const e3 = createEventLog({ batchId, eventType: "batch_packaged", actorId: 1, data: { val: 3 } });
  
  // Directly tamper with e2 using SQL
  db.exec("DROP TRIGGER IF EXISTS event_logs_prevent_update");
  db.prepare("UPDATE event_logs SET data_json = ? WHERE id = ?").run(JSON.stringify({ val: 999 }), e2.eventId);

  const result = verifyBatchChain(batchId);
  assert.equal(result.is_valid, false);
  assert.equal(result.error_type, "CONTENT_TAMPERED");
  assert.equal(result.first_broken_index, 1); // e2 is index 1
  assert.equal(result.first_broken_event_id, e2.eventId);
  
  assert.equal(result.events[0].status, "VALID");
  assert.equal(result.events[1].status, "TAMPERED");
  assert.equal(result.events[2].status, "SUSPECT");
});

test("AC3 - Xóa sự kiện ở giữa chuỗi", async () => {
  const batchResult = db.prepare("INSERT INTO batches(product_id, organization_id, source_farm_id, status, batch_code, initial_quantity, remaining_quantity) VALUES(1, 1, 1, 'registered', 'B001', 100, 100)").run();
  const batchId = batchResult.lastInsertRowid;
  
  const e1 = createEventLog({ batchId, eventType: "batch_harvested", actorId: 1, data: { val: 1 } });
  const e2 = createEventLog({ batchId, eventType: "batch_processed", actorId: 1, data: { val: 2 } });
  const e3 = createEventLog({ batchId, eventType: "batch_packaged", actorId: 1, data: { val: 3 } });

  // Delete middle event
  db.exec("DROP TRIGGER IF EXISTS event_logs_prevent_delete");
  db.prepare("DELETE FROM event_logs WHERE id = ?").run(e2.eventId);

  const result = verifyBatchChain(batchId);
  assert.equal(result.is_valid, false);
  assert.equal(result.error_type, "CHAIN_BROKEN");
  assert.equal(result.first_broken_index, 1); // e3 is now at index 1
  assert.equal(result.first_broken_event_id, e3.eventId); // The link breaks starting from e3's prev hash expectation
  
  assert.equal(result.events[0].status, "VALID");
  assert.equal(result.events[1].status, "SUSPECT");
});

test("AC4 - Lô chỉ có 1 sự kiện", async () => {
  const batchResult = db.prepare("INSERT INTO batches(product_id, organization_id, source_farm_id, status, batch_code, initial_quantity, remaining_quantity) VALUES(1, 1, 1, 'registered', 'B001', 100, 100)").run();
  const batchId = batchResult.lastInsertRowid;
  
  createEventLog({ batchId, eventType: "batch_harvested", actorId: 1, data: { val: 1 } });

  const result = verifyBatchChain(batchId);
  assert.equal(result.is_valid, true);
  assert.equal(result.total_events, 1);
  assert.equal(result.error_type, null);
  assert.equal(result.events[0].status, "VALID");
});

test("Edge case - Batch not found", async () => {
  const result = verifyBatchChain(99999);
  assert.equal(result.is_valid, false);
  assert.equal(result.error_type, "BATCH_NOT_FOUND");
});

test("Edge case - Batch has no events", async () => {
  const batchResult = db.prepare("INSERT INTO batches(product_id, organization_id, source_farm_id, status, batch_code, initial_quantity, remaining_quantity) VALUES(1, 1, 1, 'registered', 'B001', 100, 100)").run();
  const batchId = batchResult.lastInsertRowid;

  const result = verifyBatchChain(batchId);
  assert.equal(result.is_valid, true);
  assert.equal(result.total_events, 0);
  assert.equal(result.error_type, null);
});
