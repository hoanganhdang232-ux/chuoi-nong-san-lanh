import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";

const { createApp } = await import("../src/app.js");
const { getDb } = await import("../src/db/database.js");
const { runMigrations } = await import("../src/db/migrations.js");
const { seedDemoData } = await import("../src/db/seed.js");
const { createToken, findUserByEmail } = await import("../src/services/authService.js");
const { publicTraceLimiter } = await import("../src/middleware/rateLimiter.js");
const { cacheStore, invalidatePublicTraceCache } = await import("../src/services/cacheService.js");

let server;
let baseUrl;
const db = getDb();

function resetDatabase() {
  runMigrations();
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(`
    DROP TRIGGER IF EXISTS event_logs_prevent_update;
    DROP TRIGGER IF EXISTS event_logs_prevent_delete;
    DROP TRIGGER IF EXISTS audit_logs_prevent_update;
    DROP TRIGGER IF EXISTS audit_logs_prevent_delete;
  `);
  for (const table of [
    "certifications",
    "notifications",
    "recall_items",
    "recall_cases",
    "cold_chain_alerts",
    "temperature_logs",
    "event_logs",
    "batch_transfers",
    "batches",
    "locations",
    "products",
    "land_plots",
    "farms",
    "users",
    "organizations",
  ]) {
    try {
      db.exec(`DELETE FROM ${table}`);
    } catch {
      // ignore
    }
  }
  db.exec("DELETE FROM sqlite_sequence;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations();
  seedDemoData();
  cacheStore.clear();
  publicTraceLimiter.resetAll();
}

function authHeaders(user) {
  return {
    Authorization: `Bearer ${createToken(user)}`,
    "Content-Type": "application/json",
  };
}

describe("SPRINT 7 - Public QR Code Trace, Security & Notification Center Test Suite", () => {
  before(async () => {
    resetDatabase();
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test("T-106 & T-107: POST /api/v1/batches/:id/qr sinh mã QR SVG, PNG DataURL và public URL hợp lệ", async () => {
    const farmUser = findUserByEmail("farm@agritrace.demo");
    const batch = db.prepare("SELECT id, batch_code FROM batches LIMIT 1").get();
    assert.ok(batch);

    const res = await fetch(`${baseUrl}/api/v1/batches/${batch.id}/qr`, {
      method: "POST",
      headers: authHeaders(farmUser),
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.batchId, batch.id);
    assert.equal(data.batchCode, batch.batch_code);
    assert.ok(data.publicCode, "Phải có publicCode");
    assert.ok(data.publicCode.startsWith("TRC-"), "Public code phải bắt đầu bằng TRC-");
    assert.ok(data.publicUrl.includes(data.publicCode), "Public URL phải chứa publicCode");
    assert.ok(data.qrSvg.includes("<svg"), "QR SVG phải là chuỗi SVG hợp lệ");
    assert.ok(data.qrDataUrl.startsWith("data:image/png;base64,"), "QR DataURL phải là ảnh PNG base64");

    // Kiểm tra DB đã cập nhật batches.public_code
    const dbBatch = db.prepare("SELECT public_code FROM batches WHERE id = ?").get(batch.id);
    assert.equal(dbBatch.public_code, data.publicCode);
  });

  test("T-109: GET /api/v1/public/trace/:code truy xuất công khai không cần đăng nhập", async () => {
    const batch = db.prepare("SELECT id, batch_code, public_code FROM batches WHERE public_code IS NOT NULL LIMIT 1").get();
    assert.ok(batch);

    // Không gửi Authorization header
    const res = await fetch(`${baseUrl}/api/v1/public/trace/${batch.public_code}`, {
      headers: { "x-test-bypass-rate-limit": "true" },
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get("cache-control"), "Phải có header Cache-Control");

    const data = await res.json();
    assert.equal(data.publicCode, batch.public_code);
    assert.equal(data.batchCode, batch.batch_code);
    assert.ok(data.product.name);
    assert.ok(data.origin.farmRegion);
    assert.ok(data.safetyStatus.badge);
    assert.ok(Array.isArray(data.timeline));
    assert.ok(data.integrity.isChainValid);
  });

  test("T-112, T-113 & T-114: Kiểm thử bảo mật dữ liệu nhạy cảm (Data Masking DTO & Role Anonymization)", async () => {
    const batch = db.prepare("SELECT id, batch_code, public_code FROM batches WHERE public_code IS NOT NULL LIMIT 1").get();
    assert.ok(batch);

    const res = await fetch(`${baseUrl}/api/v1/public/trace/${batch.public_code}`, {
      headers: { "x-test-bypass-rate-limit": "true" },
    });
    assert.equal(res.status, 200);
    const trace = await res.json();
    const rawJson = JSON.stringify(trace);

    // T-112: Tuyệt đối KHÔNG chứa các trường dữ liệu kinh doanh / tài chính / nội bộ
    assert.strictEqual(trace.initial_quantity, undefined, "Không được chứa initial_quantity");
    assert.strictEqual(trace.remaining_quantity, undefined, "Không được chứa remaining_quantity");
    assert.strictEqual(trace.consumed_quantity, undefined, "Không được chứa consumed_quantity");
    assert.strictEqual(trace.price, undefined, "Không được chứa price");
    assert.strictEqual(trace.financial_details, undefined, "Không được chứa financial_details");
    assert.strictEqual(trace.weight, undefined, "Không được chứa weight");

    // Kiểm tra raw json string không rò rỉ email cá nhân hay chuỗi nhạy cảm
    assert.ok(!rawJson.includes("@agritrace.demo"), "Không rò rỉ email người dùng nội bộ");
    assert.ok(!rawJson.includes('"price":'), "Không rò rỉ trường price");
    assert.ok(!rawJson.includes('"remaining_quantity":'), "Không rò rỉ trường remaining_quantity");

    // T-113: Tên đối tác trung gian trong timeline phải được bán ẩn danh
    for (const item of trace.timeline) {
      assert.ok(item.partnerRole, "Phải có partnerRole đại diện");
      assert.ok(
        !item.partnerRole.includes("@"),
        "partnerRole không được là email cá nhân",
      );
    }
  });

  test("T-111: GET /api/v1/public/verify-chain/:code xác minh tính toàn vẹn toán học của Hash Chain", async () => {
    const batch = db.prepare("SELECT id, batch_code, public_code FROM batches WHERE public_code IS NOT NULL LIMIT 1").get();
    assert.ok(batch);

    const res = await fetch(`${baseUrl}/api/v1/public/verify-chain/${batch.public_code}`, {
      headers: { "x-test-bypass-rate-limit": "true" },
    });
    assert.equal(res.status, 200);
    const proof = await res.json();

    assert.equal(proof.verified, true);
    assert.equal(proof.algorithm, "SHA-256");
    assert.ok(proof.status.includes("TOÀN VẸN"));
    assert.ok(Array.isArray(proof.blocks));

    // Kiểm tra tính liên tục của previousHash và currentHash
    for (let i = 1; i < proof.blocks.length; i++) {
      assert.equal(proof.blocks[i].previousHash, proof.blocks[i - 1].currentHash);
      assert.equal(proof.blocks[i].isValidLink, true);
    }
  });

  test("T-115 & T-116: Rate Limiting & Captcha Challenge chống cào dữ liệu hàng loạt", async () => {
    publicTraceLimiter.resetAll();
    const batch = db.prepare("SELECT public_code FROM batches WHERE public_code IS NOT NULL LIMIT 1").get();
    const testIp = "192.168.10.99";

    // Gửi request bình thường, kiểm tra headers
    const res = await fetch(`${baseUrl}/api/v1/public/trace/${batch.public_code}`, {
      headers: { "x-forwarded-for": testIp },
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("x-ratelimit-limit"));
    assert.ok(res.headers.get("x-ratelimit-remaining"));

    // Giả lập vượt ngưỡng Rate Limit (>60 reqs/min)
    for (let i = 0; i < 62; i++) {
      publicTraceLimiter.recordRequest(testIp);
    }

    const blockedRes = await fetch(`${baseUrl}/api/v1/public/trace/${batch.public_code}`, {
      headers: { "x-forwarded-for": testIp },
    });

    assert.equal(blockedRes.status, 429, "Phải trả về HTTP 429 khi vượt ngưỡng");
    const blockedData = await blockedRes.json();
    assert.equal(blockedData.error, "RATE_LIMIT_EXCEEDED");
    assert.ok(blockedRes.headers.get("retry-after"));

    // T-116: Giả lập IP bị bật thử thách Captcha
    publicTraceLimiter.resetAll();
    const burstIp = "192.168.10.88";
    // Kích hoạt burst traffic (>25 requests trong 10s)
    for (let i = 0; i < 28; i++) {
      publicTraceLimiter.recordRequest(burstIp);
    }

    // Khi không kèm token Captcha -> HTTP 403 CAPTCHA_CHALLENGE_REQUIRED
    const challengeRes = await fetch(`${baseUrl}/api/v1/public/trace/${batch.public_code}`, {
      headers: { "x-forwarded-for": burstIp },
    });
    assert.equal(challengeRes.status, 403);
    const challengeData = await challengeRes.json();
    assert.equal(challengeData.captchaRequired, true);

    // Khi cung cấp token Captcha hợp lệ -> thành công 200
    const passRes = await fetch(`${baseUrl}/api/v1/public/trace/${batch.public_code}`, {
      headers: {
        "x-forwarded-for": burstIp,
        "x-captcha-token": "test-captcha-token-valid",
      },
    });
    assert.equal(passRes.status, 200);
  });

  test("T-117: Cache Aside Pattern tăng tốc độ tải trang & Invalidation", async () => {
    cacheStore.clear();
    const batch = db.prepare("SELECT public_code, id FROM batches WHERE public_code IS NOT NULL LIMIT 1").get();

    // Lần 1: Cache Miss -> truy vấn DB
    const res1 = await fetch(`${baseUrl}/api/v1/public/trace/${batch.public_code}`, {
      headers: { "x-test-bypass-rate-limit": "true" },
    });
    assert.equal(res1.status, 200);

    const statsAfterFirst = cacheStore.getStats();
    assert.ok(statsAfterFirst.size > 0, "Dữ liệu phải được lưu vào Cache Store");

    // Lần 2: Cache Hit
    const res2 = await fetch(`${baseUrl}/api/v1/public/trace/${batch.public_code}`, {
      headers: { "x-test-bypass-rate-limit": "true" },
    });
    assert.equal(res2.status, 200);
    const statsAfterSecond = cacheStore.getStats();
    assert.ok(statsAfterSecond.hits >= 1, "Lần 2 phải có Cache Hit");

    // Invalidation: Khi có sự kiện mới, xóa cache
    invalidatePublicTraceCache(batch.public_code);
    assert.equal(cacheStore.get(`public:trace:${batch.public_code}`), null);
  });

  test("T-120 & T-121: Notification Center History, bộ lọc phân loại và Đọc tất cả", async () => {
    const farmUser = findUserByEmail("farm@agritrace.demo");

    // Tạo thông báo mẫu các phân loại khác nhau
    const insertNotif = db.prepare(`
      INSERT INTO notifications (user_id, organization_id, org_id, kind, type, title, message, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    insertNotif.run(farmUser.id, farmUser.organization_id, farmUser.organization_id, "cold_chain", "COLD_CHAIN_ALERT", "Cảnh báo chuỗi lạnh xe số 12", "Nhiệt độ vượt 9 độ C", 0);
    insertNotif.run(farmUser.id, farmUser.organization_id, farmUser.organization_id, "recall", "RECALL_INITIATED", "Lệnh thu hồi khẩn cấp lô dưa", "Phát hiện dư lượng vi sinh", 0);
    insertNotif.run(farmUser.id, farmUser.organization_id, farmUser.organization_id, "transfer", "TRANSFER_REQUEST", "Yêu cầu bàn giao lô mới", "Bàn giao sang nhà chế biến", 0);

    // 1. Lọc tất cả
    const allRes = await fetch(`${baseUrl}/api/v1/notifications/history?type=all`, {
      headers: authHeaders(farmUser),
    });
    assert.equal(allRes.status, 200);
    const allData = await allRes.json();
    assert.ok(allData.totalCount >= 3);
    assert.ok(allData.categoryCounts.cold_chain >= 1);
    assert.ok(allData.categoryCounts.recall >= 1);
    assert.ok(allData.categoryCounts.transfer >= 1);

    // 2. Lọc chuỗi lạnh
    const coldRes = await fetch(`${baseUrl}/api/v1/notifications/history?type=cold_chain`, {
      headers: authHeaders(farmUser),
    });
    assert.equal(coldRes.status, 200);
    const coldData = await coldRes.json();
    assert.ok(coldData.notifications.length >= 1);
    assert.ok(coldData.notifications.every((n) => n.title.includes("chuỗi lạnh") || n.type.includes("COLD_CHAIN")));

    // 3. T-121: PUT /api/v1/notifications/read-all
    const readAllRes = await fetch(`${baseUrl}/api/v1/notifications/read-all`, {
      method: "PUT",
      headers: authHeaders(farmUser),
    });
    assert.equal(readAllRes.status, 200);
    const readAllResult = await readAllRes.json();
    assert.equal(readAllResult.success, true);

    // Kiểm tra unreadCount trở về 0
    const checkRes = await fetch(`${baseUrl}/api/v1/notifications/history?isRead=unread`, {
      headers: authHeaders(farmUser),
    });
    const checkData = await checkRes.json();
    assert.equal(checkData.notifications.length, 0);
  });

  test("T-122: GET /api/v1/certifications và tích hợp chứng nhận VietGAP, GlobalGAP, OCOP", async () => {
    const farmUser = findUserByEmail("farm@agritrace.demo");

    const res = await fetch(`${baseUrl}/api/v1/certifications`, {
      headers: authHeaders(farmUser),
    });
    assert.equal(res.status, 200);
    const certs = await res.json();
    assert.ok(Array.isArray(certs));
    assert.ok(certs.length >= 3, "Phải có ít nhất 3 chứng nhận VietGAP, GlobalGAP, OCOP");

    const standards = certs.map((c) => c.standard);
    assert.ok(standards.includes("VietGAP"));
    assert.ok(standards.includes("GlobalGAP"));
    assert.ok(standards.includes("OCOP"));
  });
});
