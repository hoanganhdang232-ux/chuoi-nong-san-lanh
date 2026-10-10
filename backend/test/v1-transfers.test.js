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

test("API v1 Transfers: Schema & Views lot_transfers and lots exist", () => {
  const lotView = db.prepare("SELECT * FROM lots LIMIT 1").get();
  assert.ok(lotView, "View lots should be accessible and return rows");

  const lotTransfersView = db.prepare("SELECT * FROM lot_transfers").all();
  assert.ok(Array.isArray(lotTransfersView), "View lot_transfers should be accessible");
});

test("API v1 Transfers: Full Handover workflow with Locking, Validation, Reject, Cancel, and Approve", async () => {
  const farm = findUserByEmail("farm@agritrace.demo");
  const processor = findUserByEmail("processor@agritrace.demo");
  const farmToken = createToken(farm);
  const processorToken = createToken(processor);

  const plot = db
    .prepare(
      `SELECT lp.id FROM land_plots lp
       INNER JOIN farms f ON f.id = lp.farm_id
       WHERE f.organization_id = ? LIMIT 1`,
    )
    .get(farm.organization_id);
  const farmProduct = db
    .prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1")
    .get(farm.organization_id);

  // 1. Find or create an eligible batch owned by farm
  const harvestRes = await fetch(`${baseUrl}/api/batches/harvest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${farmToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      landPlotId: plot.id,
      productId: farmProduct.id,
      quantityKg: 200,
      harvestedAt: new Date().toISOString(),
    }),
  });
  assert.equal(harvestRes.status, 201);
  const harvestData = await harvestRes.json();
  const testBatchId = harvestData.batch.id;

  // 2. Validation: Cannot transfer to own organization
  const selfTransferRes = await fetch(`${baseUrl}/api/v1/transfers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${farmToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lot_id: testBatchId,
      receiver_org_id: farm.organization_id,
      note: "Tự chuyển",
    }),
  });
  assert.equal(selfTransferRes.status, 400);
  const selfError = await selfTransferRes.json();
  assert.match(selfError.message, /Không thể bàn giao lô hàng cho chính tổ chức/);

  // 3. Initiate handover from Farm to Processor
  const initRes = await fetch(`${baseUrl}/api/v1/transfers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${farmToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lot_id: testBatchId,
      receiver_org_id: processor.organization_id,
      note: "Bàn giao lô thử nghiệm v1",
    }),
  });
  assert.equal(initRes.status, 201);
  const initData = await initRes.json();
  assert.equal(initData.status, "PENDING");
  assert.equal(initData.lot_id, testBatchId);
  const transferId = initData.id;

  // Check batch state: ownership remains with Farm, status is pending_confirmation
  const lockedBatch = db.prepare("SELECT * FROM batches WHERE id = ?").get(testBatchId);
  assert.equal(lockedBatch.organization_id, farm.organization_id);
  assert.equal(lockedBatch.status, "pending_confirmation");

  // 4. Test Lock: Batch cannot be split, merged, or updated status while PENDING
  const splitRes = await fetch(`${baseUrl}/api/batches/${testBatchId}/split`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${farmToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      allocations: [{ quantity: 50 }, { quantity: 150 }],
    }),
  });
  assert.equal(splitRes.status, 400);
  const splitErr = await splitRes.json();
  assert.match(splitErr.message, /khóa/);

  const statusUpdateRes = await fetch(`${baseUrl}/api/batches/${testBatchId}/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${farmToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "processed",
    }),
  });
  assert.equal(statusUpdateRes.status, 400);

  // 5. Test GET /api/v1/transfers/pending
  const pendingListRes = await fetch(`${baseUrl}/api/v1/transfers/pending`, {
    headers: { Authorization: `Bearer ${processorToken}` },
  });
  assert.equal(pendingListRes.status, 200);
  const pendingList = await pendingListRes.json();
  assert.ok(Array.isArray(pendingList));
  const foundPending = pendingList.find((item) => item.id === transferId);
  assert.ok(foundPending);
  assert.equal(foundPending.status, "PENDING");

  // 6. Test Reject: Sender cannot reject
  const senderRejectRes = await fetch(`${baseUrl}/api/v1/transfers/${transferId}/reject`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${farmToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: "Bên gửi không được từ chối yêu cầu này",
    }),
  });
  assert.equal(senderRejectRes.status, 403);

  // 7. Test Reject: Reason must have >= 10 characters
  const shortReasonRejectRes = await fetch(`${baseUrl}/api/v1/transfers/${transferId}/reject`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${processorToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: "Hỏng", // < 10 characters
    }),
  });
  assert.equal(shortReasonRejectRes.status, 400);
  const shortErr = await shortReasonRejectRes.json();
  assert.match(shortErr.message, /tối thiểu 10 ký tự/);

  // 8. Test Valid Reject (>= 10 chars): Batch unlocked and returned to Farm
  const validRejectRes = await fetch(`${baseUrl}/api/v1/transfers/${transferId}/reject`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${processorToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: "Hàng bị dập nát trong thùng bảo quản không đạt chuẩn",
    }),
  });
  assert.equal(validRejectRes.status, 200);
  const rejectData = await validRejectRes.json();
  assert.equal(rejectData.status, "REJECTED");

  const restoredBatch = db.prepare("SELECT * FROM batches WHERE id = ?").get(testBatchId);
  assert.equal(restoredBatch.status, "registered");
  assert.equal(restoredBatch.organization_id, farm.organization_id);

  // 9. Re-initiate and test Cancel by Sender
  const init2Res = await fetch(`${baseUrl}/api/v1/transfers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${farmToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lot_id: testBatchId,
      receiver_org_id: processor.organization_id,
      note: "Thử hủy lệnh",
    }),
  });
  assert.equal(init2Res.status, 201);
  const init2Data = await init2Res.json();

  const cancelRes = await fetch(`${baseUrl}/api/v1/transfers/${init2Data.id}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${farmToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: "Tự hủy do phát hiện nhầm lẫn khối lượng",
    }),
  });
  assert.equal(cancelRes.status, 200);
  const cancelData = await cancelRes.json();
  assert.equal(cancelData.status, "CANCELLED");

  // 10. Re-initiate and test Approve by Receiver
  const init3Res = await fetch(`${baseUrl}/api/v1/transfers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${farmToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lot_id: testBatchId,
      receiver_org_id: processor.organization_id,
      note: "Bàn giao thành công",
    }),
  });
  assert.equal(init3Res.status, 201);
  const init3Data = await init3Res.json();

  const approveRes = await fetch(`${baseUrl}/api/v1/transfers/${init3Data.id}/approve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${processorToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: "Đã kiểm tra chất lượng và nhận đủ hàng vào kho",
    }),
  });
  assert.equal(approveRes.status, 200);
  const approveData = await approveRes.json();
  assert.equal(approveData.status, "APPROVED");

  // Ownership transferred to Processor
  const transferredBatch = db.prepare("SELECT * FROM batches WHERE id = ?").get(testBatchId);
  assert.equal(transferredBatch.organization_id, processor.organization_id);
  assert.equal(transferredBatch.status, "in_transit");
});
