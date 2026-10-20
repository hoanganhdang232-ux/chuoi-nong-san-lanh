import test from "node:assert";
import { test as describeTest } from "node:test";
import { getDb } from "../src/db/database.js";
import { createApp } from "../src/app.js";
import {
  evaluateBatchColdChain,
  ingestTemperatureTelemetry,
  archiveOldTemperatureLogs,
} from "../src/services/sprint6ColdChainService.js";

const app = createApp();
const PORT = 3996;
let server;
const baseUrl = `http://localhost:${PORT}`;

describeTest("SPRINT 6 - Cold Chain Monitoring Test Suite", async (t) => {
  let db;
  let farmAdminToken;
  let testProductId;
  let testBatchId;
  let testBatchCode;

  // Helper login
  async function loginAs(email, password) {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    return { token: data.token, user: data.user };
  }

  t.before(async () => {
    server = app.listen(PORT);
    db = getDb();

    // Đăng nhập Farm Admin
    const farmAuth = await loginAs("farm@agritrace.demo", "Farm@123");
    farmAdminToken = farmAuth.token;

    // Tạo sản phẩm mẫu có dải nhiệt độ kiểm thử
    const farmOrgId = farmAuth.user.organizationId || farmAuth.user.organization_id || 1;
    const productInsert = db
      .prepare(
        `INSERT INTO products(organization_id, name, unit, min_temp, max_temp, max_allowed_delay_minutes)
         VALUES (?, ?, 'kg', 2.0, 8.0, 30)`,
      )
      .run(farmOrgId, `Dưa lưới Sprint 6 - ${Date.now()}`);
    testProductId = Number(productInsert.lastInsertRowid);

    // Tạo lô hàng mẫu
    testBatchCode = `BATCH-S6-TEST-${Date.now().toString().slice(-4)}`;
    const batchInsert = db
      .prepare(
        `INSERT INTO batches(batch_code, product_id, organization_id, initial_quantity, remaining_quantity, current_location, temperature_c, status)
         VALUES (?, ?, ?, 500, 500, 'Kho nông trại Đà Lạt', 5.0, 'registered')`,
      )
      .run(testBatchCode, testProductId, farmOrgId);
    testBatchId = Number(batchInsert.lastInsertRowid);
  });

  t.after(() => {
    server.close();
  });

  // ─── 1. T-89 & T-90: Product Cold Chain Configuration ───
  await t.test("T-90: Cập nhật ngưỡng nhiệt độ bảo quản và độ trễ sản phẩm qua PUT /products/:id/cold-chain-config", async () => {
    const res = await fetch(`${baseUrl}/api/v1/products/${testProductId}/cold-chain-config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${farmAdminToken}`,
      },
      body: JSON.stringify({
        min_temp: 3.0,
        max_temp: 7.0,
        max_allowed_delay_minutes: 25,
      }),
    });

    test.equal(res.status, 200);
    const body = await res.json();
    test.equal(body.product.min_temp, 3.0);
    test.equal(body.product.max_temp, 7.0);
    test.equal(body.product.max_allowed_delay_minutes, 25);

    // Kiểm tra validation: min_temp > max_temp phải bị từ chối 400
    const invalidRes = await fetch(`${baseUrl}/api/v1/products/${testProductId}/cold-chain-config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${farmAdminToken}`,
      },
      body: JSON.stringify({
        min_temp: 10.0,
        max_temp: 5.0,
      }),
    });
    test.equal(invalidRes.status, 400);

    // Kiểm tra GET cấu hình
    const getRes = await fetch(`${baseUrl}/api/v1/products/${testProductId}/cold-chain-config`, {
      headers: { Authorization: `Bearer ${farmAdminToken}` },
    });
    test.equal(getRes.status, 200);
    const configData = await getRes.json();
    test.equal(configData.minTemp, 3.0);
    test.equal(configData.maxTemp, 7.0);
    test.equal(configData.maxAllowedDelayMinutes, 25);
  });

  // ─── 2. T-92 & T-93: Public Telemetry Ingestion API ───
  await t.test("T-93: Telemetry Ingestion API nhận chuỗi dữ liệu cảm biến IoT", async () => {
    const now = Date.now();
    const payload = {
      readings: [
        {
          batch_id: testBatchId,
          temperature: 4.5,
          recorded_at: new Date(now - 10 * 60 * 1000).toISOString(),
          sensor_id: "SENSOR-TEST-01",
          shipment_id: 10,
        },
        {
          batch_code: testBatchCode,
          temperature: 5.2,
          recorded_at: new Date(now - 5 * 60 * 1000).toISOString(),
          sensor_id: "SENSOR-TEST-01",
          shipment_id: 10,
        },
      ],
    };

    const res = await fetch(`${baseUrl}/api/v1/telemetry/temperature`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    test.equal(res.status, 201);
    const data = await res.json();
    test.equal(data.success, true);
    test.equal(data.count, 2);

    // Kiểm tra log đã được ghi vào bảng temperature_logs
    const logs = db
      .prepare("SELECT * FROM temperature_logs WHERE batch_id = ? ORDER BY id DESC LIMIT 2")
      .all(testBatchId);
    test.equal(logs.length, 2);
    test.equal(logs[0].sensor_id, "SENSOR-TEST-01");
    test.equal(logs[0].shipment_id, 10);
  });

  // ─── 3. T-95 & T-96: Phân biệt vi phạm ngắt quãng và vi phạm liên tục ───
  await t.test("T-96: Vi phạm ngắt quãng (15 phút < ngưỡng 25 phút) KHÔNG kích hoạt báo động", async () => {
    // Tạo 1 lô hàng riêng biệt cho test ngắt quãng
    const batchCode = `BATCH-INTERMIT-${Date.now().toString().slice(-4)}`;
    const bInsert = db
      .prepare(
        `INSERT INTO batches(batch_code, product_id, organization_id, initial_quantity, remaining_quantity, temperature_c, status)
         VALUES (?, ?, 1, 100, 100, 4.0, 'registered')`,
      )
      .run(batchCode, testProductId);
    const bId = Number(bInsert.lastInsertRowid);

    const now = Date.now();
    // Bơm 3 mẫu vượt ngưỡng 9.0°C cách nhau 5 phút (tổng thời gian vượt: 10-15 phút < 25 phút cho phép)
    // Sau đó nhiệt độ hạ về 4.0°C an toàn
    const readings = [
      { batch_id: bId, temperature: 4.0, recorded_at: new Date(now - 30 * 60000).toISOString() },
      { batch_id: bId, temperature: 9.5, recorded_at: new Date(now - 20 * 60000).toISOString() },
      { batch_id: bId, temperature: 9.8, recorded_at: new Date(now - 15 * 60000).toISOString() },
      { batch_id: bId, temperature: 9.2, recorded_at: new Date(now - 10 * 60000).toISOString() },
      { batch_id: bId, temperature: 4.5, recorded_at: new Date(now - 5 * 60000).toISOString() }, // Đã hạ nhiệt!
    ];

    ingestTemperatureTelemetry(readings);

    const result = evaluateBatchColdChain(bId);
    test.equal(result.isCurrentlyViolating, false);

    // Không được kích hoạt cờ cảnh báo trên lô
    const batchRow = db.prepare("SELECT cold_chain_alert FROM batches WHERE id = ?").get(bId);
    test.equal(batchRow.cold_chain_alert, 0);

    // Không được tạo sự kiện vi phạm COLD_CHAIN_VIOLATION
    const events = db
      .prepare("SELECT * FROM event_logs WHERE batch_id = ? AND event_type = 'COLD_CHAIN_VIOLATION'")
      .all(bId);
    test.equal(events.length, 0);
  });

  await t.test("T-95 & T-97 & T-98: Vi phạm liên tục (>25 phút) KÍCH HOẠT báo động, tạo sự kiện và đính Hash Chain", async () => {
    // Tạo 1 lô hàng riêng biệt cho test vi phạm liên tục
    const batchCode = `BATCH-VIOLATION-${Date.now().toString().slice(-4)}`;
    const bInsert = db
      .prepare(
        `INSERT INTO batches(batch_code, product_id, organization_id, initial_quantity, remaining_quantity, temperature_c, status)
         VALUES (?, ?, 1, 100, 100, 4.0, 'registered')`,
      )
      .run(batchCode, testProductId);
    const bId = Number(bInsert.lastInsertRowid);

    const now = Date.now();
    // Bơm 8 mẫu vượt ngưỡng liên tục (8 x 5 phút = 35 phút > 25 phút ngưỡng cho phép)
    const readings = Array.from({ length: 8 }, (_, idx) => ({
      batch_id: bId,
      temperature: 11.0 + idx * 0.4, // 11°C đến 13.8°C > max_temp 7°C
      recorded_at: new Date(now - (7 - idx) * 5 * 60000).toISOString(),
      sensor_id: "IOT-VIOLATE-SENSOR",
      shipment_id: 99,
    }));

    const ingestRes = ingestTemperatureTelemetry(readings);
    test.equal(ingestRes.violationsDetected.length, 1);

    // 1. Kiểm tra lô hàng đã được bật cờ vi phạm chuỗi lạnh (T-103)
    const updatedBatch = db.prepare("SELECT cold_chain_alert, temperature_c FROM batches WHERE id = ?").get(bId);
    test.equal(updatedBatch.cold_chain_alert, 1);
    test.equal(updatedBatch.temperature_c, readings.at(-1).temperature);

    // 2. Kiểm tra bản ghi trong cold_chain_alerts (T-97)
    const alertRow = db
      .prepare("SELECT * FROM cold_chain_alerts WHERE batch_id = ? AND resolved_at IS NULL")
      .get(bId);
    test.ok(alertRow);
    test.match(alertRow.message, /Vi phạm chuỗi lạnh/);

    // 3. Kiểm tra sự kiện COLD_CHAIN_VIOLATION trong Hash Chain (T-98)
    const violationEvents = db
      .prepare("SELECT * FROM event_logs WHERE batch_id = ? AND event_type = 'COLD_CHAIN_VIOLATION'")
      .all(bId);
    test.equal(violationEvents.length, 1);

    const event = violationEvents[0];
    test.ok(event.previous_hash);
    test.ok(event.current_hash);
    test.equal(event.current_hash.length, 64); // SHA-256 hash length

    const meta = JSON.parse(event.data_json);
    test.equal(meta.violation_type, "HIGH_TEMP");
    test.equal(meta.allowed_delay_minutes, 25);
    test.ok(meta.duration_minutes >= 30);
    test.ok(meta.peak_temperature_c >= 13.5);
    test.equal(meta.sensor_id, "IOT-VIOLATE-SENSOR");

    // 4. Kiểm tra thông báo in-app đã gửi đến tổ chức (T-102)
    const notifs = db
      .prepare("SELECT * FROM notifications WHERE type = 'COLD_CHAIN_ALERT' ORDER BY id DESC LIMIT 5")
      .all();
    test.ok(notifs.length > 0);
    test.match(notifs[0].title, /Vi phạm chuỗi lạnh/);
  });

  // ─── 4. T-100: Temperature History API ───
  await t.test("T-100: GET /api/v1/batches/:id/temperature-history trả về đủ dữ liệu vẽ biểu đồ và phân vùng an toàn", async () => {
    const res = await fetch(`${baseUrl}/api/v1/batches/${testBatchId}/temperature-history`, {
      headers: { Authorization: `Bearer ${farmAdminToken}` },
    });

    test.equal(res.status, 200);
    const data = await res.json();

    test.ok(data.batch);
    test.equal(data.batch.id, testBatchId);
    test.ok(data.config);
    test.equal(data.config.minTemp, 3.0);
    test.equal(data.config.maxTemp, 7.0);
    test.ok(Array.isArray(data.logs));
    test.ok(data.logs.length >= 2);
    test.ok(data.stats);
    test.ok(Number.isFinite(data.stats.minRecorded));
    test.ok(Number.isFinite(data.stats.maxRecorded));
    test.ok(Number.isFinite(data.stats.avgRecorded));
  });

  // ─── 5. T-104 & T-105: Background Aggregation & Archiving ───
  await t.test("T-104 & T-105: Nén và Archive dữ liệu nhiệt độ cũ (>30 ngày)", async () => {
    // Tạo dữ liệu cũ 45 ngày trước
    const oldTimestamp = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const insertOld = db.prepare(
      `INSERT INTO temperature_logs(batch_id, temperature, source, sensor_id, timestamp, recorded_at)
       VALUES (?, ?, 'old_sensor', 'OLD-SENSOR', ?, ?)`,
    );

    insertOld.run(testBatchId, 5.0, oldTimestamp, oldTimestamp);
    insertOld.run(testBatchId, 6.0, oldTimestamp, oldTimestamp);
    insertOld.run(testBatchId, 7.0, oldTimestamp, oldTimestamp);

    // Chạy archiveOldTemperatureLogs cho log > 30 ngày
    const archiveResult = archiveOldTemperatureLogs(30);
    test.equal(archiveResult.success, true);
    test.ok(archiveResult.archivedCount >= 3);

    // Kiểm tra đã lưu vào temperature_logs_archive
    const archivedRows = db
      .prepare("SELECT COUNT(*) AS c FROM temperature_logs_archive WHERE batch_id = ?")
      .get(testBatchId).c;
    test.ok(archivedRows >= 3);

    // Kiểm tra đã nén vào temperature_hourly_aggregates
    const aggRows = db
      .prepare("SELECT * FROM temperature_hourly_aggregates WHERE batch_id = ?")
      .all(testBatchId);
    test.ok(aggRows.length >= 1);
    test.equal(aggRows[0].min_temperature, 5.0);
    test.equal(aggRows[0].max_temperature, 7.0);
    test.equal(aggRows[0].reading_count, 3);

    // Kiểm tra API maintenance archive
    const maintRes = await fetch(`${baseUrl}/api/v1/cold-chain/maintenance/archive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${farmAdminToken}`,
      },
      body: JSON.stringify({ daysOld: 30 }),
    });
    test.equal(maintRes.status, 200);
    const maintData = await maintRes.json();
    test.ok(maintData.details);
  });

  // ─── 6. Overview API ───
  await t.test("GET /api/v1/cold-chain/overview trả về thống kê chuỗi lạnh toàn tổ chức", async () => {
    const res = await fetch(`${baseUrl}/api/v1/cold-chain/overview`, {
      headers: { Authorization: `Bearer ${farmAdminToken}` },
    });
    test.equal(res.status, 200);
    const overview = await res.json();
    test.ok(overview.totalBatches >= 1);
    test.ok(overview.totalLogs >= 1);
  });
});
