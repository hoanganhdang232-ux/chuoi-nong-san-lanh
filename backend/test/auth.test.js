import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { getDb } from "../src/db/database.js";
import { seedDemoData } from "../src/db/seed.js";
import { runMigrations } from "../src/db/migrations.js";
import { createToken, findUserByEmail } from "../src/services/authService.js";

let server;
let baseUrl;
const db = getDb();

test.before(async () => {
  runMigrations();
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("DELETE FROM event_logs");
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

test("login returns token and user for valid credentials", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "farm@agritrace.demo",
      password: "Farm@123",
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.token);
  assert.equal(body.user.role, "farm_admin");
});

test("login fails for wrong password and locks after 5 attempts", async () => {
  const user = findUserByEmail("farm@agritrace.demo");
  db.prepare(
    "UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?",
  ).run(user.id);

  for (let i = 0; i < 5; i += 1) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "farm@agritrace.demo",
        password: "Wrong@123",
      }),
    });
    assert.equal(response.status, 401);
  }

  const lockedResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "farm@agritrace.demo",
      password: "Farm@123",
    }),
  });
  assert.equal(lockedResponse.status, 423);
});

test("auditor can access all batches while farm cannot access others", async () => {
  const auditor = findUserByEmail("auditor@agritrace.demo");
  const farm = findUserByEmail("farm@agritrace.demo");
  db.prepare(
    "UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?",
  ).run(farm.id);

  const token = createToken(auditor);
  const farmToken = createToken(farm);

  const authorizedResponse = await fetch(`${baseUrl}/api/batches`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const farmResponse = await fetch(`${baseUrl}/api/batches`, {
    headers: { Authorization: `Bearer ${farmToken}` },
  });

  assert.equal(authorizedResponse.status, 200);
  assert.equal(farmResponse.status, 200);
  const auditorData = await authorizedResponse.json();
  const farmData = await farmResponse.json();
  assert.ok(auditorData.length >= 1);
  assert.ok(
    farmData.every((batch) => batch.organization_id === farm.organization_id),
  );
});

test("user can view batches and integrity but cannot call admin-only actions", async () => {
  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get("user@agritrace.demo");
  const token = createToken(user);
  const batch = db
    .prepare("SELECT id FROM batches WHERE organization_id = ? LIMIT 1")
    .get(user.organization_id);

  const batchesResponse = await fetch(`${baseUrl}/api/batches`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const integrityResponse = await fetch(
    `${baseUrl}/api/batches/${batch.id}/integrity`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const harvestResponse = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      landPlotId: 1,
      productId: 1,
      quantityKg: 10,
      harvestedAt: new Date().toISOString(),
    }),
  });
  const transferResponse = await fetch(
    `${baseUrl}/api/batches/${batch.id}/transfer-requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toOrganizationId: 2,
        note: "Yêu cầu bàn giao",
      }),
    },
  );

  assert.equal(batchesResponse.status, 200);
  assert.equal(integrityResponse.status, 200);
  assert.equal(harvestResponse.status, 403);
  assert.equal(transferResponse.status, 201);
});
