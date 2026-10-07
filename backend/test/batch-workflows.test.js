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

test("creates a harvest batch with auto-generated unique code and validates input", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);
  const plot = db
    .prepare(
      "SELECT id FROM land_plots WHERE farm_id = (SELECT id FROM farms WHERE organization_id = ?) LIMIT 1",
    )
    .get(farm.organization_id);
  const response = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      landPlotId: plot.id,
      productId: 1,
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

  const invalidResponse = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      landPlotId: plot.id,
      productId: 1,
      quantityKg: 0,
      harvestedAt: new Date(Date.now() + 86400000).toISOString(),
    }),
  });

  assert.equal(invalidResponse.status, 400);
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
});

test("creates transfer request, confirms it, and records a new chain event", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const processor = findUserByEmail("processor@agritrace.demo");
  const farmToken = createToken(farm);
  const processorToken = createToken(processor);
  const batch = db
    .prepare(
      "SELECT id, organization_id FROM batches WHERE organization_id = ? LIMIT 1",
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

  const confirmResponse = await fetch(
    `${baseUrl}/api/batches/transfer-requests/${request.id}/decision`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${processorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: "confirmed", reason: "" }),
    },
  );

  assert.equal(confirmResponse.status, 200);
  const confirmed = await confirmResponse.json();
  assert.equal(confirmed.batch.organization_id, processor.organization_id);

  const confirmedEvent = db
    .prepare(
      "SELECT event_type FROM event_logs WHERE batch_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(batch.id);
  assert.equal(confirmedEvent.event_type, "batch_transferred");

  const eventCount = db
    .prepare("SELECT COUNT(*) AS total FROM event_logs WHERE batch_id = ?")
    .get(batch.id).total;
  assert.ok(eventCount >= 2);
});

test("rejects transfer with a reason and exposes an integrity violation when an event hash is tampered with", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const processor = findUserByEmail("processor@agritrace.demo");
  const auditor = findUserByEmail("auditor@agritrace.demo");
  const farmToken = createToken(farm);
  const processorToken = createToken(processor);
  const auditorToken = createToken(auditor);
  const batch = db
    .prepare("SELECT * FROM batches WHERE organization_id = ? LIMIT 1")
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
  db.prepare(
    "UPDATE event_logs SET data_json = ?, timestamp = ?, current_hash = ? WHERE id = ?",
  ).run(
    JSON.stringify({ tampered: true }),
    tamperedTimestamp,
    tamperedHash,
    event.id,
  );

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
