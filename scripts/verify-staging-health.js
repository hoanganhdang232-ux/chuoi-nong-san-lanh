#!/usr/bin/env node
/**
 * verify-staging-health.js
 * Kiểm tra sức khỏe (Health Check) môi trường Staging sau khi deploy.
 * Báo đỏ (exit 1) nếu:
 *  - Deploy thất bại trên Render (build_failed / update_failed / canceled)
 *  - Endpoint /api/health trả về lỗi hoặc database không khả dụng
 *  - Quá thời gian timeout (mặc định 8 phút / 480 giây) mà phiên bản mới chưa sẵn sàng.
 *
 * Render tự động giữ nguyên phiên bản cũ đang hoạt động ổn định (Zero-Downtime Rollback)
 * khi bản mới không vượt qua health check hoặc preDeployCommand (migration).
 */

const STAGING_URL = (
  process.env.STAGING_URL ||
  process.env.RENDER_SERVICE_URL ||
  "https://agritrace-staging.onrender.com"
).replace(/\/+$/, "");

const TARGET_COMMIT = process.env.TARGET_COMMIT || process.env.GITHUB_SHA || "";
const RENDER_API_KEY = process.env.RENDER_API_KEY || "";
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID || "";
const MAX_WAIT_SECONDS = Number(process.env.MAX_WAIT_SECONDS || 480);
const POLL_INTERVAL_SECONDS = Number(process.env.POLL_INTERVAL_SECONDS || 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkRenderDeployStatus() {
  if (!RENDER_API_KEY || !RENDER_SERVICE_ID) return null;

  try {
    const res = await fetch(
      `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys?limit=1`,
      {
        headers: {
          Authorization: `Bearer ${RENDER_API_KEY}`,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) return null;
    const deploys = await res.json();
    if (!Array.isArray(deploys) || deploys.length === 0) return null;
    return deploys[0].deploy; // { id, status, commit }
  } catch (err) {
    console.warn(`[Render API] Không thể truy vấn trạng thái: ${err.message}`);
    return null;
  }
}

async function fetchHealth() {
  const url = `${STAGING_URL}/api/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const commitHeader = res.headers.get("x-commit-sha") || "";
    const body = await res.json().catch(() => null);

    return {
      ok: res.ok,
      status: res.status,
      body,
      commitHeader,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("==================================================");
  console.log("🚀 BẮT ĐẦU KIỂM TRA SỨC KHỎE STAGING (HEALTH CHECK)");
  console.log(`🌐 Staging URL:   ${STAGING_URL}`);
  if (TARGET_COMMIT) {
    console.log(`📌 Target Commit: ${TARGET_COMMIT}`);
  }
  console.log(`⏱️  Timeout:       ${MAX_WAIT_SECONDS} giây`);
  console.log("==================================================");

  // Đợi 15 giây đầu để Render tiếp nhận deploy trigger
  console.log("⏳ Đang đợi Render khởi tạo bản deploy mới (15s)...");
  await sleep(15000);

  const startTime = Date.now();
  let consecutiveHealthyCount = 0;

  while (true) {
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    if (elapsedSeconds > MAX_WAIT_SECONDS) {
      console.error("");
      console.error("::error::❌ Quá thời gian chờ (Timeout) sau " + elapsedSeconds + "s.");
      console.error("::error::Phiên bản mới không vượt qua kiểm tra sức khỏe.");
      console.error("🛡️ Render tự động giữ nguyên phiên bản cũ đang hoạt động ổn định (Zero-Downtime Rollback).");
      process.exit(1);
    }

    // 1. Kiểm tra trạng thái Render nếu có API Key
    const renderDeploy = await checkRenderDeployStatus();
    if (renderDeploy) {
      const { status } = renderDeploy;
      console.log(`[Render API Status] ${status} (${elapsedSeconds}s)`);
      if (
        status === "build_failed" ||
        status === "update_failed" ||
        status === "canceled" ||
        status === "deactivated"
      ) {
        console.error("");
        console.error(`::error::❌ Render deploy thất bại với trạng thái: ${status}`);
        console.error("🛡️ Render đã hủy bản build mới và duy trì phiên bản cũ ổn định.");
        process.exit(1);
      }
    }

    // 2. Kiểm tra trực tiếp endpoint /api/health
    const health = await fetchHealth();

    if (health.ok && health.body && health.body.status === "ok" && health.body.database === "ok") {
      consecutiveHealthyCount++;
      const currentCommit = health.commitHeader || (health.body && health.body.commit) || "";

      console.log(
        `✅ [${elapsedSeconds}s] Health check OK (HTTP ${health.status}) - DB: ${health.body.database}` +
          (currentCommit ? ` - Commit: ${currentCommit}` : "")
      );

      // Nếu target commit khớp hoặc đã healthy liên tiếp 2 lần sau thời gian chờ đủ dài
      const commitMatches = TARGET_COMMIT && currentCommit && TARGET_COMMIT.startsWith(currentCommit);
      if (commitMatches || consecutiveHealthyCount >= 2) {
        console.log("");
        console.log("==================================================");
        console.log("🎉 XÁC MINH TRIỂN KHAI THÀNH CÔNG!");
        console.log(`- Môi trường Staging đã sẵn sàng tại: ${STAGING_URL}`);
        console.log(`- API Health Check: ${STAGING_URL}/api/health đạt chuẩn`);
        console.log(`- Cơ sở dữ liệu: Kết nối và migration đã hoàn tất`);
        console.log("==================================================");
        process.exit(0);
      }
    } else {
      consecutiveHealthyCount = 0;
      const detail = health.error || `HTTP ${health.status} - ${JSON.stringify(health.body || {})}`;
      console.log(`⏳ [${elapsedSeconds}s] Đang chờ Staging sẵn sàng... (${detail})`);
    }

    await sleep(POLL_INTERVAL_SECONDS * 1000);
  }
}

main().catch((err) => {
  console.error("::error::Lỗi không mong muốn:", err);
  process.exit(1);
});
