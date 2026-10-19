import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { getDb } from "../src/db/database.js";
import { runMigrations } from "../src/db/migrations.js";
import { seedDemoData } from "../src/db/seed.js";

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
  db.exec("DELETE FROM internal_batch_transfers");
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

test("SUBTASK 1 (T-64): Locations CRUD with code, address, phone, and status", async () => {
  const { token } = await loginAs("distributor@agritrace.demo", "Distributor@123");

  // 1. Tạo cửa hàng mới có đầy đủ code, name, address, phone, status
  const createRes = await fetch(`${baseUrl}/api/v1/locations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      code: "CH-TX-01",
      name: "Cửa hàng Thanh Xuân",
      address: "100 Nguyễn Trãi, Thanh Xuân, Hà Nội",
      phone: "02431239999",
      status: "Active",
    }),
  });
  assert.equal(createRes.status, 201);
  const createdData = await createRes.json();
  assert.equal(createdData.location.code, "CH-TX-01");
  assert.equal(createdData.location.name, "Cửa hàng Thanh Xuân");
  assert.equal(createdData.location.phone, "02431239999");
  assert.equal(createdData.location.status, "Active");

  const newLocId = createdData.location.id;

  // 2. Không được tạo trùng code
  const duplicateCodeRes = await fetch(`${baseUrl}/api/v1/locations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      code: "CH-TX-01",
      name: "Cửa hàng Trùng Mã",
    }),
  });
  assert.equal(duplicateCodeRes.status, 400);

  // 3. Tự sinh mã nếu không nhập code
  const autoCodeRes = await fetch(`${baseUrl}/api/v1/locations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "Cửa hàng Tây Hồ",
      address: "50 Lạc Long Quân, Tây Hồ, Hà Nội",
    }),
  });
  assert.equal(autoCodeRes.status, 201);
  const autoCodeData = await autoCodeRes.json();
  assert.match(autoCodeData.location.code, /^CH-/);

  // 4. Cập nhật thông tin cửa hàng (sửa SĐT, địa chỉ, trạng thái)
  const updateRes = await fetch(`${baseUrl}/api/v1/locations/${newLocId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "Cửa hàng Thanh Xuân Premium",
      address: "102 Nguyễn Trãi, Thanh Xuân, Hà Nội",
      phone: "0988776655",
      status: "Active",
    }),
  });
  assert.equal(updateRes.status, 200);
  const updatedData = await updateRes.json();
  assert.equal(updatedData.location.name, "Cửa hàng Thanh Xuân Premium");
  assert.equal(updatedData.location.phone, "0988776655");

  // 5. Lấy danh sách locations có bộ lọc
  const listRes = await fetch(`${baseUrl}/api/v1/locations?search=Thanh%20Xuân`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.ok(list.some((loc) => loc.code === "CH-TX-01"));

  // 6. Xóa địa điểm chưa gắn lô hàng
  const deleteRes = await fetch(`${baseUrl}/api/v1/locations/${autoCodeData.location.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(deleteRes.status, 200);
});

test("SUBTASK 2 (T-65): POST /api/v1/batches/transfer and history", async () => {
  const { token, user } = await loginAs("distributor@agritrace.demo", "Distributor@123");
  const orgId = user.organizationId ?? user.organization_id;

  // Lấy một lô hàng thuộc sở hữu của nhà phân phối
  const distributorBatch = db
    .prepare("SELECT * FROM batches WHERE organization_id = ? AND remaining_quantity > 50 ORDER BY id LIMIT 1")
    .get(orgId);
  assert.ok(distributorBatch, "Cần có ít nhất một lô hàng của nhà phân phối có tồn kho > 50");

  // Lấy danh sách cửa hàng của nhà phân phối
  const locations = db
    .prepare("SELECT * FROM locations WHERE organization_id = ? AND status = 'Active'")
    .all(orgId);
  assert.ok(locations.length >= 2, "Cần có ít nhất 2 cửa hàng Active");

  const loc1 = locations[0];
  const loc2 = locations[1];
  const initialStock = Number(distributorBatch.remaining_quantity);

  // 1. Kiểm tra điều kiện: Từ chối nếu số lượng vượt quá tồn kho kho tổng (Over-allocation)
  const overAllocRes = await fetch(`${baseUrl}/api/v1/batches/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      batch_id: distributorBatch.id,
      location_id: loc1.id,
      quantity: initialStock + 100, // Vượt quá tồn kho
      note: "Chuyển vượt quá tồn kho",
    }),
  });
  assert.equal(overAllocRes.status, 400);
  const overAllocErr = await overAllocRes.json();
  assert.match(overAllocErr.message, /không đủ để chia/i);

  // 2. Chuyển thành công một phần lô hàng về một cửa hàng cụ thể (Single transfer)
  const transferQty = 20;
  const transferRes = await fetch(`${baseUrl}/api/v1/batches/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      batch_id: distributorBatch.id,
      location_id: loc1.id,
      quantity: transferQty,
      note: "Điều chuyển 20kg về Cửa hàng 1",
    }),
  });
  assert.equal(transferRes.status, 200);
  const transferData = await transferRes.json();
  assert.equal(transferData.success, true);
  assert.equal(transferData.total_transferred_quantity, transferQty);
  assert.equal(transferData.remaining_quantity, initialStock - transferQty);
  assert.equal(transferData.children.length, 1);

  const childBatch = transferData.children[0];
  assert.equal(childBatch.location_id, loc1.id);
  assert.equal(childBatch.initial_quantity, transferQty);
  assert.equal(childBatch.remaining_quantity, transferQty);

  // Kiểm tra DB: lô nguồn đã trừ số lượng tồn kho
  const updatedSource = db.prepare("SELECT remaining_quantity FROM batches WHERE id = ?").get(distributorBatch.id);
  assert.equal(Number(updatedSource.remaining_quantity), initialStock - transferQty);

  // Kiểm tra DB: bảng internal_batch_transfers đã ghi nhận
  const transferHistoryRecord = db
    .prepare("SELECT * FROM internal_batch_transfers WHERE source_batch_id = ? AND location_id = ?")
    .get(distributorBatch.id, loc1.id);
  assert.ok(transferHistoryRecord);
  assert.equal(Number(transferHistoryRecord.quantity), transferQty);

  // 3. Phân bổ nhiều cửa hàng trong cùng 1 lệnh (Multi-allocation transfer)
  const multiAllocRes = await fetch(`${baseUrl}/api/v1/batches/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      batch_id: distributorBatch.id,
      allocations: [
        { location_id: loc1.id, quantity: 10 },
        { location_id: loc2.id, quantity: 15 },
      ],
      note: "Phân bổ đồng thời cho 2 cửa hàng",
    }),
  });
  assert.equal(multiAllocRes.status, 200);
  const multiData = await multiAllocRes.json();
  assert.equal(multiData.children.length, 2);
  assert.equal(multiData.total_transferred_quantity, 25);
  assert.equal(multiData.remaining_quantity, initialStock - transferQty - 25);

  // 4. Lấy lịch sử điều chuyển lô hàng nội bộ qua GET /api/v1/batches/transfers
  const historyRes = await fetch(`${baseUrl}/api/v1/batches/transfers?batch_id=${distributorBatch.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(historyRes.status, 200);
  const historyList = await historyRes.json();
  assert.ok(historyList.length >= 3);
  assert.ok(historyList[0].transfer_code.startsWith("TRF-INT-"));
  assert.ok(historyList[0].source_batch_code);
  assert.ok(historyList[0].location_name);
});
