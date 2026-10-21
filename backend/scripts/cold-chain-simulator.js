#!/usr/bin/env node

/**
 * ==============================================================================
 * SPRINT 6 - T-94: MOCK IOT SENSOR TELEMETRY SIMULATOR
 * Kịch bản giả lập thiết bị cảm biến IoT gửi luồng dữ liệu nhiệt độ định kỳ
 * phục vụ kiểm thử và demo giám sát chuỗi lạnh nông sản.
 * ==============================================================================
 *
 * CÁCH SỬ DỤNG:
 * 1. Chạy kịch bản chuẩn (bình thường 2°C - 8°C):
 *    node scripts/cold-chain-simulator.js --mode=normal
 *
 * 2. Chạy kịch bản vi phạm ngắt quãng (15 phút, KHÔNG báo động vì < 30 phút):
 *    node scripts/cold-chain-simulator.js --mode=intermittent
 *
 * 3. Chạy kịch bản vi phạm liên tục (>30 phút, KÍCH HOẠT BÁO ĐỘNG & HASH CHAIN):
 *    node scripts/cold-chain-simulator.js --mode=violation
 *
 * 4. Chạy kịch bản đóng băng quá mức (< 0°C trong 40 phút):
 *    node scripts/cold-chain-simulator.js --mode=freezing
 *
 * 5. Chạy luồng real-time (gửi định kỳ mỗi 5 giây 1 mẫu):
 *    node scripts/cold-chain-simulator.js --mode=stream --interval=5
 * ==============================================================================
 */

import { parseArgs } from "node:util";

const options = {
  mode: { type: "string", default: "violation" },
  batch: { type: "string", default: "" },
  url: { type: "string", default: "http://localhost:3001/api/v1/telemetry/temperature" },
  sensor: { type: "string", default: "IOT-TRUCK-COLD-01" },
  shipment: { type: "string", default: "1" },
  interval: { type: "string", default: "5" },
  count: { type: "string", default: "10" },
  help: { type: "boolean", default: false },
};

const { values } = parseArgs({ options, allowPositionals: true });

if (values.help) {
  console.log(`
📡 Bộ giả lập cảm biến nhiệt độ IoT Agritrace (Sprint 6 - T-94)
--------------------------------------------------------------
Tùy chọn:
  --mode        Kịch bản kiểm thử:
                * 'normal': Dải an toàn (3°C - 6°C)
                * 'intermittent': Tăng đột biến 15 phút rồi hạ lại (Không vi phạm)
                * 'violation': Vượt >8°C liên tục 40 phút (Phát hiện vi phạm & Hash Chain)
                * 'freezing': Hạ <-1°C liên tục 40 phút (Vi phạm nhiệt độ âm)
                * 'stream': Bơm dữ liệu liên tục theo thời gian thực
  --batch       Mã hoặc ID của lô hàng (nếu để trống script sẽ tự tìm lô đầu tiên)
  --url         Endpoint Ingestion API (Mặc định: http://localhost:3001/api/v1/telemetry/temperature)
  --sensor      Mã cảm biến (Mặc định: IOT-TRUCK-COLD-01)
  --interval    Khoảng cách giây giữa các lần bắn mẫu khi stream (Mặc định: 5s)
  --count       Số lượng mẫu sinh ra (Mặc định: 10 mẫu)
  `);
  process.exit(0);
}

const API_BASE = values.url.replace(/\/api\/v1\/telemetry\/temperature$/, "");

async function getTargetBatch() {
  if (values.batch) return values.batch;
  try {
    let token = null;
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "farm@agritrace.demo", password: "Farm@123" }),
    });
    if (loginRes.ok) {
      const authData = await loginRes.json();
      token = authData.token;
    }

    const res = await fetch(`${API_BASE}/api/batches`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const batches = await res.json();
      if (Array.isArray(batches) && batches.length > 0) {
        return batches[0].batch_code || batches[0].id;
      }
    }
  } catch {
    // ignore
  }
  return "BATCH-TEST-001";
}

function generateScenarioReadings(mode, batchTarget, count = 10) {
  const readings = [];
  const now = Date.now();
  const stepMs = 5 * 60 * 1000; // Mỗi mẫu cách nhau 5 phút

  switch (mode) {
    case "normal":
      // An toàn: 3.5°C đến 5.8°C
      for (let i = 0; i < count; i++) {
        const time = new Date(now - (count - 1 - i) * stepMs).toISOString();
        const temp = Number((4.0 + Math.sin(i) * 1.5).toFixed(1));
        readings.push({
          batch_code: String(batchTarget),
          temperature: temp,
          recorded_at: time,
          sensor_id: values.sensor,
          shipment_id: Number(values.shipment) || 1,
        });
      }
      break;

    case "intermittent":
      // 3 mẫu đầu an toàn, 3 mẫu sau (15 phút) tăng lên 10.5°C, rồi lại hạ về 4.5°C
      for (let i = 0; i < count; i++) {
        const time = new Date(now - (count - 1 - i) * stepMs).toISOString();
        let temp = 4.5;
        if (i >= 3 && i <= 5) {
          temp = 10.5; // Vượt ngưỡng 15 phút (3 x 5m = 15m <= 30m -> KHÔNG vi phạm)
        } else if (i > 5) {
          temp = 5.0; // Hạ nhiệt độ lại
        }
        readings.push({
          batch_code: String(batchTarget),
          temperature: temp,
          recorded_at: time,
          sensor_id: values.sensor,
          shipment_id: Number(values.shipment) || 1,
        });
      }
      break;

    case "freezing":
      // Hạ nhiệt độ âm -2.5°C liên tục 8 mẫu (40 phút > 30m -> VI PHẠM)
      for (let i = 0; i < count; i++) {
        const time = new Date(now - (count - 1 - i) * stepMs).toISOString();
        const temp = i < 2 ? 3.0 : Number((-2.0 - Math.random()).toFixed(1));
        readings.push({
          batch_code: String(batchTarget),
          temperature: temp,
          recorded_at: time,
          sensor_id: values.sensor,
          shipment_id: Number(values.shipment) || 1,
        });
      }
      break;

    case "violation":
    default:
      // Tăng nhiệt độ lên 11.5°C - 14.5°C liên tục 8 mẫu (40 phút > 30m -> VI PHẠM BÁO ĐỘNG)
      for (let i = 0; i < count; i++) {
        const time = new Date(now - (count - 1 - i) * stepMs).toISOString();
        const temp = i < 2 ? 5.2 : Number((11.5 + (i - 2) * 0.5).toFixed(1));
        readings.push({
          batch_code: String(batchTarget),
          temperature: temp,
          recorded_at: time,
          sensor_id: values.sensor,
          shipment_id: Number(values.shipment) || 1,
        });
      }
      break;
  }

  return readings;
}

async function sendTelemetryBatch(readings) {
  const res = await fetch(values.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ readings }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gửi thất bại (HTTP ${res.status}): ${errorText}`);
  }

  return res.json();
}

async function run() {
  console.log("==================================================================");
  console.log("🚀 KHỞI ĐỘNG SIMULATOR CẢM BIẾN CHUỖI LẠNH (SPRINT 6 - T-94)");
  console.log("==================================================================");

  const batchTarget = await getTargetBatch();
  console.log(`🎯 Lô hàng mục tiêu : ${batchTarget}`);
  console.log(`📡 Mã cảm biến IoT : ${values.sensor}`);
  console.log(`🧪 Kịch bản thử nghiệm: ${values.mode.toUpperCase()}`);
  console.log(`🌐 Ingestion API   : ${values.url}`);
  console.log("------------------------------------------------------------------");

  if (values.mode === "stream") {
    console.log(`🔄 Bắt đầu stream dữ liệu thời gian thực (mỗi ${values.interval}s/mẫu)...`);
    console.log("Nhấn Ctrl + C để dừng stream.");
    let sampleIdx = 1;
    setInterval(async () => {
      // Giả lập nhiệt độ dao động ngẫu nhiên quanh 5°C
      const temp = Number((4.5 + (Math.random() * 2 - 1)).toFixed(1));
      const reading = {
        batch_code: String(batchTarget),
        temperature: temp,
        recorded_at: new Date().toISOString(),
        sensor_id: values.sensor,
        shipment_id: Number(values.shipment) || 1,
      };
      try {
        await sendTelemetryBatch([reading]);
        console.log(`[#${sampleIdx++}] ${reading.recorded_at} | 🌡️  ${temp}°C -> Đã gửi thành công`);
      } catch (err) {
        console.error(`[#${sampleIdx++}] ❌ Lỗi gửi mẫu:`, err.message);
      }
    }, Number(values.interval) * 1000);
    return;
  }

  const readings = generateScenarioReadings(values.mode, batchTarget, Number(values.count));

  console.log(`📋 Danh sách ${readings.length} mẫu telemetry chuẩn bị gửi:`);
  console.table(
    readings.map((r, idx) => ({
      STT: idx + 1,
      "Thời gian": new Date(r.recorded_at).toLocaleTimeString("vi-VN"),
      "Nhiệt độ": `${r.temperature}°C`,
      "Trạng thái": r.temperature > 8 ? "⚠️ VƯỢT NGƯỠNG" : r.temperature < 2 ? "❄️ QUÁ LẠNH" : "✅ AN TOÀN",
    })),
  );

  console.log("\n⏳ Đang đẩy dữ liệu tới Ingestion Pipeline...");
  try {
    const result = await sendTelemetryBatch(readings);
    console.log("✅ KẾT QUẢ XỬ LÝ TỪ INGESTION PIPELINE:");
    console.log(`   - Tổng số mẫu đã lưu : ${result.count}`);
    console.log(`   - Thời điểm xử lý    : ${result.processedAt}`);

    const violations = result.violationsDetected || [];
    if (violations.length > 0) {
      console.log("\n🚨 CẢNH BÁO: PHÁT HIỆN VI PHẠM CHUỖI LẠNH LIÊN TỤC!");
      for (const v of violations) {
        console.log(`   * Lô hàng      : ${v.batchCode}`);
        console.log(`   * Loại vi phạm : ${v.thresholds?.minTemp}°C - ${v.thresholds?.maxTemp}°C`);
        console.log(`   * Nhiệt độ đo  : ${v.latestTemperature}°C`);
        console.log(`   * Tổng số vi phạm: ${v.totalViolationsCount}`);
        console.log("   * Sự kiện COLD_CHAIN_VIOLATION đã được ghi vào Hash Chain bảo mật.");
      }
    } else {
      console.log("\n🛡️  CHUỖI LẠNH AN TOÀN: Không phát hiện vi phạm liên tục (>30 phút).");
    }
    console.log("==================================================================\n");
  } catch (error) {
    console.error("❌ LỖI:", error.message);
    process.exit(1);
  }
}

run();
