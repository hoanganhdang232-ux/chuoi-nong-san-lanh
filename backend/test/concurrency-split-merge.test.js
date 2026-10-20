import test from "node:test";
import assert from "node:assert/strict";

const { createApp } = await import("../src/app.js");
const { getDb } = await import("../src/db/database.js");
const { runMigrations } = await import("../src/db/migrations.js");
const { seedDemoData } = await import("../src/db/seed.js");
const { createToken, findUserByEmail } = await import("../src/services/authService.js");
const { eventRepository } = await import("../src/repositories/eventRepository.js");

let server;
let baseUrl;
const db = getDb();

function resetDatabase() {
  runMigrations();
  db.exec(`
    DROP TRIGGER IF EXISTS event_logs_prevent_update;
    DROP TRIGGER IF EXISTS event_logs_prevent_delete;
  `);
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("DELETE FROM event_logs");
  db.exec("DELETE FROM batch_lineage");
  db.exec("DELETE FROM batch_relations");
  db.exec("DELETE FROM batch_transfers");
  db.exec("DELETE FROM batches");
  db.exec("DELETE FROM locations");
  db.exec("DELETE FROM products");
  db.exec("DELETE FROM land_plots");
  db.exec("DELETE FROM farms");
  db.exec("DELETE FROM users");
  db.exec("DELETE FROM organizations");
  db.exec("DELETE FROM sqlite_sequence");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations();
  seedDemoData();
}

test.before(async () => {
  resetDatabase();
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// =========================================================================
// STORY 1: S-18 & S-17 (Tách lô & Kiểm soát đồng thời - Race Condition Prevention)
// =========================================================================
test("STORY 1 (S-17, S-18): Concurrent split requests prevent over-allocation via pessimistic locking", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  // 1. Tạo 1 lô hàng ban đầu có 100 kg
  const product = db.prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1").get(farm.organization_id);
  const farmRecord = db.prepare("SELECT id FROM farms WHERE organization_id = ? LIMIT 1").get(farm.organization_id);

  const insertStmt = db.prepare(`
    INSERT INTO batches(
      batch_code, product_id, organization_id, source_farm_id,
      initial_quantity, remaining_quantity, current_location, temperature_c, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialCode = `BATCH-CONCURRENCY-${Date.now()}`;
  const insertRes = insertStmt.run(
    initialCode,
    product.id,
    farm.organization_id,
    farmRecord.id,
    100,
    100,
    "Kho Tổng",
    5,
    "registered"
  );
  const parentBatchId = insertRes.lastInsertRowid;

  // Ghi nhận sự kiện khởi tạo ban đầu
  eventRepository.appendEvent({
    batchId: parentBatchId,
    eventType: "batch_harvested",
    actorId: farm.id,
    payload: { initial_quantity: 100 },
  });

  // 2. Kích hoạt 5 requests đồng thời, mỗi request cố gắng tách 30 kg
  // Tổng khối lượng yêu cầu: 5 x 30 = 150 kg > 100 kg hiện có!
  const splitRequests = Array.from({ length: 5 }, (_, idx) =>
    fetch(`${baseUrl}/api/batches/${parentBatchId}/split`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allocations: [{ quantity: 30, location: `Kho Phân Phối ${idx + 1}` }],
      }),
    })
  );

  const responses = await Promise.all(splitRequests);
  const statuses = responses.map((r) => r.status);
  const successResponses = statuses.filter((s) => s === 200);
  const rejectedResponses = statuses.filter((s) => s === 400);

  // ĐÚNG 3 requests được thành công (3 x 30 = 90 kg <= 100 kg)
  // ĐÚNG 2 requests bị từ chối 400 Bad Request (vượt quá 10 kg còn lại)
  assert.equal(successResponses.length, 3, "Chính xác 3 giao dịch tách lô được thành công");
  assert.equal(rejectedResponses.length, 2, "Chính xác 2 giao dịch bị từ chối do vượt khối lượng");

  // 3. Kiểm tra bản ghi lô mẹ trong CSDL
  const updatedParent = db.prepare("SELECT * FROM batches WHERE id = ?").get(parentBatchId);
  assert.equal(updatedParent.remaining_quantity, 10, "Lô mẹ chỉ còn lại chính xác 10 kg");

  // 4. Kiểm tra tổng khối lượng các lô con tạo ra
  const childBatches = db.prepare("SELECT * FROM batches WHERE parent_batch_id = ?").all(parentBatchId);
  assert.equal(childBatches.length, 3, "Có chính xác 3 lô con được sinh ra");
  const totalChildQuantity = childBatches.reduce((sum, c) => sum + c.remaining_quantity, 0);
  assert.equal(totalChildQuantity, 90, "Tổng khối lượng các lô con đúng bằng 90 kg");

  // 5. Kiểm tra bảng batch_lineage
  const lineageRows = db.prepare("SELECT * FROM batch_lineage WHERE parent_batch_id = ?").all(parentBatchId);
  assert.equal(lineageRows.length, 3, "Bảng batch_lineage có đủ 3 bản ghi phả hệ");
  for (const line of lineageRows) {
    assert.equal(line.quantity_transferred, 30);
  }

  // 6. Kiểm tra toàn vẹn Hash Chain của lô mẹ và toàn bộ lô con
  const parentChain = eventRepository.verifyBatchHashChain(parentBatchId);
  assert.equal(parentChain.valid, true, "Chuỗi Hash Chain của lô mẹ phải nguyên vẹn");

  for (const child of childBatches) {
    const childChain = eventRepository.verifyBatchHashChain(child.id);
    assert.equal(childChain.valid, true, `Chuỗi Hash Chain của lô con ${child.batch_code} phải nguyên vẹn`);
  }
});

// =========================================================================
// STORY 2: S-19 (Gộp nhiều lô cùng sản phẩm & Kiểm soát Deadlock)
// =========================================================================
test("STORY 2 (S-19): Deadlock prevention with ordered locking and business validations", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const processor = findUserByEmail("processor@agritrace.demo");
  const farmToken = createToken(farm);

  const product = db.prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1").get(farm.organization_id);
  const farmRecord = db.prepare("SELECT id FROM farms WHERE organization_id = ? LIMIT 1").get(farm.organization_id);

  // Tạo 2 lô mẹ A và B
  const createBatch = (code, qty) => {
    const res = db.prepare(`
      INSERT INTO batches(batch_code, product_id, organization_id, source_farm_id, initial_quantity, remaining_quantity, current_location, temperature_c, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(code, product.id, farm.organization_id, farmRecord.id, qty, qty, "Kho Sơ Chế", 6, "registered");
    eventRepository.appendEvent({
      batchId: res.lastInsertRowid,
      eventType: "batch_harvested",
      actorId: farm.id,
      payload: { initial_quantity: qty },
    });
    return res.lastInsertRowid;
  };

  const idA = createBatch(`BATCH-DEADLOCK-A-${Date.now()}`, 50);
  const idB = createBatch(`BATCH-DEADLOCK-B-${Date.now()}`, 50);

  // Test Deadlock Prevention:
  // Client 1 gửi [idB, idA] (thứ tự nghịch)
  // Client 2 gửi [idA, idB] (thứ tự thuận)
  // Hệ thống tự động sắp xếp tăng dần trước khi khóa nên KHÔNG BAO GIỜ bị Deadlock!
  const req1 = fetch(`${baseUrl}/api/batches/merge`, {
    method: "POST",
    headers: { Authorization: `Bearer ${farmToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ batchIds: [idB, idA], productId: product.id }),
  });

  const req2 = fetch(`${baseUrl}/api/batches/merge`, {
    method: "POST",
    headers: { Authorization: `Bearer ${farmToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ batchIds: [idA, idB], productId: product.id }),
  });

  const [res1, res2] = await Promise.all([req1, req2]);
  const statuses = [res1.status, res2.status];

  // Một trong 2 request sẽ hoàn tất gộp lô trước (200), request còn lại phát hiện các lô đã được gộp hết (remaining_quantity = 0) và trả về 400
  assert.ok(statuses.includes(200), "Giao dịch gộp đầu tiên phải thành công");
  assert.ok(statuses.includes(400), "Giao dịch gộp thứ hai bị từ chối do khối lượng đã được gộp hết");

  // Kiểm tra validations nghiệp vụ
  // 1. Từ chối gộp lô khác tổ chức
  const otherOrgBatchId = createBatch(`BATCH-OTHER-ORG-${Date.now()}`, 40);
  const processorToken = createToken(processor);
  const crossOrgRes = await fetch(`${baseUrl}/api/batches/merge`, {
    method: "POST",
    headers: { Authorization: `Bearer ${processorToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ batchIds: [idA, otherOrgBatchId] }),
  });
  assert.equal(crossOrgRes.status, 403, "Từ chối gộp các lô không thuộc quyền sở hữu (403)");

  // 2. Từ chối gộp khác product_id
  const product2 = db.prepare("INSERT INTO products(organization_id, name, unit) VALUES (?, ?, ?)").run(farm.organization_id, "Sản phẩm khác", "kg");
  const diffProductBatchId = db.prepare(`
    INSERT INTO batches(batch_code, product_id, organization_id, source_farm_id, initial_quantity, remaining_quantity, current_location, temperature_c, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`BATCH-DIFF-PROD-${Date.now()}`, product2.lastInsertRowid, farm.organization_id, farmRecord.id, 30, 30, "Kho B", 6, "registered").lastInsertRowid;
  eventRepository.appendEvent({ batchId: diffProductBatchId, eventType: "batch_harvested", actorId: farm.id, payload: {} });

  const freshBatchId = createBatch(`BATCH-FRESH-${Date.now()}`, 30);
  const diffProductRes = await fetch(`${baseUrl}/api/batches/merge`, {
    method: "POST",
    headers: { Authorization: `Bearer ${farmToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ batchIds: [freshBatchId, diffProductBatchId] }),
  });
  assert.equal(diffProductRes.status, 400, "Từ chối gộp các lô khác sản phẩm (400)");
});

// =========================================================================
// STORY 3: S-20 (Hash Chain Integrity & Lineage Verification)
// =========================================================================
test("STORY 3 (S-20): Event logging with SPLIT, SPLIT_CHILD, MERGE, MERGE_CHILD and Hash Chain integrity", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);
  const product = db.prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1").get(farm.organization_id);
  const farmRecord = db.prepare("SELECT id FROM farms WHERE organization_id = ? LIMIT 1").get(farm.organization_id);

  // 1. Tạo lô gốc
  const rootId = db.prepare(`
    INSERT INTO batches(batch_code, product_id, organization_id, source_farm_id, initial_quantity, remaining_quantity, current_location, temperature_c, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`BATCH-TRACE-${Date.now()}`, product.id, farm.organization_id, farmRecord.id, 80, 80, "Kho A", 5, "registered").lastInsertRowid;

  eventRepository.appendEvent({
    batchId: rootId,
    eventType: "batch_harvested",
    actorId: farm.id,
    payload: { harvest_notes: "Chuẩn GlobalGAP" },
  });

  // 2. Thực hiện Tách lô
  const splitRes = await fetch(`${baseUrl}/api/batches/${rootId}/split`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      allocations: [
        { quantity: 30, location: "Kho Con 1" },
        { quantity: 50, location: "Kho Con 2" },
      ],
    }),
  });
  assert.equal(splitRes.status, 200);
  const splitData = await splitRes.json();
  const child1Id = splitData.children[0].id;
  const child2Id = splitData.children[1].id;

  // Kiểm tra sự kiện SPLIT trên lô mẹ
  const parentEvents = db.prepare("SELECT * FROM event_logs WHERE batch_id = ? ORDER BY id ASC").all(rootId);
  const splitEvent = parentEvents.find((e) => e.event_type === "SPLIT");
  assert.ok(splitEvent, "Lô mẹ phải có sự kiện SPLIT");
  const splitPayload = JSON.parse(splitEvent.data_json);
  assert.equal(splitPayload.total_quantity_allocated, 80);
  assert.deepEqual(splitPayload.child_batch_ids, [child1Id, child2Id]);

  // Kiểm tra sự kiện SPLIT_CHILD trên từng lô con
  const child1Events = db.prepare("SELECT * FROM event_logs WHERE batch_id = ?").all(child1Id);
  const child1Event = child1Events.find((e) => e.event_type === "SPLIT_CHILD");
  assert.ok(child1Event, "Lô con 1 phải có sự kiện SPLIT_CHILD");
  const child1Payload = JSON.parse(child1Event.data_json);
  assert.equal(child1Payload.parent_batch_id, rootId);

  // 3. Thực hiện Gộp lô (gộp child1 và child2 thành mergedBatch)
  const mergeRes = await fetch(`${baseUrl}/api/batches/merge`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      batchIds: [child1Id, child2Id],
      productId: product.id,
      note: "Hợp nhất đóng gói",
    }),
  });
  assert.equal(mergeRes.status, 200);
  const mergeData = await mergeRes.json();
  const mergedId = mergeData.newBatch.id;

  // Kiểm tra sự kiện MERGE trên 2 lô thành phần
  const child1EventsAfter = db.prepare("SELECT * FROM event_logs WHERE batch_id = ?").all(child1Id);
  const mergeOutEvent = child1EventsAfter.find((e) => e.event_type === "MERGE");
  assert.ok(mergeOutEvent, "Lô con 1 phải có sự kiện MERGE khi được gộp");

  // Kiểm tra sự kiện MERGE_CHILD trên lô mới
  const mergedEvents = db.prepare("SELECT * FROM event_logs WHERE batch_id = ?").all(mergedId);
  const mergeInEvent = mergedEvents.find((e) => e.event_type === "MERGE_CHILD");
  assert.ok(mergeInEvent, "Lô mới phải có sự kiện MERGE_CHILD");
  const mergeInPayload = JSON.parse(mergeInEvent.data_json);
  assert.equal(mergeInPayload.total_quantity, 80);

  // 4. Kiểm tra toàn vẹn Hash Chain qua endpoint GET /:id/integrity
  for (const id of [rootId, child1Id, child2Id, mergedId]) {
    const integrityRes = await fetch(`${baseUrl}/api/batches/${id}/integrity`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(integrityRes.status, 200);
    const integrity = await integrityRes.json();
    assert.equal(integrity.valid, true, `Hash chain của lô ${id} phải hợp lệ`);
    assert.equal(integrity.broken, false);
    assert.equal(integrity.invalidEventIds.length, 0);
  }

  // 5. Kiểm tra view events (alias sang event_logs)
  const viewEvents = db.prepare("SELECT id, batch_id, event_type, payload, prev_hash, hash FROM events WHERE batch_id = ?").all(mergedId);
  assert.ok(viewEvents.length > 0, "View events phải đọc được dữ liệu");
  assert.equal(viewEvents[0].event_type, "MERGE_CHILD");
});
