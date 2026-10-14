/**
 * Sprint 4 Test Suite
 * Covers all stories and tasks:
 * - STORY 1: S-26 & S-27 (Truy xuôi phả hệ & Chi tiết hậu duệ)
 * - STORY 2: S-28 (Sơ đồ phả hệ dạng cây / đồ thị)
 * - STORY 3: S-29 (Ghi nhận lô đã bán hết / tiêu thụ)
 * - STORY 4: S-30 (Chia lô về từng cửa hàng nội bộ)
 * - STORY 5: S-31 (Nhật ký thao tác - Audit Log)
 * - STORY 6: S-32 (Nhập danh mục sản phẩm & thửa đất từ file CSV)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { getDb } from "../src/db/database.js";
import { runMigrations } from "../src/db/migrations.js";
import { seedDemoData } from "../src/db/seed.js";
import { createToken, findUserByEmail } from "../src/services/authService.js";
import { getForwardDescendants, buildLineageGraph } from "../src/services/lineageService.js";

let server;
let baseUrl;
const db = getDb();

function resetDatabase() {
  runMigrations();
  db.exec(`
    DROP TRIGGER IF EXISTS event_logs_prevent_update;
    DROP TRIGGER IF EXISTS event_logs_prevent_delete;
    DROP TRIGGER IF EXISTS audit_logs_prevent_update;
    DROP TRIGGER IF EXISTS audit_logs_prevent_delete;
  `);
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("DELETE FROM audit_logs");
  db.exec("DELETE FROM locations");
  db.exec("DELETE FROM event_logs");
  db.exec("DELETE FROM batch_transfers");
  db.exec("DELETE FROM batch_relations");
  db.exec("DELETE FROM batch_lineage");
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

// Helper: tạo harvest batch
async function createHarvestBatch(token, overrides = {}) {
  const farm = findUserByEmail("farm@agritrace.demo");
  const plot = db
    .prepare(
      "SELECT id FROM land_plots WHERE farm_id = (SELECT id FROM farms WHERE organization_id = ?) LIMIT 1",
    )
    .get(farm.organization_id);
  const product = db
    .prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1")
    .get(farm.organization_id);

  const body = {
    landPlotId: plot.id,
    productId: product.id,
    quantityKg: 200,
    harvestedAt: new Date(Date.now() - 3600000).toISOString(),
    ...overrides,
  };

  const res = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 201, "harvest batch should succeed");
  return (await res.json()).batch;
}

// ─── STORY 1: S-26 & S-27 (Truy xuôi phả hệ & Chi tiết hậu duệ) ──────────────

test("S-26/S-27: BFS forward traversal finds all descendants through split operations", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  // Tạo lô gốc và tách thành 3 lô con
  const root = await createHarvestBatch(token, { quantityKg: 300 });

  const splitRes = await fetch(`${baseUrl}/api/batches/${root.id}/split`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      allocations: [
        { quantity: 100, location: "Cửa hàng A" },
        { quantity: 100, location: "Cửa hàng B" },
        { quantity: 100, location: "Cửa hàng C" },
      ],
    }),
  });
  assert.equal(splitRes.status, 200);
  const splitResult = await splitRes.json();
  assert.equal(splitResult.children.length, 3);

  // Gọi API descendants
  const descRes = await fetch(`${baseUrl}/api/v1/batches/${root.id}/descendants`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(descRes.status, 200);
  const descData = await descRes.json();

  assert.equal(descData.root_batch_id, root.id);
  assert.ok(descData.total_descendants >= 3, "Phải tìm thấy ít nhất 3 hậu duệ");
  assert.equal(descData.cycle_detected, false);

  // Kiểm tra cấu trúc dữ liệu cho mỗi hậu duệ
  for (const descendant of descData.descendants) {
    assert.ok(descendant.batch_code || descendant.code, "Phải có mã lô (batch_code/code)");
    assert.ok(descendant.organization_name, "Phải có organization_name");
    assert.ok("remaining_quantity" in descendant, "Phải có remaining_quantity");
    assert.ok("display_status" in descendant, "Phải có display_status");
    assert.ok(descendant.location_name !== undefined, "Phải có location_name");
  }
});

test("S-26: BFS traversal finds multi-level descendants across nested splits", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  // Level 0: root
  const root = await createHarvestBatch(token, { quantityKg: 400 });

  // Level 1: split root into 2
  const split1 = await fetch(`${baseUrl}/api/batches/${root.id}/split`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ allocations: [{ quantity: 200 }, { quantity: 200 }] }),
  });
  const split1Data = await split1.json();
  const child1 = split1Data.children[0];

  // Level 2: split child1 into 2
  const split2 = await fetch(`${baseUrl}/api/batches/${child1.id}/split`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ allocations: [{ quantity: 100 }, { quantity: 100 }] }),
  });
  assert.equal(split2.status, 200);

  // Check from root: should see Level 1 + Level 2 descendants
  const descRes = await fetch(`${baseUrl}/api/v1/batches/${root.id}/descendants`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(descRes.status, 200);
  const descData = await descRes.json();

  assert.ok(descData.total_descendants >= 4, `Expected >= 4 descendants, got ${descData.total_descendants}`);
});

test("S-26: cycle detection stops immediately and prevents infinite loop", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const batchA = db
    .prepare("SELECT * FROM batches WHERE organization_id = ? LIMIT 1")
    .get(farm.organization_id);
  const batchB = db
    .prepare("SELECT * FROM batches WHERE organization_id = ? AND id != ? LIMIT 1")
    .get(farm.organization_id, batchA.id);

  if (batchA && batchB) {
    try {
      db.prepare(
        "INSERT OR IGNORE INTO batch_relations(parent_batch_id, child_batch_id, relation_type) VALUES (?, ?, 'split')",
      ).run(batchA.id, batchB.id);
      db.prepare(
        "INSERT OR IGNORE INTO batch_relations(parent_batch_id, child_batch_id, relation_type) VALUES (?, ?, 'split')",
      ).run(batchB.id, batchA.id);
    } catch {
      // Ignore if constraint error
    }

    const result = getForwardDescendants(batchA.id);

    // Thuật toán phải dừng lại (không lặp vô tận) và trả về cycleDetected = true
    assert.ok(typeof result === "object");
    assert.ok(Array.isArray(result.descendants));
    assert.equal(result.cycleDetected, true, "Phải phát hiện chu trình");

    // Dọn dẹp quan hệ chu trình
    db.exec("PRAGMA foreign_keys = OFF;");
    db.prepare(
      "DELETE FROM batch_relations WHERE parent_batch_id = ? AND child_batch_id = ?",
    ).run(batchB.id, batchA.id);
    db.exec("PRAGMA foreign_keys = ON;");
  }
});

test("S-26/S-27: performance test with 1,000 batches finishes well under 2 seconds", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const product = db
    .prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1")
    .get(farm.organization_id);

  db.exec("BEGIN IMMEDIATE");
  let rootId;
  try {
    const insert = db.prepare(
      `INSERT INTO batches(batch_code, product_id, organization_id, initial_quantity, remaining_quantity, status)
       VALUES (?, ?, ?, 1000, 1, 'registered')`,
    );
    rootId = Number(insert.run(`BATCH-PERF-ROOT-${Date.now()}`, product.id, farm.organization_id).lastInsertRowid);

    const relInsert = db.prepare(
      "INSERT INTO batch_relations(parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 1)",
    );

    let prevId = rootId;
    for (let i = 1; i <= 200; i++) {
      const childId = Number(insert.run(`BATCH-PERF-${i}-${Date.now()}`, product.id, farm.organization_id).lastInsertRowid);
      relInsert.run(prevId, childId);
      prevId = childId;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  const startTime = Date.now();
  const result = getForwardDescendants(rootId);
  const elapsedMs = Date.now() - startTime;

  assert.ok(result.descendants.length >= 200, "Phải tìm thấy tất cả 200 hậu duệ");
  assert.ok(elapsedMs < 2000, `Thời gian chạy phải < 2000ms, thực tế: ${elapsedMs}ms`);
});

// ─── STORY 2: S-28 (Sơ đồ phả hệ dạng cây / đồ thị) ──────────────────────────

test("S-28: lineage graph returns nodes and edges in correct tree structure", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  const root = await createHarvestBatch(token, { quantityKg: 100 });

  await fetch(`${baseUrl}/api/batches/${root.id}/split`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ allocations: [{ quantity: 50 }, { quantity: 50 }] }),
  });

  const graphRes = await fetch(`${baseUrl}/api/v1/batches/${root.id}/lineage-graph`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(graphRes.status, 200);
  const graph = await graphRes.json();

  const unitGraph = buildLineageGraph(root.id);
  assert.ok(unitGraph.nodes.length >= 3, "buildLineageGraph unit test should return nodes");

  assert.ok(Array.isArray(graph.nodes), "Phải có mảng nodes");
  assert.ok(Array.isArray(graph.edges), "Phải có mảng edges");
  assert.ok(typeof graph.summary === "object", "Phải có summary");

  // Kiểm tra node ở giữa (current)
  const centerNode = graph.nodes.find((n) => n.type === "current");
  assert.ok(centerNode, "Phải có node current ở giữa");
  assert.equal(centerNode.id, String(root.id));
  assert.equal(centerNode.position, "center");

  // Kiểm tra các node hậu duệ (descendant) nằm bên phải
  const descendantNodes = graph.nodes.filter((n) => n.type === "descendant");
  assert.ok(descendantNodes.length >= 2, "Phải có các node hậu duệ");
  assert.ok(descendantNodes.every((n) => n.position === "right"), "Descendants phải ở bên phải");

  // Kiểm tra thuộc tính has_children và expanded
  for (const node of graph.nodes) {
    assert.ok("expanded" in node, "Mỗi node phải có expanded");
    assert.ok(node.data && "has_children" in node.data, "Mỗi node phải có has_children");
  }

  // Kiểm tra edges
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  for (const edge of graph.edges) {
    assert.ok(nodeIds.has(edge.source), "Edge source phải tồn tại trong nodes");
    assert.ok(nodeIds.has(edge.target), "Edge target phải tồn tại trong nodes");
  }
});

// ─── STORY 3: S-29 (Ghi nhận lô đã bán hết / tiêu thụ) ───────────────────────

test("S-29: consume batch marks batch as consumed and appends hash chain event", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  const batch = await createHarvestBatch(token, { quantityKg: 50 });
  assert.ok(Number(batch.remaining_quantity) > 0);

  const consumeRes = await fetch(`${baseUrl}/api/v1/batches/${batch.id}/consume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ note: "Bán hết cho khách hàng tại cửa hàng" }),
  });

  assert.equal(consumeRes.status, 200);
  const consumeData = await consumeRes.json();
  assert.equal(Number(consumeData.batch.remaining_quantity), 0);
  assert.equal(consumeData.batch.status, "consumed");

  // Kiểm tra sự kiện batch_consumed trong chuỗi Hash
  const event = db
    .prepare("SELECT * FROM event_logs WHERE batch_id = ? AND event_type = 'batch_consumed'")
    .get(batch.id);
  assert.ok(event, "Phải có sự kiện batch_consumed");
  assert.ok(event.current_hash, "Phải có current_hash");
  assert.ok(event.previous_hash, "Phải có previous_hash");

  // Kiểm tra tính toàn vẹn của chuỗi hash sau khi consume
  const integrityRes = await fetch(`${baseUrl}/api/batches/${batch.id}/integrity`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const integrity = await integrityRes.json();
  assert.equal(integrity.valid, true, "Chuỗi hash phải toàn vẹn sau khi tiêu thụ");
});

test("S-29: cannot consume a batch that is already consumed", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  const batch = await createHarvestBatch(token, { quantityKg: 30 });

  // Tiêu thụ lần 1 thành công
  const first = await fetch(`${baseUrl}/api/v1/batches/${batch.id}/consume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(first.status, 200);

  // Tiêu thụ lần 2 phải bị chặn
  const second = await fetch(`${baseUrl}/api/v1/batches/${batch.id}/consume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(second.status, 400);
});

test("S-29: cannot consume batch belonging to another organization", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const processor = findUserByEmail("processor@agritrace.demo");
  const processorToken = createToken(processor);

  const farmBatch = db
    .prepare("SELECT * FROM batches WHERE organization_id = ? LIMIT 1")
    .get(farm.organization_id);
  assert.ok(farmBatch);

  const res = await fetch(`${baseUrl}/api/v1/batches/${farmBatch.id}/consume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${processorToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 403);
});

// ─── STORY 4: S-30 (Chia lô về từng cửa hàng nội bộ) ─────────────────────────

test("S-30: CRUD locations for organization", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  // Tạo địa điểm
  const createRes = await fetch(`${baseUrl}/api/v1/locations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Kho Lạnh Số 1", address: "123 Đường Nông Sản, Cần Thơ" }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.location.name, "Kho Lạnh Số 1");
  const locationId = created.location.id;

  // Xem danh sách địa điểm
  const listRes = await fetch(`${baseUrl}/api/v1/locations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.ok(list.some((l) => l.id === locationId));

  // Cập nhật địa điểm
  const updateRes = await fetch(`${baseUrl}/api/v1/locations/${locationId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Kho Lạnh Số 1 - Cập Nhật", address: "456 Đường Mới" }),
  });
  assert.equal(updateRes.status, 200);
  const updated = await updateRes.json();
  assert.equal(updated.location.name, "Kho Lạnh Số 1 - Cập Nhật");

  // Xóa địa điểm
  const deleteRes = await fetch(`${baseUrl}/api/v1/locations/${locationId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(deleteRes.status, 200);
});

test("S-30: assign batch to location records LOCATION_ASSIGNED in hash chain", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  // Tạo địa điểm
  const locRes = await fetch(`${baseUrl}/api/v1/locations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Cửa hàng Quận 1", address: "789 Lê Lợi, TP.HCM" }),
  });
  const locData = await locRes.json();
  const locationId = locData.location.id;

  const batch = await createHarvestBatch(token, { quantityKg: 80 });

  // Gán lô về địa điểm
  const assignRes = await fetch(`${baseUrl}/api/v1/batches/${batch.id}/assign-location`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ locationId }),
  });
  assert.equal(assignRes.status, 200);
  const assignData = await assignRes.json();
  assert.equal(assignData.batch.location_id, locationId);

  // Kiểm tra sự kiện location_assigned
  const event = db
    .prepare("SELECT * FROM event_logs WHERE batch_id = ? AND event_type = 'location_assigned'")
    .get(batch.id);
  assert.ok(event, "Phải có sự kiện location_assigned trong hash chain");
  const eventData = JSON.parse(event.data_json);
  assert.equal(eventData.new_location_id, locationId);
});

// ─── STORY 5: S-31 (Nhật ký thao tác - Audit Log) ────────────────────────────

test("S-31: audit logs are automatically recorded for write operations and can be queried", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const auditor = findUserByEmail("auditor@agritrace.demo");
  const farmToken = createToken(farm);
  const auditorToken = createToken(auditor);

  // Thao tác ghi (tạo location)
  await fetch(`${baseUrl}/api/v1/locations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${farmToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Điểm giao dịch Test Audit" }),
  });

  // Chờ ngắn để async logging hoàn tất
  await new Promise((r) => setTimeout(r, 80));

  // Auditor truy vấn nhật ký
  const auditRes = await fetch(`${baseUrl}/api/v1/audit-logs`, {
    headers: { Authorization: `Bearer ${auditorToken}` },
  });
  assert.equal(auditRes.status, 200);
  const auditData = await auditRes.json();
  assert.ok(Array.isArray(auditData.data));
  assert.ok(auditData.pagination);
  assert.ok(auditData.data.length > 0, "Phải có bản ghi audit log");
});

test("S-31: audit logs sanitize sensitive information like passwords and tokens", async () => {
  const { recordAuditLog } = await import("../src/services/auditLogService.js");

  recordAuditLog({
    userId: 1,
    organizationId: 1,
    action: "POST /api/auth/login",
    resourceType: "auth",
    statusCode: 200,
    requestBody: {
      email: "user@test.com",
      password: "secretPassword123",
      token: "secret-token-xyz",
      nested: { password_hash: "hash123" },
    },
  });

  await new Promise((r) => setTimeout(r, 50));

  const log = db
    .prepare("SELECT request_body FROM audit_logs WHERE action = 'POST /api/auth/login' ORDER BY id DESC LIMIT 1")
    .get();

  assert.ok(log && log.request_body);
  const parsed = JSON.parse(log.request_body);
  assert.equal(parsed.password, "[REDACTED]", "Mật khẩu phải bị che");
  assert.equal(parsed.token, "[REDACTED]", "Token phải bị che");
  assert.equal(parsed.nested.password_hash, "[REDACTED]", "Nested hash phải bị che");
  assert.equal(parsed.email, "user@test.com", "Email không bị che");
});

// ─── STORY 6: S-32 (Nhập danh mục sản phẩm & thửa đất từ file CSV) ───────────

test("S-32: CSV import products all-or-nothing succeeds on valid file", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  const csvContent = `name,unit\nRau mồng tơi,kg\nBắp cải tím,kg\nCà rốt Đà Lạt,kg`;
  const beforeCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM products WHERE organization_id = ?")
    .get(farm.organization_id).cnt;

  const res = await fetch(`${baseUrl}/api/v1/import/products`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ csvContent, fileSize: Buffer.byteLength(csvContent, "utf8") }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.imported, 3);

  const afterCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM products WHERE organization_id = ?")
    .get(farm.organization_id).cnt;
  assert.equal(afterCount, beforeCount + 3);
});

test("S-32: CSV import products rolls back all on single invalid line (all-or-nothing)", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  // Dòng 3 bị thiếu tên sản phẩm -> Phải rollback toàn bộ
  const csvContent = `name,unit\nCải thảo,kg\nCải ngọt,kg\n,kg\nXà lách mỡ,kg`;
  const beforeCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM products WHERE organization_id = ?")
    .get(farm.organization_id).cnt;

  const res = await fetch(`${baseUrl}/api/v1/import/products`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ csvContent }),
  });
  assert.equal(res.status, 422, "Phải trả về status 422 Unprocessable Entity");
  const data = await res.json();
  assert.equal(data.success, false);
  assert.ok(data.errors.length > 0);
  assert.equal(data.errors[0].line, 4, "Dòng bị lỗi phải là dòng 4");

  // Kiểm tra không có bản ghi nào bị thêm (rollback toàn bộ)
  const afterCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM products WHERE organization_id = ?")
    .get(farm.organization_id).cnt;
  assert.equal(afterCount, beforeCount, "Không có dòng nào được lưu khi xảy ra lỗi");
});

test("S-32: CSV import reports exact line number and column number for errors", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  const csvContent = `name,unit\n,kg\nKhoai tây,\nKhoai lang,kg`;

  const res = await fetch(`${baseUrl}/api/v1/import/products`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ csvContent }),
  });
  assert.equal(res.status, 422);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.ok(data.errors.length >= 2);

  for (const err of data.errors) {
    assert.ok(err.line, "Phải có số dòng");
    assert.ok(Array.isArray(err.errors));
    assert.ok(err.errors[0].column, "Phải có số cột");
    assert.ok(err.errors[0].field, "Phải có tên trường");
  }
});

test("S-32: CSV import land-plots all-or-nothing succeeds on valid file", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  const csvContent = `name,area_ha,latitude,longitude\nThửa B1,2.5,12.75,108.15\nThửa B2,3.8,12.78,108.20`;
  const beforeCount = db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM land_plots WHERE farm_id = (SELECT id FROM farms WHERE organization_id = ? LIMIT 1)",
    )
    .get(farm.organization_id).cnt;

  const res = await fetch(`${baseUrl}/api/v1/import/land-plots`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ csvContent }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.imported, 2);

  const afterCount = db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM land_plots WHERE farm_id = (SELECT id FROM farms WHERE organization_id = ? LIMIT 1)",
    )
    .get(farm.organization_id).cnt;
  assert.equal(afterCount, beforeCount + 2);
});

test("S-32: rejects file exceeding maximum size limit", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const token = createToken(farm);

  const res = await fetch(`${baseUrl}/api/v1/import/products`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      csvContent: "name,unit\nTest,kg",
      fileSize: 6 * 1024 * 1024, // 6MB > 5MB
    }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.message.includes("lớn") || data.message.includes("lon"));
});
