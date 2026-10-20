import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { getDb } from "../src/db/database.js";
import { runMigrations } from "../src/db/migrations.js";
import { seedDemoData } from "../src/db/seed.js";
import { seedSprint5RecallDataset } from "../src/db/seedSprint5.js";
import { traceRecallDescendants } from "../src/services/recallGraphService.js";

let server;
let baseUrl;
const db = getDb();

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDatasetPath = resolve(__dirname, "recall_test_dataset.json");
const testDataset = JSON.parse(fs.readFileSync(testDatasetPath, "utf-8"));

function resetDatabase() {
  runMigrations();
  db.exec(`
    DROP TRIGGER IF EXISTS event_logs_prevent_update;
    DROP TRIGGER IF EXISTS event_logs_prevent_delete;
    DROP TRIGGER IF EXISTS audit_logs_prevent_update;
    DROP TRIGGER IF EXISTS audit_logs_prevent_delete;
  `);
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("DELETE FROM recall_affected_batches;");
  db.exec("DELETE FROM recalls;");
  db.exec("DELETE FROM notifications;");
  db.exec("DELETE FROM internal_batch_transfers;");
  db.exec("DELETE FROM audit_logs;");
  db.exec("DELETE FROM locations;");
  db.exec("DELETE FROM event_logs;");
  db.exec("DELETE FROM batch_transfers;");
  db.exec("DELETE FROM batch_relations;");
  db.exec("DELETE FROM batch_lineage;");
  db.exec("DELETE FROM batches;");
  db.exec("DELETE FROM products;");
  db.exec("DELETE FROM land_plots;");
  db.exec("DELETE FROM farms;");
  db.exec("DELETE FROM users;");
  db.exec("DELETE FROM organizations;");
  db.exec("DELETE FROM sqlite_sequence;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations();
  seedDemoData();
  seedSprint5RecallDataset();
}

test.before(async () => {
  resetDatabase();
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((res) => server.once("listening", res));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((res) => server.close(res));
  }
});

async function loginAs(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  return { token: data.token, user: data.user };
}

// ─── T-73 & T-74 & T-75: THUẬT TOÁN BFS & BLENDED BATCH TEST ─────────────────
test("SCRUM-170 (T-73, T-74, T-75): BFS forward traversal & Blended Batch detection on 4-level genealogy", async () => {
  const rootBatch = db
    .prepare("SELECT id FROM batches WHERE batch_code = 'ROOT-SPRINT5-001'")
    .get();
  assert.ok(rootBatch, "Lô gốc ROOT-SPRINT5-001 phải tồn tại");

  const result = traceRecallDescendants(rootBatch.id);
  const expected = testDataset.expected_answers;

  // 1. Kiểm tra số lượng hậu duệ tìm được
  assert.equal(
    result.descendants.length,
    expected.expected_descendant_count,
    `Phải tìm được đúng ${expected.expected_descendant_count} hậu duệ qua 4 tầng`,
  );

  // 2. Kiểm tra độ sâu tối đa (4 tầng)
  const maxDepth = Math.max(...result.descendants.map((d) => d.depth));
  assert.equal(maxDepth, expected.expected_max_depth, "Cây phả hệ phải có độ sâu tối đa 4 tầng");

  // 3. T-74: Kiểm tra phát hiện các lô pha trộn (Blended Batches)
  const blendedBatches = result.descendants.filter((d) => d.is_blended);
  assert.equal(
    blendedBatches.length,
    expected.expected_blended_count,
    `Phải phát hiện chính xác ${expected.expected_blended_count} lô gộp/pha trộn`,
  );

  // Xác nhận các mã lô gộp cụ thể
  for (const expectedCode of expected.expected_blended_batches) {
    const found = blendedBatches.find((b) => b.batch_code === expectedCode);
    assert.ok(found, `Lô ${expectedCode} phải được đánh dấu là Blended (is_blended = true)`);
  }

  // 4. Kiểm tra không bị lặp chu trình
  assert.equal(result.cycleDetected, false, "Không được có chu trình lặp vô hạn");
});

// ─── T-71 & T-72: API POST /api/v1/recalls ───────────────────────────────────
test("SCRUM-169 (T-71, T-72): Create recall with reason >= 20 chars, hash chain and status change", async () => {
  const { token } = await loginAs("auditor@agritrace.demo", "Auditor@123");
  const rootBatch = db
    .prepare("SELECT id, batch_code FROM batches WHERE batch_code = 'ROOT-SPRINT5-001'")
    .get();

  // 1. Validate: Từ chối nếu lý do < 20 ký tự
  const shortReasonRes = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      rootBatchId: rootBatch.id,
      reason: "Hàng bị hỏng", // < 20 ký tự
    }),
  });
  assert.equal(shortReasonRes.status, 400);
  const shortReasonErr = await shortReasonRes.json();
  assert.match(shortReasonErr.message, /ít nhất 20 ký tự/i);

  // 2. Tạo thành công khi lý do >= 20 ký tự
  const validReason = "Phát hiện dư lượng thuốc bảo vệ thực vật vượt ngưỡng an toàn thực phẩm 500%";
  const createRes = await fetch(`${baseUrl}/api/v1/recalls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      rootBatchId: rootBatch.id,
      reason: validReason,
    }),
  });
  assert.equal(createRes.status, 201);
  const createData = await createRes.json();
  assert.ok(createData.recall);
  assert.ok(createData.recall.id);
  assert.ok(createData.recall.recall_code.startsWith("REC-"));
  assert.equal(createData.recall.status, "ACTIVE");

  const recallId = createData.recall.id;

  // 3. Kiểm tra DB: Tất cả các lô trong cây phả hệ phải chuyển sang RECALLED
  const updatedRoot = db.prepare("SELECT status FROM batches WHERE id = ?").get(rootBatch.id);
  assert.equal(updatedRoot.status, "RECALLED");

  // 4. Kiểm tra sự kiện RECALL_INITIATED trong event_logs có kèm Hash Chain
  const eventLog = db
    .prepare("SELECT * FROM event_logs WHERE batch_id = ? AND event_type = 'RECALL_INITIATED'")
    .get(rootBatch.id);
  assert.ok(eventLog, "Phải có sự kiện RECALL_INITIATED trong hash chain");
  assert.ok(eventLog.current_hash, "Phải có SHA-256 current_hash");

  // 5. Kiểm tra danh sách affected batches được tạo trong DB
  const affectedCount = db
    .prepare("SELECT COUNT(*) AS count FROM recall_affected_batches WHERE recall_id = ?")
    .get(recallId).count;
  assert.equal(affectedCount, 14, "Phải ghi nhận đủ 14 lô bị ảnh hưởng vào bảng recall_affected_batches");
});

// ─── T-76 & T-77: API GET /api/v1/recalls/:id/affected-batches ───────────────
test("SCRUM-171 (T-76, T-77): Affected batches summary and location inventory", async () => {
  const { token } = await loginAs("auditor@agritrace.demo", "Auditor@123");
  const recall = db.prepare("SELECT id FROM recalls LIMIT 1").get();
  assert.ok(recall, "Cần có ít nhất 1 lệnh thu hồi");

  const res = await fetch(`${baseUrl}/api/v1/recalls/${recall.id}/affected-batches`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.ok(data.summary);
  assert.equal(data.summary.total_batches, 14);
  assert.equal(data.summary.unquarantined_batches, 14);
  assert.equal(data.summary.quarantined_batches, 0);
  assert.equal(data.summary.quarantine_rate, 0);
  assert.ok(data.summary.total_remaining_quantity > 0);
  assert.ok(data.summary.total_consumed_quantity > 0);

  assert.ok(Array.isArray(data.items));
  assert.equal(data.items.length, 14);

  const firstItem = data.items[0];
  assert.ok(firstItem.batch_code);
  assert.ok(firstItem.organization_name);
  assert.ok(firstItem.current_location);
});

// ─── T-78: API GET /api/v1/recalls/:id/export ────────────────────────────────
test("SCRUM-171 (T-78): Export recall affected batches to CSV", async () => {
  const { token } = await loginAs("auditor@agritrace.demo", "Auditor@123");
  const recall = db.prepare("SELECT id FROM recalls LIMIT 1").get();

  const res = await fetch(`${baseUrl}/api/v1/recalls/${recall.id}/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/csv/);

  const csvContent = await res.text();
  assert.ok(csvContent.includes("BÁO CÁO THU HỒI LÔ HÀNG NÔNG SẢN"));
  assert.ok(csvContent.includes("ROOT-SPRINT5-001"));
  assert.ok(csvContent.includes("BATCH-L2-BLENDED"));
});

// ─── T-79 & T-81: API POST /api/v1/batches/:id/quarantine ────────────────────
test("SCRUM-172 (T-79, T-81): Quarantine batch with org authorization check and RECALL_CONFIRMED event", async () => {
  // Lấy một lô đang thuộc sở hữu của Nhà phân phối (organization_id = 3)
  const distBatch = db
    .prepare("SELECT b.* FROM batches b INNER JOIN organizations o ON o.id = b.organization_id WHERE o.type = 'distributor' AND b.status = 'RECALLED' LIMIT 1")
    .get();
  assert.ok(distBatch, "Cần có một lô RECALLED của Nhà phân phối");

  // 1. T-81: Farm admin cố tình niêm phong lô của Distributor -> Bị từ chối 403
  const farmUser = await loginAs("farm@agritrace.demo", "Farm@123");
  const forbiddenRes = await fetch(`${baseUrl}/api/v1/batches/${distBatch.id}/quarantine`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${farmUser.token}`,
    },
    body: JSON.stringify({
      quarantineLocation: "Kho cách ly trang trại",
    }),
  });
  assert.equal(forbiddenRes.status, 403);
  const forbiddenErr = await forbiddenRes.json();
  assert.match(forbiddenErr.message, /Chỉ tổ chức đang trực tiếp lưu giữ/i);

  // 2. Đúng Nhà phân phối niêm phong lô của mình -> Thành công 200
  const distUser = await loginAs("distributor@agritrace.demo", "Distributor@123");
  const successRes = await fetch(`${baseUrl}/api/v1/batches/${distBatch.id}/quarantine`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${distUser.token}`,
    },
    body: JSON.stringify({
      quarantineLocation: "Kho lạnh niêm phong Chi nhánh Ba Đình, Kệ A-12",
    }),
  });
  assert.equal(successRes.status, 200);
  const successData = await successRes.json();
  assert.equal(successData.success, true);
  assert.equal(successData.status, "QUARANTINED");

  // 3. Kiểm tra DB: batch status = QUARANTINED
  const updatedBatch = db.prepare("SELECT status, current_location FROM batches WHERE id = ?").get(distBatch.id);
  assert.equal(updatedBatch.status, "QUARANTINED");
  assert.equal(updatedBatch.current_location, "Kho lạnh niêm phong Chi nhánh Ba Đình, Kệ A-12");

  // 4. Kiểm tra sự kiện RECALL_CONFIRMED trong event_logs
  const event = db
    .prepare("SELECT * FROM event_logs WHERE batch_id = ? AND event_type = 'RECALL_CONFIRMED'")
    .get(distBatch.id);
  assert.ok(event);
  assert.ok(event.current_hash);

  // 5. Kiểm tra summary tiến độ tự động cập nhật
  const recall = db.prepare("SELECT id FROM recalls LIMIT 1").get();
  const progressRes = await fetch(`${baseUrl}/api/v1/recalls/${recall.id}/affected-batches`, {
    headers: { Authorization: `Bearer ${distUser.token}` },
  });
  const progressData = await progressRes.json();
  assert.equal(progressData.summary.quarantined_batches, 1);
  assert.ok(progressData.summary.quarantine_rate > 0);
});

// ─── T-84 & T-85: IN-APP NOTIFICATIONS ───────────────────────────────────────
test("SCRUM-174 (T-84, T-85): In-app notifications for affected organizations", async () => {
  const distUser = await loginAs("distributor@agritrace.demo", "Distributor@123");

  const notifRes = await fetch(`${baseUrl}/api/v1/notifications`, {
    headers: { Authorization: `Bearer ${distUser.token}` },
  });
  assert.equal(notifRes.status, 200);
  const notifData = await notifRes.json();
  assert.ok(Array.isArray(notifData.notifications));
  assert.ok(notifData.notifications.length > 0);
  assert.ok(notifData.unreadCount > 0);

  const firstNotif = notifData.notifications[0];
  assert.match(firstNotif.title, /THU HỒI NÔNG SẢN/i);

  // Đánh dấu đã đọc
  const readRes = await fetch(`${baseUrl}/api/v1/notifications/${firstNotif.id}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${distUser.token}` },
  });
  assert.equal(readRes.status, 200);
  const readData = await readRes.json();
  assert.equal(readData.unreadCount, notifData.unreadCount - 1);

  // Kiểm tra Auditor cũng nhận được thông báo thu hồi
  const auditorUser = await loginAs("auditor@agritrace.demo", "Auditor@123");
  const auditorNotifs = await fetch(`${baseUrl}/api/v1/notifications`, {
    headers: { Authorization: `Bearer ${auditorUser.token}` },
  }).then((r) => r.json());
  assert.ok(auditorNotifs.notifications.some((n) => /THU HỒI/i.test(n.title)));
});

test("Transfer cancellation notifies receiver organization", async () => {
  const farmUser = await loginAs("farm@agritrace.demo", "Farm@123");
  const processorUser = await loginAs("processor@agritrace.demo", "Processor@123");
  const farmOrgId = farmUser.user.organizationId ?? farmUser.user.organization_id;
  const procOrgId = processorUser.user.organizationId ?? processorUser.user.organization_id;

  // Tìm 1 lô của Farm để tạo transfer request
  const farmBatch = db.prepare("SELECT id FROM batches WHERE organization_id = ? AND status = 'registered' LIMIT 1").get(farmOrgId);
  if (!farmBatch) return;

  const createTrfRes = await fetch(`${baseUrl}/api/v1/transfers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${farmUser.token}`,
    },
    body: JSON.stringify({
      lot_id: farmBatch.id,
      receiver_org_id: procOrgId,
      note: "Chuyển giao thử nghiệm",
    }),
  });
  assert.equal(createTrfRes.status, 201);
  const createdTrf = await createTrfRes.json();

  // Farm hủy/thu hồi đơn bàn giao này
  const cancelRes = await fetch(`${baseUrl}/api/v1/transfers/${createdTrf.id}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${farmUser.token}`,
    },
    body: JSON.stringify({
      reason: "Bên gửi thu hồi lệnh bàn giao để kiểm tra lại chất lượng.",
    }),
  });
  assert.equal(cancelRes.status, 200);

  // Bên nhận (Processor) phải nhận được thông báo in-app rằng đơn đã bị thu hồi/hủy
  const procNotifs = await fetch(`${baseUrl}/api/v1/notifications`, {
    headers: { Authorization: `Bearer ${processorUser.token}` },
  }).then((r) => r.json());

  assert.ok(
    procNotifs.notifications.some(
      (n) => /THU HỒI \/ HỦY/i.test(n.title) || /HỦY/i.test(n.title),
    ),
    "Bên nhận phải nhận được thông báo khi bên gửi thu hồi đơn bàn giao",
  );
});
