import test from "node:test";
import assert from "node:assert/strict";

const { createApp } = await import("../src/app.js");
const { getDb } = await import("../src/db/database.js");
const { runMigrations } = await import("../src/db/migrations.js");
const { seedDemoData } = await import("../src/db/seed.js");
const { createToken, findUserByEmail } =
  await import("../src/services/authService.js");
const { sha256 } = await import("../src/utils/hash.js");

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

test("farm admins can create and update products and land plots within their organization", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const productResponse = await fetch(`${baseUrl}/api/batches/products`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Xoài kiểm thử", unit: "kg" }),
  });
  assert.equal(productResponse.status, 201);
  const product = await productResponse.json();

  const updatedProductResponse = await fetch(
    `${baseUrl}/api/batches/products/${product.id}`,
    { method: "PUT", headers, body: JSON.stringify({ name: "Xoài cập nhật", unit: "thùng" }) },
  );
  assert.equal(updatedProductResponse.status, 200);
  assert.equal((await updatedProductResponse.json()).unit, "thùng");

  const plot = db
    .prepare("SELECT id FROM land_plots WHERE farm_id = (SELECT id FROM farms WHERE organization_id = ?) LIMIT 1")
    .get(farm.organization_id);
  const plotResponse = await fetch(`${baseUrl}/api/batches/land-plots/${plot.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ name: "Thửa cập nhật", areaHa: 9.5 }),
  });
  assert.equal(plotResponse.status, 200);
  assert.equal((await plotResponse.json()).area_ha, 9.5);
});

test("creates a harvest batch with auto-generated unique code and validates input", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);
  const plot = db
    .prepare(
      "SELECT id FROM land_plots WHERE farm_id = (SELECT id FROM farms WHERE organization_id = ?) LIMIT 1",
    )
    .get(farm.organization_id);
  const farmProduct = db
    .prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1")
    .get(farm.organization_id);
  const processor = findUserByEmail("processor@agritrace.demo");
  const processorProductId = db
    .prepare(
      "INSERT INTO products(organization_id, name, unit) VALUES (?, ?, ?)",
    )
    .run(processor.organization_id, "Không thuộc tổ chức", "kg").lastInsertRowid;
  const initialBatchCount = db
    .prepare("SELECT COUNT(*) AS count FROM batches")
    .get().count;
  const response = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      landPlotId: plot.id,
      productId: farmProduct.id,
      quantityKg: 125,
      harvestedAt: new Date().toISOString(),
    }),
  });

  assert.equal(response.status, 201);
  const result = await response.json();
  assert.match(result.batch.batch_code, /^BATCH-[A-Z0-9]{10,}$/);
  assert.equal(result.batch.remaining_quantity, 125);
  assert.equal(result.batch.events.length, 1);
  assert.match(result.batch.events[0].previous_hash, /^GENESIS_/);
  assert.equal(result.batch.events[0].event_type, "batch_harvested");

  const eventCountAfterValidHarvest = db
    .prepare("SELECT COUNT(*) AS count FROM event_logs")
    .get().count;
  const invalidPayloads = [
    {
      landPlotId: plot.id,
      productId: farmProduct.id,
      quantityKg: 0,
      harvestedAt: new Date().toISOString(),
    },
    {
      landPlotId: true,
      productId: farmProduct.id,
      quantityKg: 10,
      harvestedAt: new Date().toISOString(),
    },
    {
      landPlotId: plot.id,
      productId: farmProduct.id,
      quantityKg: "Infinity",
      harvestedAt: new Date().toISOString(),
    },
    {
      landPlotId: plot.id,
      productId: processorProductId,
      quantityKg: 10,
      harvestedAt: new Date().toISOString(),
    },
    {
      landPlotId: plot.id,
      productId: farmProduct.id,
      quantityKg: 10,
      harvestedAt: "not-a-date",
    },
    {
      landPlotId: plot.id,
      productId: farmProduct.id,
      quantityKg: 10,
      harvestedAt: new Date(Date.now() + 86400000).toISOString(),
    },
  ];

  for (const payload of invalidPayloads) {
    const invalidResponse = await fetch(`${baseUrl}/api/batches/harvest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    assert.equal(invalidResponse.status, 400);
  }

  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM batches").get().count,
    initialBatchCount + 1,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM event_logs").get().count,
    eventCountAfterValidHarvest,
  );
});

test("lists transfer requests without conflicting with the batch id route", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const processor = findUserByEmail("processor@agritrace.demo");
  const token = createToken(farm);
  const batch = db
    .prepare(
      "SELECT id, organization_id FROM batches WHERE organization_id = ? LIMIT 1",
    )
    .get(farm.organization_id);

  const createRequest = await fetch(
    `${baseUrl}/api/batches/${batch.id}/transfer-requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toOrganizationId: processor.organization_id,
        note: "Giữ route danh sách transfer không bị chuyển thành batch id",
      }),
    },
  );

  assert.equal(createRequest.status, 201);

  const listResponse = await fetch(`${baseUrl}/api/batches/transfer-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.ok(Array.isArray(list));
  assert.ok(list.some((item) => item.batch_id === batch.id));

  const requestData = await createRequest.json();
  const processorToken = createToken(processor);
  await fetch(
    `${baseUrl}/api/transfers/transfer-requests/${requestData.id}/decision`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${processorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: "rejected",
        reason: "Dọn dẹp sau khi kiểm tra danh sách",
      }),
    },
  );
});

test("creates transfer request, confirms it, and records a new chain event", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const processor = findUserByEmail("processor@agritrace.demo");
  const farmToken = createToken(farm);
  const processorToken = createToken(processor);
  const batch = db
    .prepare(
      "SELECT id, organization_id FROM batches WHERE organization_id = ? AND status != 'pending_confirmation' LIMIT 1",
    )
    .get(farm.organization_id);

  const requestResponse = await fetch(
    `${baseUrl}/api/batches/${batch.id}/transfer-requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${farmToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toOrganizationId: processor.organization_id,
        note: "Bàn giao cho HTX",
      }),
    },
  );

  assert.equal(requestResponse.status, 201);
  const request = await requestResponse.json();
  assert.equal(request.status, "pending");

  const pendingBatch = db
    .prepare("SELECT status FROM batches WHERE id = ?")
    .get(batch.id);
  assert.equal(pendingBatch.status, "pending_confirmation");

  const senderDecision = await fetch(
    `${baseUrl}/api/batches/transfer-requests/${request.id}/decision`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${farmToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: "confirmed",
        reason: "Bên gửi không được quyết định",
      }),
    },
  );
  assert.equal(senderDecision.status, 403);

  const alternateSenderDecision = await fetch(
    `${baseUrl}/api/transfers/transfer-requests/${request.id}/decision`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${farmToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: "confirmed",
        reason: "Bên gửi không được quyết định",
      }),
    },
  );
  assert.equal(alternateSenderDecision.status, 403);

  const decisionWithoutReason = await fetch(
    `${baseUrl}/api/transfers/transfer-requests/${request.id}/decision`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${processorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: "confirmed" }),
    },
  );
  assert.equal(decisionWithoutReason.status, 400);

  const confirmResponse = await fetch(
    `${baseUrl}/api/batches/transfer-requests/${request.id}/decision`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${processorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: "confirmed",
        reason: "Đã kiểm tra và nhận đủ lô hàng.",
      }),
    },
  );

  assert.equal(confirmResponse.status, 200);
  const confirmed = await confirmResponse.json();
  assert.equal(confirmed.batch.organization_id, processor.organization_id);

  const confirmedEvent = db
    .prepare(
      "SELECT event_type, data_json FROM event_logs WHERE batch_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(batch.id);
  assert.equal(confirmedEvent.event_type, "batch_transferred");
  assert.equal(
    JSON.parse(confirmedEvent.data_json).reason,
    "Đã kiểm tra và nhận đủ lô hàng.",
  );
  assert.equal(
    db
      .prepare("SELECT reason FROM batch_transfers WHERE id = ?")
      .get(request.id).reason,
    "Đã kiểm tra và nhận đủ lô hàng.",
  );

  const eventCount = db
    .prepare("SELECT COUNT(*) AS total FROM event_logs WHERE batch_id = ?")
    .get(batch.id).total;
  assert.ok(eventCount >= 2);

  const integrityResponse = await fetch(
    `${baseUrl}/api/batches/${batch.id}/integrity`,
    {
      headers: { Authorization: `Bearer ${processorToken}` },
    },
  );
  assert.equal(integrityResponse.status, 200);
  const integrity = await integrityResponse.json();
  assert.equal(integrity.valid, true);
  assert.equal(integrity.broken, false);
});

test("rejects transfer with a reason and exposes an integrity violation when an event hash is tampered with", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const processor = findUserByEmail("processor@agritrace.demo");
  const auditor = findUserByEmail("auditor@agritrace.demo");
  const farmToken = createToken(farm);
  const processorToken = createToken(processor);
  const auditorToken = createToken(auditor);
  const batch = db
    .prepare("SELECT * FROM batches WHERE organization_id = ? AND status != 'pending_confirmation' LIMIT 1")
    .get(farm.organization_id);

  const requestResponse = await fetch(
    `${baseUrl}/api/batches/${batch.id}/transfer-requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${farmToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toOrganizationId: processor.organization_id,
        note: "Yêu cầu từ chối",
      }),
    },
  );
  const request = await requestResponse.json();

  const rejectResponse = await fetch(
    `${baseUrl}/api/batches/transfer-requests/${request.id}/decision`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${processorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: "rejected",
        reason: "Sản phẩm không đạt tiêu chuẩn",
      }),
    },
  );

  assert.equal(rejectResponse.status, 200);

  const event = db
    .prepare(
      "SELECT * FROM event_logs WHERE batch_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(batch.id);
  const tamperedTimestamp = new Date().toISOString();
  const tamperedHash = sha256(
    `${event.previous_hash}|${event.event_type}|${JSON.stringify({ tampered: true })}|${event.actor_id}|${tamperedTimestamp}`,
  );
  db.exec("DROP TRIGGER IF EXISTS event_logs_prevent_update;");
  db.prepare(
    "UPDATE event_logs SET data_json = ?, timestamp = ?, current_hash = ? WHERE id = ?",
  ).run(
    JSON.stringify({ tampered: true }),
    tamperedTimestamp,
    tamperedHash,
    event.id,
  );
  runMigrations();

  const integrityResponse = await fetch(
    `${baseUrl}/api/batches/${batch.id}/integrity`,
    {
      headers: { Authorization: `Bearer ${auditorToken}` },
    },
  );
  assert.equal(integrityResponse.status, 200);
  const integrity = await integrityResponse.json();
  assert.equal(integrity.valid, false);
  assert.ok(integrity.invalidEventIds.includes(event.id));
  assert.equal(integrity.broken, true);
});

test("SCRUM-59 / S-11: recorded events cannot be updated or deleted by any means", () => {
  const event = db.prepare("SELECT * FROM event_logs LIMIT 1").get();
  assert.ok(event);

  // Attempting to modify event_type
  assert.throws(
    () =>
      db
        .prepare("UPDATE event_logs SET event_type = 'tampered' WHERE id = ?")
        .run(event.id),
    /event_logs are immutable/,
  );

  // Attempting to modify data_json
  assert.throws(
    () =>
      db
        .prepare("UPDATE event_logs SET data_json = '{\"hacked\": true}' WHERE id = ?")
        .run(event.id),
    /event_logs are immutable/,
  );

  // Attempting to modify current_hash or previous_hash
  assert.throws(
    () =>
      db
        .prepare("UPDATE event_logs SET current_hash = 'fakehash' WHERE id = ?")
        .run(event.id),
    /event_logs are immutable/,
  );

  // Attempting to modify timestamp
  assert.throws(
    () =>
      db
        .prepare("UPDATE event_logs SET timestamp = '2020-01-01' WHERE id = ?")
        .run(event.id),
    /event_logs are immutable/,
  );

  // Attempting to delete the event
  assert.throws(
    () => db.prepare("DELETE FROM event_logs WHERE id = ?").run(event.id),
    /event_logs are immutable/,
  );
});

test("splits one batch into children and exposes genealogy ancestry", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  const sourceBatch = db
    .prepare(
      "SELECT * FROM batches WHERE organization_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(farm.organization_id);

  db.prepare(
    "UPDATE batches SET initial_quantity = 100, remaining_quantity = 100, status = 'registered', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(sourceBatch.id);

  const splitResponse = await fetch(
    `${baseUrl}/api/batches/${sourceBatch.id}/split`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allocations: [
          { quantity: 30, location: "Kho A" },
          { quantity: 30, location: "Kho B" },
          { quantity: 40, location: "Kho C" },
        ],
      }),
    },
  );

  assert.equal(splitResponse.status, 200);
  const split = await splitResponse.json();
  assert.equal(split.parentBatch.remaining_quantity, 0);
  assert.equal(split.children.length, 3);
  assert.ok(
    split.children.every((child) => child.parent_batch_id === sourceBatch.id),
  );

  const genealogyResponse = await fetch(
    `${baseUrl}/api/batches/${split.children[0].id}/genealogy`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  assert.equal(genealogyResponse.status, 200);
  const genealogy = await genealogyResponse.json();
  assert.ok(genealogy.ancestors.some((item) => item.id === sourceBatch.id));
  assert.ok(genealogy.descendants.length >= 0);
});

test("merges multiple batches into a new batch and records lineage", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  const batchA = db
    .prepare(
      "SELECT * FROM batches WHERE organization_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(farm.organization_id);

  db.prepare(
    "UPDATE batches SET initial_quantity = 100, remaining_quantity = 100, status = 'registered', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(batchA.id);

  const batchBInsert = db.prepare(
    "INSERT INTO batches(batch_code, product_id, organization_id, source_farm_id, initial_quantity, remaining_quantity, current_location, temperature_c, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const batchB = batchBInsert.run(
    `BATCH-MERGE-${Date.now()}`,
    batchA.product_id,
    farm.organization_id,
    batchA.source_farm_id,
    20,
    20,
    "Kho hợp nhất",
    9,
    "registered",
  );
  const processor = findUserByEmail("processor@agritrace.demo");
  const processorProductId = db
    .prepare(
      "INSERT INTO products(organization_id, name, unit) VALUES (?, ?, ?)",
    )
    .run(processor.organization_id, "Sản phẩm tổ chức khác", "kg").lastInsertRowid;
  const crossOrganizationProductResponse = await fetch(
    `${baseUrl}/api/batches/merge`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        batchIds: [batchA.id, batchB.lastInsertRowid],
        productId: processorProductId,
      }),
    },
  );
  assert.equal(crossOrganizationProductResponse.status, 400);

  const mergeResponse = await fetch(`${baseUrl}/api/batches/merge`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      batchIds: [batchA.id, batchB.lastInsertRowid],
      productId: batchA.product_id,
      currentLocation: "Kho mới",
      temperatureC: 8,
      note: "Gộp lô",
    }),
  });

  assert.equal(mergeResponse.status, 200);
  const merged = await mergeResponse.json();
  assert.equal(merged.newBatch.product_id, batchA.product_id);
  assert.equal(Number(merged.newBatch.initial_quantity), 120);
  assert.ok(Array.isArray(merged.newBatch.source_batch_ids));

  const genealogyResponse = await fetch(
    `${baseUrl}/api/batches/${merged.newBatch.id}/genealogy`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  assert.equal(genealogyResponse.status, 200);
  const genealogy = await genealogyResponse.json();
  assert.ok(genealogy.ancestors.length >= 2);
});

test("SCRUM-58: every batch change is recorded as a sequential event with hash", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const processor = findUserByEmail("processor@agritrace.demo");
  const farmToken = createToken(farm);
  const processorToken = createToken(processor);
  const farmHeaders = {
    Authorization: `Bearer ${farmToken}`,
    "Content-Type": "application/json",
  };
  const processorHeaders = {
    Authorization: `Bearer ${processorToken}`,
    "Content-Type": "application/json",
  };

  const plot = db
    .prepare(
      "SELECT id FROM land_plots WHERE farm_id = (SELECT id FROM farms WHERE organization_id = ?) LIMIT 1",
    )
    .get(farm.organization_id);
  const product = db
    .prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1")
    .get(farm.organization_id);

  // 1. Thay đổi 1: Thu hoạch lô (tạo mới)
  const harvestRes = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: farmHeaders,
    body: JSON.stringify({
      landPlotId: plot.id,
      productId: product.id,
      quantityKg: 300,
      harvestedAt: new Date().toISOString(),
    }),
  });
  assert.equal(harvestRes.status, 201);
  const { batch } = await harvestRes.json();

  // 2. Thay đổi 2: Cập nhật trạng thái lô
  const statusRes = await fetch(`${baseUrl}/api/batches/${batch.id}/status`, {
    method: "POST",
    headers: farmHeaders,
    body: JSON.stringify({
      status: "processed",
      current_location: "Khu sơ chế",
      temperature_c: 6,
    }),
  });
  assert.equal(statusRes.status, 201);

  // 3. Thay đổi 3: Yêu cầu bàn giao lô
  const transferRes = await fetch(
    `${baseUrl}/api/batches/${batch.id}/transfer-requests`,
    {
      method: "POST",
      headers: farmHeaders,
      body: JSON.stringify({
        toOrganizationId: processor.organization_id,
        note: "Bàn giao lô sang processor",
      }),
    },
  );
  assert.equal(transferRes.status, 201);
  const transfer = await transferRes.json();

  // 4. Thay đổi 4: Xác nhận bàn giao
  const decisionRes = await fetch(
    `${baseUrl}/api/batches/transfer-requests/${transfer.id}/decision`,
    {
      method: "POST",
      headers: processorHeaders,
      body: JSON.stringify({
        decision: "confirmed",
        reason: "Tiếp nhận lô đầy đủ, chuẩn nhiệt độ",
      }),
    },
  );
  assert.equal(decisionRes.status, 200);

  // Kiểm tra chuỗi sự kiện nối tiếp trong DB
  const events = db
    .prepare(
      "SELECT id, event_type, previous_hash, current_hash FROM event_logs WHERE batch_id = ? ORDER BY id ASC",
    )
    .all(batch.id);

  assert.equal(events.length, 4);
  assert.equal(events[0].event_type, "batch_harvested");
  assert.match(events[0].previous_hash, /^GENESIS_/);

  assert.equal(events[1].event_type, "batch_processed");
  assert.equal(events[1].previous_hash, events[0].current_hash);

  assert.equal(events[2].event_type, "batch_transfer_requested");
  assert.equal(events[2].previous_hash, events[1].current_hash);

  assert.equal(events[3].event_type, "batch_transferred");
  assert.equal(events[3].previous_hash, events[2].current_hash);

  // Kiểm tra API verify integrity
  const integrityRes = await fetch(
    `${baseUrl}/api/batches/${batch.id}/integrity`,
    {
      headers: processorHeaders,
    },
  );
  assert.equal(integrityRes.status, 200);
  const integrity = await integrityRes.json();
  assert.equal(integrity.valid, true);
  assert.equal(integrity.broken, false);
  assert.equal(integrity.invalidEventIds.length, 0);
});

