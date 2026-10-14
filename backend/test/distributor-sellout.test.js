import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { getDb } from "../src/db/database.js";
import { createToken, findUserByEmail } from "../src/services/authService.js";
import { runMigrations } from "../src/db/migrations.js";

let server;
let baseUrl;
const db = getDb();

test.before(async () => {
  runMigrations();
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

test("Distributor sell-out: PATCH /api/v1/distributor/lots/:id/sell-out", async (t) => {
  const distributor = findUserByEmail("distributor@agritrace.demo");
  const distributorToken = createToken(distributor);
  const farmUser = findUserByEmail("farm@agritrace.demo");
  const farmToken = createToken(farmUser);

  await t.test("returns 401 when unauthenticated", async () => {
    const res = await fetch(`${baseUrl}/api/v1/distributor/lots/1/sell-out`, {
      method: "PATCH",
    });
    assert.equal(res.status, 401);
  });

  await t.test("returns 403 when unauthorized role attempts sell-out", async () => {
    const res = await fetch(`${baseUrl}/api/v1/distributor/lots/1/sell-out`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${farmToken}`,
        "Content-Type": "application/json",
      },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.message, "Bạn không có quyền thực hiện thao tác này.");
  });

  await t.test("returns 404 when lot does not exist", async () => {
    const res = await fetch(`${baseUrl}/api/v1/distributor/lots/999999/sell-out`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${distributorToken}`,
        "Content-Type": "application/json",
      },
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.message, "Không tìm thấy lô hàng.");
  });

  await t.test("returns 400 when lot id is invalid", async () => {
    const res = await fetch(`${baseUrl}/api/v1/distributor/lots/-1/sell-out`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${distributorToken}`,
        "Content-Type": "application/json",
      },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /sold_out/);
  });

  // Create a batch in 'delivered' status owned by the distributor
  const product = db.prepare("SELECT id FROM products LIMIT 1").get();
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

  await t.test("distributor admin can mark a delivered lot as sold out (200 OK)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/distributor/lots/${batchId}/sell-out`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${distributorToken}`,
        "Content-Type": "application/json",
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.lot.status, "sold_out");
    assert.equal(data.lot.remaining_quantity, 0);
    assert.ok(data.lot.sold_out_at, "sold_out_at timestamp should be set");
    assert.ok(data.event_id, "event_id should be returned");
    assert.equal(data.batch.status, "sold_out");

    // Verify in database batches table
    const updated = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId);
    assert.equal(updated.status, "sold_out");
    assert.equal(updated.remaining_quantity, 0);
    assert.ok(updated.sold_out_at);

    // Verify Consumer Event in event_logs / events
    const eventRow = db.prepare("SELECT * FROM events WHERE id = ?").get(data.event_id);
    assert.ok(eventRow, "Event row should exist");
    assert.equal(eventRow.event_type, "CONSUMED");
    assert.equal(eventRow.lot_id, batchId);
    assert.equal(eventRow.actor_role, "distributor_admin");
    assert.ok(eventRow.hash, "Hash chain current_hash exists");
    assert.ok(eventRow.prev_hash, "Hash chain prev_hash exists");
  });

  await t.test("returns 400 when attempting to sell out an already sold_out lot", async () => {
    const resDuplicate = await fetch(`${baseUrl}/api/v1/distributor/lots/${batchId}/sell-out`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${distributorToken}`,
        "Content-Type": "application/json",
      },
    });
    assert.equal(resDuplicate.status, 400);
    const dupData = await resDuplicate.json();
    assert.match(dupData.message, /sold_out/);
  });

  await t.test("returns 400 when attempting to sell out a recalled lot", async () => {
    const recalledBatchInsert = db.prepare(`
      INSERT INTO batches (
        batch_code, product_id, organization_id, initial_quantity, remaining_quantity,
        current_location, temperature_c, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `BATCH-TEST-RECALLED-${Date.now()}`,
      product.id,
      distributor.organization_id,
      50,
      50,
      "Kho Phân Phối",
      5.0,
      "recalled"
    );
    const recalledBatchId = recalledBatchInsert.lastInsertRowid;

    const res = await fetch(`${baseUrl}/api/v1/distributor/lots/${recalledBatchId}/sell-out`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${distributorToken}`,
        "Content-Type": "application/json",
      },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /sold_out/);
  });
});
