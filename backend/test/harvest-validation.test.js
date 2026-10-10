import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../src/app.js";
import { getDb } from "../src/db/database.js";
import { runMigrations } from "../src/db/migrations.js";
import { seedDemoData } from "../src/db/seed.js";

let server;
let baseUrl;
let farmerToken;
let landPlotId;
let productId;

test.before(async () => {
  const db = getDb();
  runMigrations();
  db.exec(`
    DROP TRIGGER IF EXISTS event_logs_prevent_update;
    DROP TRIGGER IF EXISTS event_logs_prevent_delete;
  `);
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
  
  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;

  // Find a farm admin
  const user = db.prepare("SELECT * FROM users WHERE role = 'farm_admin' LIMIT 1").get();
  
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "Farm@123" })
  });
  
  const data = await res.json();
  farmerToken = data.token;
  
  // Find a land plot belonging to this farm admin's org
  const plot = db.prepare(`
    SELECT lp.id 
    FROM land_plots lp 
    INNER JOIN farms f ON f.id = lp.farm_id 
    WHERE f.organization_id = ? 
    LIMIT 1
  `).get(user.organization_id);
  landPlotId = plot.id;
  
  // Find a product
  const product = db.prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1").get(user.organization_id);
  productId = product.id;
});

test.after(() => {
  server.close();
});

test("AC1 - Happy path: Cho phép tạo khi khối lượng hợp lệ và ngày thu hoạch là HÔM NAY", async () => {
  const today = new Date();
  // We use ISO string for date formatting as frontend uses "YYYY-MM-DD" mostly, but let's just use the start of today
  const harvestedAt = today.toISOString();
  
  const res = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${farmerToken}`
    },
    body: JSON.stringify({
      landPlotId,
      productId,
      quantityKg: 100,
      harvestedAt
    })
  });
  
  const data = await res.json();
  assert.equal(res.status, 201, `Expected 201 Created but got ${res.status}: ${data.message}`);
  assert.equal(data.batch.initial_quantity, 100);
});

test("AC1 - Báo lỗi khi ngày thu hoạch ở TƯƠNG LAI", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 2);
  
  const res = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${farmerToken}`
    },
    body: JSON.stringify({
      landPlotId,
      productId,
      quantityKg: 50,
      harvestedAt: futureDate.toISOString()
    })
  });
  
  const data = await res.json();
  assert.equal(res.status, 400);
  assert.equal(data.error_code, "HARVEST_DATE_IN_FUTURE");
  assert.equal(data.field, "harvestedAt");
});

test("AC2 - Báo lỗi khi khối lượng thu hoạch <= 0", async () => {
  const today = new Date();
  
  const res = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${farmerToken}`
    },
    body: JSON.stringify({
      landPlotId,
      productId,
      quantityKg: -5,
      harvestedAt: today.toISOString()
    })
  });
  
  const data = await res.json();
  assert.equal(res.status, 400);
  assert.equal(data.error_code, "QUANTITY_INVALID");
  assert.equal(data.field, "quantityKg");
});

test("AC3 - Báo lỗi 403 Forbidden khi thửa thuộc tổ chức khác (kiểm tra trước tiên)", async () => {
  const db = getDb();
  // Find a plot that does NOT belong to the farmer's organization
  db.prepare("SELECT organization_id FROM users WHERE role = 'farm_admin' LIMIT 1").get();
  
  // create a dummy org and plot
  const orgResult = db.prepare("INSERT INTO organizations(name, type) VALUES ('Org Khac', 'farm')").run();
  const farmResult = db.prepare("INSERT INTO farms(organization_id, name) VALUES (?, 'Farm Khac')").run(orgResult.lastInsertRowid);
  const plotResult = db.prepare("INSERT INTO land_plots(farm_id, name, area_ha) VALUES (?, 'Plot Khac', 10)").run(farmResult.lastInsertRowid);
  
  const foreignPlotId = plotResult.lastInsertRowid;
  
  // Also pass invalid quantity (-100) to ensure the 403 authorization check happens BEFORE the 400 validation
  const res = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${farmerToken}`
    },
    body: JSON.stringify({
      landPlotId: foreignPlotId,
      productId,
      quantityKg: -100, // Invalid quantity
      harvestedAt: new Date().toISOString()
    })
  });
  
  const data = await res.json();
  assert.equal(res.status, 403, "Expected 403 Forbidden, but plot check was not done first or failed.");
  assert.equal(data.error_code, "PLOT_FORBIDDEN");
  assert.equal(data.field, "landPlotId");
});

test("AC4 - Prevent duplicate submit (Idempotency server protection)", async () => {
  const today = new Date();
  const reqBody = JSON.stringify({
    landPlotId,
    productId,
    quantityKg: 88,
    harvestedAt: today.toISOString()
  });

  // Gửi request đầu tiên
  const res1 = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${farmerToken}`
    },
    body: reqBody
  });
  await res1.json();
  assert.equal(res1.status, 201, "Lần đầu tiên phải tạo thành công");

  // Gửi request thứ hai ngay sau đó (bị trùng)
  const res2 = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${farmerToken}`
    },
    body: reqBody
  });
  await res2.json();
  assert.equal(res2.status, 409, "Lần thứ hai phải bị từ chối 409 Conflict (idempotency)");
});
