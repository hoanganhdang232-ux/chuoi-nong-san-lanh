import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { getDb } from "../src/db/database.js";
import { createToken, findUserByEmail } from "../src/services/authService.js";

let server;
let baseUrl;
const db = getDb();

test.before(async () => {
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

test("Distributor sell-out: distributor admin can mark a delivered lot as sold out", async () => {
  const distributor = findUserByEmail("distributor@agritrace.demo");
  const distributorToken = createToken(distributor);

  // Find or create a product owned by distributor or farm
  const product = db.prepare("SELECT id FROM products LIMIT 1").get();

  // Create a batch in 'delivered' status owned by the distributor
  const batchCode = `BATCH-TEST-SELLOUT-${Date.now()}`;
  const batchInsert = db.prepare(`
    INSERT INTO batches (
      batch_code, product_id, organization_id, initial_quantity, remaining_quantity,
      current_location, temperature_c, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    batchCode,
    product.id,
    distributor.organization_id,
    100,
    100,
    "Kho Phân Phối",
    5.0,
    "delivered"
  );
  const batchId = batchInsert.lastInsertRowid;

  // Call PATCH /api/v1/distributor/lots/:id/sell-out
  const res = await fetch(`${baseUrl}/api/v1/distributor/lots/${batchId}/sell-out`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${distributorToken}`,
      "Content-Type": "application/json",
    },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.batch.status, "sold_out");
  assert.equal(data.batch.remaining_quantity, 0);
  assert.ok(data.batch.sold_out_at, "sold_out_at timestamp should be set");
  assert.ok(data.event.eventId, "eventId should be returned");

  // Verify in event_logs
  const eventRow = db.prepare("SELECT * FROM event_logs WHERE id = ?").get(data.event.eventId);
  assert.equal(eventRow.event_type, "batch_sold_out");

  // Verify in database
  const updated = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
  assert.equal(updated.status, "sold_out");
  assert.equal(updated.remaining_quantity, 0);
  assert.ok(updated.sold_out_at);

  // Calling sell-out again should fail
  const resDuplicate = await fetch(`${baseUrl}/api/v1/distributor/lots/${batchId}/sell-out`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${distributorToken}`,
      "Content-Type": "application/json",
    },
  });
  assert.equal(resDuplicate.status, 400);
  const dupData = await resDuplicate.json();
  assert.match(dupData.message, /đã được bán hết/);
});

test("Distributor sell-out: unauthorized roles cannot mark lot as sold out", async () => {
  const farmUser = findUserByEmail("farm@agritrace.demo");
  const farmToken = createToken(farmUser);

  const res = await fetch(`${baseUrl}/api/v1/distributor/lots/1/sell-out`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${farmToken}`,
      "Content-Type": "application/json",
    },
  });

  assert.equal(res.status, 403);
});
