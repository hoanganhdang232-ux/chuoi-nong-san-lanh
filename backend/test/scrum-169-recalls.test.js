import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { getDb } from "../src/db/database.js";
import { createToken, findUserByEmail } from "../src/services/authService.js";

let server;
let baseUrl;
const db = getDb();

test.before(async () => {
  const count = db.prepare("SELECT COUNT(*) AS c FROM users").get()?.c || 0;
  if (count === 0) {
    const { seedDemoData } = await import("../src/db/seed.js");
    seedDemoData();
  }
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

// Helper to create a test batch
function createTestBatch(customStatus = "registered") {
  const farmOrg = db
    .prepare("SELECT id FROM organizations WHERE type = 'farm' LIMIT 1")
    .get();
  const product = db
    .prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1")
    .get(farmOrg.id);
  const farm = db
    .prepare("SELECT id FROM farms WHERE organization_id = ? LIMIT 1")
    .get(farmOrg.id);

  const batchCode = `BATCH-TEST-RECALL-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  const insert = db
    .prepare(
      `INSERT INTO batches (
        organization_id, product_id, source_farm_id, batch_code,
        initial_quantity, remaining_quantity, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run(farmOrg.id, product.id, farm ? farm.id : null, batchCode, 150, 150, customStatus);

  return {
    id: insert.lastInsertRowid,
    batch_code: batchCode,
    status: customStatus,
  };
}

test("SCRUM-169 Database: Table recall_orders and batches status enum exist", () => {
  // Check recall_orders table structure
  const tableInfo = db.prepare("PRAGMA table_info(recall_orders)").all();
  assert.ok(tableInfo.length > 0, "Table recall_orders must exist in SQLite");

  const columnNames = tableInfo.map((col) => col.name);
  assert.ok(columnNames.includes("id"), "recall_orders must have 'id'");
  assert.ok(columnNames.includes("batch_id"), "recall_orders must have 'batch_id'");
  assert.ok(columnNames.includes("reason"), "recall_orders must have 'reason'");
  assert.ok(columnNames.includes("status"), "recall_orders must have 'status'");
  assert.ok(columnNames.includes("created_by"), "recall_orders must have 'created_by'");
  assert.ok(columnNames.includes("created_at"), "recall_orders must have 'created_at'");

  // Verify batches can be inserted with status 'recalling'
  const testBatch = createTestBatch("recalling");
  assert.ok(testBatch.id > 0, "Should successfully insert batch with status 'recalling'");
  const fetched = db.prepare("SELECT status FROM batches WHERE id = ?").get(testBatch.id);
  assert.equal(fetched.status, "recalling");
});

test("SCRUM-169 API: 401 Unauthorized when missing token", async () => {
  const res = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch_id: 1, reason: "Phát hiện sự cố" }),
  });
  assert.equal(res.status, 401);
});

test("SCRUM-169 API: 403 Forbidden for unauthorized roles (distributor, processor, consumer, user)", async () => {
  const distributor = findUserByEmail("distributor@agritrace.demo");
  const processor = findUserByEmail("processor@agritrace.demo");
  const consumer = findUserByEmail("consumer@agritrace.demo");
  const basicUser = findUserByEmail("user@agritrace.demo");

  const rolesToTest = [
    { user: distributor, name: "distributor_admin" },
    { user: processor, name: "processor_admin" },
    { user: consumer, name: "consumer" },
    { user: basicUser, name: "user" },
  ];

  for (const item of rolesToTest) {
    assert.ok(item.user, `User ${item.name} should exist`);
    const token = createToken(item.user);
    const res = await fetch(`${baseUrl}/api/v1/recalls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        batch_id: 1,
        reason: "Test unauthorized recall attempt",
      }),
    });
    assert.equal(
      res.status,
      403,
      `Role ${item.name} must receive 403 Forbidden when initiating recall`,
    );
    const data = await res.json();
    assert.ok(data.message, "Should return informative 403 error message");
  }
});

test("SCRUM-169 API: 404 Not Found when batch_id does not exist", async () => {
  const farmAdmin = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farmAdmin);

  const res = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      batch_id: 9999999,
      reason: "Lô hàng không tồn tại",
    }),
  });

  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.message, "Không tìm thấy lô hàng.");
});

test("SCRUM-169 API: 400 Bad Request when missing reason or invalid batch_id", async () => {
  const farmAdmin = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farmAdmin);
  const batch = createTestBatch("registered");

  // Missing reason
  const resMissingReason = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      batch_id: batch.id,
      reason: "",
    }),
  });
  assert.equal(resMissingReason.status, 400);
  const dataMissingReason = await resMissingReason.json();
  assert.equal(dataMissingReason.message, "Thiếu thông tin lý do thu hồi.");

  // Missing batch_id
  const resMissingBatch = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: "Phát hiện dư lượng thuốc BVTV",
    }),
  });
  assert.equal(resMissingBatch.status, 400);
  const dataMissingBatch = await resMissingBatch.json();
  assert.equal(dataMissingBatch.message, "Mã định danh lô hàng (batch_id) là bắt buộc.");
});

test("SCRUM-169 API: 201 Created when initiating recall with farm_admin and audit log verification", async () => {
  const farmAdmin = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farmAdmin);
  const batch = createTestBatch("registered");

  const recallReason = "Phát hiện vi phạm tiêu chuẩn dư lượng thuốc bảo vệ thực vật";

  const res = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      batch_id: batch.id,
      reason: recallReason,
    }),
  });

  assert.equal(res.status, 201);
  const responseData = await res.json();

  // Validate response shape
  assert.ok(responseData.recall_order, "Response must include recall_order");
  assert.equal(responseData.recall_order.batch_id, batch.id);
  assert.equal(responseData.recall_order.reason, recallReason);
  assert.equal(responseData.recall_order.status, "opened");
  assert.equal(responseData.recall_order.created_by, farmAdmin.id);
  assert.ok(responseData.recall_order.created_at);

  assert.ok(responseData.batch, "Response must include updated batch");
  assert.equal(responseData.batch.id, batch.id);
  assert.equal(responseData.batch.status, "recalling");

  // Verify Database State
  const dbBatch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batch.id);
  assert.equal(dbBatch.status, "recalling", "Batch status in DB must be 'recalling'");

  const dbOrder = db
    .prepare("SELECT * FROM recall_orders WHERE id = ?")
    .get(responseData.recall_order.id);
  assert.ok(dbOrder, "Recall order must be persisted in DB");
  assert.equal(dbOrder.reason, recallReason);
  assert.equal(dbOrder.status, "opened");
  assert.equal(dbOrder.created_by, farmAdmin.id);

  // Verify Audit Log: RECALL_INITIATED with SHA-256 Hash Chain
  const eventLog = db
    .prepare(
      `SELECT * FROM event_logs
       WHERE batch_id = ? AND event_type = 'RECALL_INITIATED'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(batch.id);

  assert.ok(eventLog, "An event log with event_type = 'RECALL_INITIATED' must exist");
  assert.equal(eventLog.actor_id, farmAdmin.id);
  assert.ok(eventLog.current_hash, "Hash chain must compute SHA-256 hash");
  assert.ok(eventLog.previous_hash !== undefined, "Previous hash must be present");

  const logData = JSON.parse(eventLog.data_json);
  assert.equal(logData.recall_order_id, responseData.recall_order.id);
  assert.equal(logData.reason, recallReason);
  assert.equal(logData.new_status, "recalling");
});

test("SCRUM-169 API: 400 Bad Request when batch is already in 'recalling' or 'recalled' status", async () => {
  const farmAdmin = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farmAdmin);

  // Test already recalling batch
  const recallingBatch = createTestBatch("recalling");
  const resRecalling = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      batch_id: recallingBatch.id,
      reason: "Thử mở lệnh thu hồi lần 2",
    }),
  });
  assert.equal(resRecalling.status, 400);
  const dataRecalling = await resRecalling.json();
  assert.match(dataRecalling.message, /đã ở trạng thái 'recalling'/i);

  // Test already recalled batch
  const recalledBatch = createTestBatch("recalled");
  const resRecalled = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      batch_id: recalledBatch.id,
      reason: "Thử thu hồi lô đã recalled",
    }),
  });
  assert.equal(resRecalled.status, 400);
  const dataRecalled = await resRecalled.json();
  assert.match(dataRecalled.message, /đã ở trạng thái 'recalled'/i);
});

test("SCRUM-169 API: 201 Created when initiating recall via auditor and system_admin", async () => {
  const auditor = findUserByEmail("auditor@agritrace.demo");
  assert.ok(auditor, "Auditor must exist");
  const auditorToken = createToken(auditor);

  const batch1 = createTestBatch("registered");
  const resAuditor = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auditorToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      batch_id: batch1.id,
      reason: "Cán bộ kiểm tra phát hiện vi phạm vệ sinh an toàn",
    }),
  });
  assert.equal(resAuditor.status, 201);
  const dataAuditor = await resAuditor.json();
  assert.equal(dataAuditor.recall_order.created_by, auditor.id);
  assert.equal(dataAuditor.batch.status, "recalling");

  // System admin test
  const systemAdmin = findUserByEmail("admin@agritrace.demo");
  assert.ok(systemAdmin, "System admin must exist");
  const adminToken = createToken(systemAdmin);

  const batch2 = createTestBatch("registered");
  const resAdmin = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      batch_id: batch2.id,
      reason: "System Admin mở lệnh thu hồi khẩn cấp",
    }),
  });
  assert.equal(resAdmin.status, 201);
  const dataAdmin = await resAdmin.json();
  assert.equal(dataAdmin.recall_order.created_by, systemAdmin.id);
  assert.equal(dataAdmin.batch.status, "recalling");
});

test("SCRUM-169 API: Parameter route POST /api/v1/batches/:id/recall works identically", async () => {
  const farmAdmin = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farmAdmin);
  const batch = createTestBatch("processed");

  const res = await fetch(`${baseUrl}/api/v1/batches/${batch.id}/recall`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: "Thu hồi qua endpoint /batches/:id/recall",
    }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.recall_order.batch_id, batch.id);
  assert.equal(data.batch.status, "recalling");

  const dbBatch = db.prepare("SELECT status FROM batches WHERE id = ?").get(batch.id);
  assert.equal(dbBatch.status, "recalling");
});

test("SCRUM-169 API: GET /api/v1/recalls lists recall orders", async () => {
  const auditor = findUserByEmail("auditor@agritrace.demo");
  const token = createToken(auditor);

  const res = await fetch(`${baseUrl}/api/v1/recalls`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 200);
  const orders = await res.json();
  assert.ok(Array.isArray(orders), "Response should be an array of recall orders");
  assert.ok(orders.length > 0, "Should contain created recall orders");
  assert.ok(orders[0].batch_code, "Should include joined batch_code");
  assert.ok(orders[0].product_name, "Should include joined product_name");
});
