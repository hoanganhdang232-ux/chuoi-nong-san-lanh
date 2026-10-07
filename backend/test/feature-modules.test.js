import test from "node:test";
import assert from "node:assert/strict";

const { createApp } = await import("../src/app.js");
const { getDb } = await import("../src/db/database.js");
const { runMigrations } = await import("../src/db/migrations.js");
const { seedDemoData } = await import("../src/db/seed.js");
const { seedFeatureDemoData } = await import("../src/db/seedFeatures.js");
const { createToken, findUserByEmail } =
  await import("../src/services/authService.js");

let server;
let baseUrl;
const db = getDb();

function resetDatabase() {
  runMigrations();
  db.exec("PRAGMA foreign_keys = OFF;");
  for (const table of [
    "notifications",
    "recall_items",
    "recall_cases",
    "cold_chain_alerts",
    "temperature_logs",
    "event_logs",
    "batch_transfers",
    "batches",
    "products",
    "land_plots",
    "farms",
    "users",
    "organizations",
  ])
    db.exec(`DELETE FROM ${table}`);
  db.exec("DELETE FROM sqlite_sequence;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations();
  seedDemoData();
}

function authHeaders(user) {
  return { Authorization: `Bearer ${createToken(user)}` };
}

test.before(async () => {
  resetDatabase();
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/features`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("feature seed adds an idempotent three-level twelve-batch dataset", () => {
  const first = seedFeatureDemoData();
  const second = seedFeatureDemoData();
  const sampleCount = db
    .prepare(
      "SELECT COUNT(*) AS count FROM batches WHERE batch_code LIKE 'BATCH-TRACE-DEMO-2026-%'",
    )
    .get().count;
  assert.equal(first.created, true);
  assert.equal(first.batchCount, 12);
  assert.equal(second.created, false);
  assert.equal(sampleCount, 12);
});

test("sensor simulation stores samples and alerts only after over 30 continuous minutes above 8C", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const batch = db.prepare("SELECT id FROM batches LIMIT 1").get();
  const response = await fetch(
    `${baseUrl}/batches/${batch.id}/sensor-simulation`,
    {
      method: "POST",
      headers: { ...authHeaders(farm), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );

  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.alertActive, true);
  assert.equal(result.sampleCount, 8);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM temperature_logs WHERE batch_id = ?",
      )
      .get(batch.id).count,
    8,
  );
  assert.equal(
    db
      .prepare("SELECT cold_chain_alert FROM batches WHERE id = ?")
      .get(batch.id).cold_chain_alert,
    1,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM cold_chain_alerts WHERE batch_id = ? AND resolved_at IS NULL",
      )
      .get(batch.id).count,
    1,
  );

  const shortSeries = Array.from({ length: 7 }, (_, index) => ({
    temperature: 9,
    timestamp: new Date(Date.now() - (6 - index) * 5 * 60_000).toISOString(),
  }));
  const interruptedResponse = await fetch(
    `${baseUrl}/batches/${batch.id}/sensor-simulation`,
    {
      method: "POST",
      headers: { ...authHeaders(farm), "Content-Type": "application/json" },
      body: JSON.stringify({ readings: shortSeries }),
    },
  );
  assert.equal(interruptedResponse.status, 201);

  const secondBatch = db
    .prepare("SELECT id FROM batches WHERE id != ? ORDER BY id LIMIT 1")
    .get(batch.id);
  const auditor = findUserByEmail("auditor@agritrace.demo");
  const now = Date.now();
  const exactThirtyMinutes = Array.from({ length: 7 }, (_, index) => ({
    temperature: 9,
    timestamp: new Date(now - (6 - index) * 5 * 60_000).toISOString(),
  }));
  const boundaryResponse = await fetch(
    `${baseUrl}/batches/${secondBatch.id}/sensor-simulation`,
    {
      method: "POST",
      headers: { ...authHeaders(auditor), "Content-Type": "application/json" },
      body: JSON.stringify({ readings: exactThirtyMinutes }),
    },
  );
  assert.equal(boundaryResponse.status, 201);
  assert.equal((await boundaryResponse.json()).alertActive, false);

  const twoShortRunsWithGap = [0, 1, 2, 3, 4, 8, 9, 10, 11, 12].map(
    (offset) => ({
      temperature: 9,
      timestamp: new Date(now - (14 - offset) * 5 * 60_000).toISOString(),
    }),
  );
  const gapResponse = await fetch(
    `${baseUrl}/batches/${secondBatch.id}/sensor-simulation`,
    {
      method: "POST",
      headers: { ...authHeaders(auditor), "Content-Type": "application/json" },
      body: JSON.stringify({ readings: twoShortRunsWithGap }),
    },
  );
  assert.equal(gapResponse.status, 201);
  assert.equal((await gapResponse.json()).alertActive, false);
});

test("recall traces all split and merge descendants once and notifies affected parties", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const root = db.prepare("SELECT * FROM batches LIMIT 1").get();
  const lastDescendant = db
    .prepare("SELECT id FROM batches ORDER BY id DESC LIMIT 1")
    .get();
  db.prepare("UPDATE batches SET source_batch_ids = ? WHERE id = ?").run(
    JSON.stringify([lastDescendant.id]),
    root.id,
  );

  const response = await fetch(`${baseUrl}/recalls`, {
    method: "POST",
    headers: { ...authHeaders(farm), "Content-Type": "application/json" },
    body: JSON.stringify({
      rootBatchId: root.id,
      reason: "Nghi ngờ nhiễm khuẩn",
    }),
  });

  assert.equal(response.status, 201);
  const report = await response.json();
  assert.equal(report.items.length, 12);
  assert.equal(new Set(report.items.map((item) => item.batch_id)).size, 12);
  assert.ok(report.items.every((item) => item.status === "recalled"));
  assert.equal(report.totals.consumedQuantity, 80);
  const scopedReportsResponse = await fetch(`${baseUrl}/recalls`, {
    headers: authHeaders(farm),
  });
  assert.equal(scopedReportsResponse.status, 200);
  const scopedReports = await scopedReportsResponse.json();
  assert.ok(
    scopedReports[0].items.every(
      (item) => item.organization_id === farm.organization_id,
    ),
  );
  assert.ok(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM notifications WHERE kind = 'recall'",
      )
      .get().count > 0,
  );
});

test("public trace is unauthenticated and excludes organization, commercial, and personal fields", async () => {
  const batch = db
    .prepare("SELECT batch_code FROM batches WHERE batch_code = ?")
    .get("BATCH-TRACE-DEMO-2026-L3-1");
  const response = await fetch(`${baseUrl}/public/trace/${batch.batch_code}`);
  assert.equal(response.status, 200);
  const trace = await response.json();
  const json = JSON.stringify(trace);
  assert.equal(trace.productName, "Dưa hấu đỏ");
  assert.equal(trace.harvestJournal.length, 1);
  assert.ok(Array.isArray(trace.transportHistory));
  assert.ok(!json.includes("organization_name"));
  assert.ok(!json.includes("remaining_quantity"));
  assert.ok(!json.includes("initial_quantity"));
  assert.ok(!json.includes("Farm Tây Nguyên"));
  assert.ok(!json.includes("@agritrace.demo"));
});

test("audit report exports hash verification and enforces organization scope", async () => {
  const batch = db.prepare("SELECT * FROM batches LIMIT 1").get();
  const auditor = findUserByEmail("auditor@agritrace.demo");
  const farm = findUserByEmail("farm@agritrace.demo");
  const user = findUserByEmail("user@agritrace.demo");
  const denied = await fetch(`${baseUrl}/auditor/reports/${batch.id}`, {
    headers: authHeaders(user),
  });
  assert.equal(denied.status, 403);

  const scoped = await fetch(`${baseUrl}/auditor/reports/${batch.id}`, {
    headers: authHeaders(farm),
  });
  assert.equal(scoped.status, 200);

  const allowed = await fetch(`${baseUrl}/auditor/reports/${batch.id}`, {
    headers: authHeaders(auditor),
  });
  assert.equal(allowed.status, 200);
  const report = await allowed.json();
  assert.equal(report.integrity.valid, true);
  assert.ok(report.integrity.checkedAt);
  assert.equal(report.integrity.checkedEvents, report.events.length);

  db.prepare("UPDATE event_logs SET data_json = ? WHERE batch_id = ?").run(
    '{"tampered":true}',
    batch.id,
  );
  const tampered = await fetch(`${baseUrl}/auditor/reports/${batch.id}`, {
    headers: authHeaders(auditor),
  });
  const tamperedReport = await tampered.json();
  assert.equal(tamperedReport.integrity.valid, false);
  assert.ok(tamperedReport.integrity.invalidEventIds.length > 0);
});
