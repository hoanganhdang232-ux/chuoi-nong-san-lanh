import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { getDb } from "../src/db/database.js";
import { seedDemoData } from "../src/db/seed.js";
import { runMigrations } from "../src/db/migrations.js";
import { createToken, findUserByEmail } from "../src/services/authService.js";
import { parseCsv, parseDateFlexible, parseNumberFlexible } from "../src/utils/csv.js";

let server;
let baseUrl;
const db = getDb();

test.before(async () => {
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
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("CSV unit: parseCsv handles sep=, directive and BOM", () => {
  const content = "\uFEFFsep=,\r\nproductId,quantityKg,currentLocation,harvestedAt,batchCode\r\n1,100,Kho tiếp nhận,2026-10-20,B01";
  const rows = parseCsv(content);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].productId, "1");
  assert.equal(rows[0].quantityKg, "100");
  assert.equal(rows[0].currentLocation, "Kho tiếp nhận");
  assert.equal(rows[0].harvestedAt, "2026-10-20");
  assert.equal(rows[0].batchCode, "B01");
});

test("CSV unit: parseCsv auto-detects semicolon delimiter", () => {
  const content = "productId;quantityKg;currentLocation;harvestedAt;batchCode\r\n1;250;Kho lạnh trung tâm;20/10/2026;B02";
  const rows = parseCsv(content);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].productId, "1");
  assert.equal(rows[0].quantityKg, "250");
  assert.equal(rows[0].currentLocation, "Kho lạnh trung tâm");
  assert.equal(rows[0].harvestedAt, "20/10/2026");
  assert.equal(rows[0].batchCode, "B02");
});

test("CSV unit: parseDateFlexible and parseNumberFlexible handle Vietnamese Excel formats", () => {
  const d1 = parseDateFlexible("2026-10-20");
  assert.equal(d1.getFullYear(), 2026);
  assert.equal(d1.getMonth(), 9); // 0-indexed: 9 is Oct
  assert.equal(d1.getDate(), 20);

  const d2 = parseDateFlexible("20/10/2026");
  assert.equal(d2.getFullYear(), 2026);
  assert.equal(d2.getMonth(), 9);
  assert.equal(d2.getDate(), 20);

  assert.equal(parseNumberFlexible("100.5"), 100.5);
  assert.equal(parseNumberFlexible("100,5"), 100.5);
  assert.equal(parseNumberFlexible("1,250.5"), 1250.5);
});

test("CSV API: POST /api/batches/import-csv succeeds with Excel-formatted CSV (sep=, and DD/MM/YYYY)", async () => {
  const farmUser = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farmUser);

  // Lấy product hợp lệ của farm
  const product = db.prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1").get(farmUser.organization_id);
  assert.ok(product);

  const csvContent = `sep=,\r\nproductId,quantityKg,currentLocation,harvestedAt,batchCode\r\n${product.id},150,Kho Excel A,20/10/2026,EXCEL-LOT-01`;

  const res = await fetch(`${baseUrl}/api/batches/import-csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ csvText: csvContent }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.createdCount, 1);
  assert.equal(data.batches[0].batch_code, "EXCEL-LOT-01");
});

test("CSV API: POST /api/batches/import-csv succeeds with semicolon-delimited CSV", async () => {
  const farmUser = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farmUser);

  const product = db.prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1").get(farmUser.organization_id);
  assert.ok(product);

  const csvContent = `productId;quantityKg;currentLocation;harvestedAt;batchCode\r\n${product.id};80,5;Kho Excel Semicolon;2026-10-18;EXCEL-LOT-02`;

  const res = await fetch(`${baseUrl}/api/batches/import-csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ csvText: csvContent }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.createdCount, 1);
  assert.equal(data.batches[0].batch_code, "EXCEL-LOT-02");

  const batchInDb = db.prepare("SELECT * FROM batches WHERE batch_code = 'EXCEL-LOT-02'").get();
  assert.equal(batchInDb.initial_quantity, 80.5);
});

test("Excel/XLSX: converts workbook sheet with Vietnamese text and custom date into valid import", async () => {
  const XLSX = await import("xlsx");
  const farmUser = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farmUser);

  const product = db.prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1").get(farmUser.organization_id);
  assert.ok(product);

  // Tạo workbook tương tự như client sinh ra
  const wb = XLSX.utils.book_new();
  const wsData = [
    ["productId", "quantityKg", "currentLocation", "harvestedAt", "batchCode"],
    [product.id, 120.5, "Kho tiếp nhận nông sản Đà Lạt", "2026-10-20", "EXCEL-XLSX-03"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Batches");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  const readWb = XLSX.read(buf, { type: "buffer", cellDates: true, dateNF: "yyyy-mm-dd" });
  const csvText = XLSX.utils.sheet_to_csv(readWb.Sheets[readWb.SheetNames[0]]);

  const res = await fetch(`${baseUrl}/api/batches/import-csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ csvText }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.createdCount, 1);
  assert.equal(data.batches[0].batch_code, "EXCEL-XLSX-03");

  const batchInDb = db.prepare("SELECT * FROM batches WHERE batch_code = 'EXCEL-XLSX-03'").get();
  assert.equal(batchInDb.initial_quantity, 120.5);
  assert.equal(batchInDb.current_location, "Kho tiếp nhận nông sản Đà Lạt");
});

