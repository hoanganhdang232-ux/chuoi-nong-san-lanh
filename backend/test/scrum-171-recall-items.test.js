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

// Helper to create multiple batches at different organizations/locations with split/transfer relationships
function setupMultiBatchRecallScenario() {
  const farmOrg = db.prepare("SELECT * FROM organizations WHERE type = 'farm' LIMIT 1").get();
  const processorOrg = db.prepare("SELECT * FROM organizations WHERE type = 'processor' LIMIT 1").get();
  const distributorOrg = db.prepare("SELECT * FROM organizations WHERE type = 'distributor' LIMIT 1").get();
  const product = db.prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1").get(farmOrg.id);
  const farm = db.prepare("SELECT id FROM farms WHERE organization_id = ? LIMIT 1").get(farmOrg.id);

  // Create store / locations for distributor
  const locStore1 = db
    .prepare("INSERT INTO locations (organization_id, code, name, address) VALUES (?, ?, ?, ?)")
    .run(distributorOrg.id, `LOC-STORE1-${Date.now()}`, "Cửa hàng Nông sản An Toàn #1", "123 Đường ABC, Quận 1");
  const locStore2 = db
    .prepare("INSERT INTO locations (organization_id, code, name, address) VALUES (?, ?, ?, ?)")
    .run(distributorOrg.id, `LOC-STORE2-${Date.now()}`, "Kho Tổng Hà Nội", "456 Đường XYZ, Cầu Giấy");

  const timestamp = Date.now();

  // 1. Root batch at Farm: 500 kg
  const rootCode = `BATCH-ROOT-${timestamp}`;
  const insertRoot = db
    .prepare(
      `INSERT INTO batches (
        organization_id, product_id, source_farm_id, batch_code,
        initial_quantity, remaining_quantity, consumed_quantity, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'registered', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run(farmOrg.id, product.id, farm.id, rootCode, 500, 500, 0);
  const rootBatchId = insertRoot.lastInsertRowid;

  // 2. Child batch 1 at Distributor Store #1: initial 100 kg, remaining 80 kg, consumed 20 kg
  const child1Code = `BATCH-STORE1-${timestamp}`;
  const insertChild1 = db
    .prepare(
      `INSERT INTO batches (
        organization_id, product_id, source_farm_id, location_id, parent_batch_id, batch_code,
        initial_quantity, remaining_quantity, consumed_quantity, status, current_location, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', '123 Đường ABC, Quận 1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run(distributorOrg.id, product.id, farm.id, locStore1.lastInsertRowid, rootBatchId, child1Code, 100, 80, 20);
  const child1Id = insertChild1.lastInsertRowid;

  // 3. Child batch 2 at Distributor Warehouse: initial 200 kg, remaining 150 kg, consumed 50 kg
  const child2Code = `BATCH-STORE2-${timestamp}`;
  const insertChild2 = db
    .prepare(
      `INSERT INTO batches (
        organization_id, product_id, source_farm_id, location_id, parent_batch_id, batch_code,
        initial_quantity, remaining_quantity, consumed_quantity, status, current_location, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', '456 Đường XYZ, Cầu Giấy', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run(distributorOrg.id, product.id, farm.id, locStore2.lastInsertRowid, rootBatchId, child2Code, 200, 150, 50);
  const child2Id = insertChild2.lastInsertRowid;

  // 4. Child batch 3 at Processor (HTX): initial 200 kg, remaining 100 kg, consumed 100 kg
  const child3Code = `BATCH-PROC-${timestamp}`;
  const insertChild3 = db
    .prepare(
      `INSERT INTO batches (
        organization_id, product_id, source_farm_id, parent_batch_id, batch_code,
        initial_quantity, remaining_quantity, consumed_quantity, status, current_location, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processed', 'Xưởng chế biến Hà Nội', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run(processorOrg.id, product.id, farm.id, rootBatchId, child3Code, 200, 100, 100);
  const child3Id = insertChild3.lastInsertRowid;

  // Record relations in batch_relations
  db.prepare("INSERT INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', ?)")
    .run(rootBatchId, child1Id, 100);
  db.prepare("INSERT INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', ?)")
    .run(rootBatchId, child2Id, 200);
  db.prepare("INSERT INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', ?)")
    .run(rootBatchId, child3Id, 200);

  return {
    rootBatchId,
    child1Id,
    child2Id,
    child3Id,
    expectedTotalBatches: 4, // Root + 3 children
    expectedRecallable: 500 + 80 + 150 + 100, // 830
    expectedConsumed: 0 + 20 + 50 + 100, // 170
  };
}

test("SCRUM-171: 401 Unauthorized when missing authorization token", async () => {
  const res = await fetch(`${baseUrl}/api/v1/recalls/1/items`);
  assert.equal(res.status, 401);
});

test("SCRUM-171: 403 Forbidden for unauthorized roles (user, consumer, processor_admin)", async () => {
  const consumer = findUserByEmail("consumer@agritrace.demo");
  const basicUser = findUserByEmail("user@agritrace.demo");
  const processor = findUserByEmail("processor@agritrace.demo");

  const unauthorizedUsers = [consumer, basicUser, processor];

  for (const u of unauthorizedUsers) {
    assert.ok(u, "User should exist");
    const token = createToken(u);
    const res = await fetch(`${baseUrl}/api/v1/recalls/1/items`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403, `Role ${u.role} must receive 403 Forbidden`);
    const data = await res.json();
    assert.equal(data.message, "Bạn không có quyền thực hiện thao tác này.");
  }
});

test("SCRUM-171: 404 Not Found when recall_id does not exist", async () => {
  const distributor = findUserByEmail("distributor@agritrace.demo");
  const token = createToken(distributor);

  const res = await fetch(`${baseUrl}/api/v1/recalls/9999999/items`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.message, "Không tìm thấy lệnh thu hồi.");
});

test("SCRUM-171: 200 OK - Full breakdown by location and accurate summary aggregation for multi-batch recall", async () => {
  const farmAdmin = findUserByEmail("farm@agritrace.demo");
  const farmToken = createToken(farmAdmin);
  const distributorAdmin = findUserByEmail("distributor@agritrace.demo");
  const distributorToken = createToken(distributorAdmin);

  // 1. Setup multi-batch scenario with root and 3 descendants at different stores/locations
  const scenario = setupMultiBatchRecallScenario();

  // 2. Open recall order via SCRUM-169 API
  const openRes = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${farmToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      batch_id: scenario.rootBatchId,
      reason: "Nhiễm khuẩn chéo trong quá trình sơ chế và vận chuyển",
    }),
  });
  assert.equal(openRes.status, 201);
  const openData = await openRes.json();
  const recallId = openData.recall_order.id;
  assert.ok(recallId > 0, "Recall order id must be returned");

  // 3. Distributor requests detailed inventory breakdown via GET /api/v1/recalls/:recall_id/items
  const itemsRes = await fetch(`${baseUrl}/api/v1/recalls/${recallId}/items`, {
    headers: { Authorization: `Bearer ${distributorToken}` },
  });
  assert.equal(itemsRes.status, 200);
  const data = await itemsRes.json();

  // 4. Verify Root JSON Structure
  assert.equal(data.recall_id, recallId);
  assert.ok(data.summary, "Response must include summary");
  assert.ok(Array.isArray(data.items), "Response must include items array");

  // 5. Verify Summary Aggregations
  assert.equal(data.summary.total_batches, scenario.expectedTotalBatches);
  assert.equal(data.summary.total_recallable_quantity, scenario.expectedRecallable);
  assert.equal(data.summary.total_consumed_quantity, scenario.expectedConsumed);

  // 6. Verify Detailed Items
  assert.equal(data.items.length, scenario.expectedTotalBatches);

  // Check store #1 item
  const store1Item = data.items.find((item) => item.batch_id === scenario.child1Id);
  assert.ok(store1Item, "Item for store #1 must exist");
  assert.equal(store1Item.status, "delivered");
  assert.equal(store1Item.remaining_quantity, 80);
  assert.equal(store1Item.consumed_quantity, 20);
  assert.match(store1Item.location_address, /123 Đường ABC, Quận 1/);
  assert.ok(store1Item.organization_name);

  // Check store #2 item
  const store2Item = data.items.find((item) => item.batch_id === scenario.child2Id);
  assert.ok(store2Item, "Item for store #2 must exist");
  assert.equal(store2Item.status, "delivered");
  assert.equal(store2Item.remaining_quantity, 150);
  assert.equal(store2Item.consumed_quantity, 50);
  assert.match(store2Item.location_address, /456 Đường XYZ, Cầu Giấy/);

  // Check processor item
  const procItem = data.items.find((item) => item.batch_id === scenario.child3Id);
  assert.ok(procItem, "Item for processor must exist");
  assert.equal(procItem.remaining_quantity, 100);
  assert.equal(procItem.consumed_quantity, 100);
});

test("SCRUM-171: 200 OK for auditor and system_admin roles", async () => {
  const auditor = findUserByEmail("auditor@agritrace.demo");
  const auditorToken = createToken(auditor);
  const systemAdmin = findUserByEmail("admin@agritrace.demo");
  const adminToken = createToken(systemAdmin);

  // Get any existing recall order
  const existingOrder = db.prepare("SELECT id FROM recall_orders ORDER BY id DESC LIMIT 1").get();
  assert.ok(existingOrder, "At least one recall order must exist");

  const resAuditor = await fetch(`${baseUrl}/api/v1/recalls/${existingOrder.id}/items`, {
    headers: { Authorization: `Bearer ${auditorToken}` },
  });
  assert.equal(resAuditor.status, 200);
  const dataAuditor = await resAuditor.json();
  assert.equal(dataAuditor.recall_id, existingOrder.id);

  const resAdmin = await fetch(`${baseUrl}/api/v1/recalls/${existingOrder.id}/items`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resAdmin.status, 200);
  const dataAdmin = await resAdmin.json();
  assert.equal(dataAdmin.recall_id, existingOrder.id);
});

test("SCRUM-171: Parameter route GET /api/v1/distributor/recalls/:id/inventory-breakdown works identically", async () => {
  const distributor = findUserByEmail("distributor@agritrace.demo");
  const token = createToken(distributor);

  const existingOrder = db.prepare("SELECT id FROM recall_orders ORDER BY id DESC LIMIT 1").get();
  assert.ok(existingOrder, "At least one recall order must exist");

  const res = await fetch(`${baseUrl}/api/v1/distributor/recalls/${existingOrder.id}/inventory-breakdown`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.recall_id, existingOrder.id);
  assert.ok(data.summary.total_batches > 0);
  assert.ok(data.items.length > 0);
});
