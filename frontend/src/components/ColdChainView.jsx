import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Thermometer,
  ThermometerSnowflake,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Truck,
  Boxes,
  RefreshCw,
  Play,
  Archive,
  Sliders,
  TrendingUp,
  TrendingDown,
  Search,
  X,
  Lock,
} from "lucide-react";
import { api } from "../api.js";
import { useToast } from "../context/ToastContext.jsx";
import { scrollToElement } from "../utils/scrollHelper.js";

/**
 * SPRINT 6: COLD CHAIN MONITORING & IOT TELEMETRY VIEW
 * Covers:
 * - T-91: Product Safe Temperature Threshold Configuration Modal
 * - T-94: Live IoT Telemetry Simulator Console with Preset Scenarios
 * - T-99: Timeline of COLD_CHAIN_VIOLATION Hash-chained Events
 * - T-101: Interactive Travel Temperature Chart with Safe Zone Band
 * - T-103: Batch Cold Chain Risk Badges & Status Filter
 * - T-104 & T-105: Historical Log Archiving & Hourly Aggregation Tool
 */

export default function ColdChainView({ user: _user, batches = [], onBatchUpdated }) {
  const { addToast } = useToast() || {};

  // Selected batch for temperature chart inspection
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id || null);
  const [historyData, setHistoryData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [overviewStats, setOverviewStats] = useState(null);

  // Products config modal state (T-91)
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [productsList, setProductsList] = useState([]);
  const [selectedProductForConfig, setSelectedProductForConfig] = useState(null);
  const [configForm, setConfigForm] = useState({
    min_temp: 2.0,
    max_temp: 8.0,
    max_allowed_delay_minutes: 30,
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Simulator state (T-94)
  const [simulating, setSimulating] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState("violation");

  // Maintenance & Archiving state (T-104 & T-105)
  const [archiving, setArchiving] = useState(false);
  const [archiveDays, setArchiveDays] = useState(30);

  // Filter & Search
  const [filterStatus, setFilterStatus] = useState("ALL"); // ALL | ALERT | SAFE
  const [searchQuery, setSearchQuery] = useState("");

  // Chart tooltip state
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // 1. Tải dữ liệu tổng quan Overview
  const loadOverview = useCallback(async () => {
    try {
      const data = await api.getColdChainOverview();
      setOverviewStats(data);
    } catch (err) {
      console.warn("Không thể tải tổng quan chuỗi lạnh:", err.message);
    }
  }, []);

  // 2. Tải danh sách sản phẩm để quản lý ngưỡng nhiệt độ (T-91)
  const loadProducts = useCallback(async () => {
    try {
      const prods = await api.getProducts();
      setProductsList(Array.isArray(prods) ? prods : []);
    } catch (err) {
      console.warn("Không thể tải danh sách sản phẩm:", err.message);
    }
  }, []);

  // 3. Tải lịch sử nhiệt độ cho lô đang chọn (T-100)
  const loadBatchHistory = useCallback(async (batchId) => {
    if (!batchId) {
      setHistoryData(null);
      return;
    }
    try {
      setLoadingHistory(true);
      const data = await api.getBatchTemperatureHistory(batchId);
      setHistoryData(data);
    } catch (err) {
      console.error("Lỗi tải lịch sử nhiệt độ:", err);
      if (addToast) {
        addToast({
          title: "Lỗi tải lịch sử",
          message: err.message || "Không thể tải biểu đồ nhiệt độ của lô này.",
          tone: "error",
        });
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadOverview();
    loadProducts();
  }, [loadOverview, loadProducts]);

  useEffect(() => {
    if (batches.length > 0 && !selectedBatchId) {
      setSelectedBatchId(batches[0].id);
    }
  }, [batches, selectedBatchId]);

  useEffect(() => {
    if (selectedBatchId) {
      loadBatchHistory(selectedBatchId);
    }
  }, [selectedBatchId, loadBatchHistory]);

  // Lọc danh sách các lô hàng
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (filterStatus === "ALERT" && !b.cold_chain_alert) return false;
      if (filterStatus === "SAFE" && b.cold_chain_alert) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const code = (b.batch_code || "").toLowerCase();
        const prod = (b.product_name || "").toLowerCase();
        const loc = (b.current_location || "").toLowerCase();
        if (!code.includes(q) && !prod.includes(q) && !loc.includes(q)) return false;
      }
      return true;
    });
  }, [batches, filterStatus, searchQuery]);

  // Mở modal cấu hình ngưỡng sản phẩm (T-91)
  const handleOpenConfigModal = (prod) => {
    setSelectedProductForConfig(prod);
    setConfigForm({
      min_temp: prod.min_temp ?? 2.0,
      max_temp: prod.max_temp ?? 8.0,
      max_allowed_delay_minutes: prod.max_allowed_delay_minutes ?? 30,
    });
    setShowConfigModal(true);
  };

  // Lưu cấu hình ngưỡng nhiệt độ (T-90)
  const handleSaveColdChainConfig = async (e) => {
    e.preventDefault();
    if (!selectedProductForConfig) return;
    if (Number(configForm.min_temp) > Number(configForm.max_temp)) {
      if (addToast) {
        addToast({
          title: "Thông số không hợp lệ",
          message: "Nhiệt độ tối thiểu không được lớn hơn nhiệt độ tối đa.",
          tone: "error",
        });
      }
      return;
    }
    try {
      setSavingConfig(true);
      await api.updateProductColdChainConfig(selectedProductForConfig.id, configForm);
      if (addToast) {
        addToast({
          title: "Đã lưu cấu hình",
          message: `Đã cập nhật dải nhiệt độ [${configForm.min_temp}°C - ${configForm.max_temp}°C] cho "${selectedProductForConfig.name}".`,
          tone: "success",
        });
      }
      setShowConfigModal(false);
      await loadProducts();
      if (selectedBatchId) await loadBatchHistory(selectedBatchId);
      if (onBatchUpdated) onBatchUpdated();
    } catch (err) {
      if (addToast) {
        addToast({
          title: "Lỗi lưu cấu hình",
          message: err.message || "Không thể cập nhật cấu hình chuỗi lạnh.",
          tone: "error",
        });
      }
    } finally {
      setSavingConfig(false);
    }
  };

  // Chạy giả lập cảm biến IoT (T-94)
  const handleRunSimulator = async () => {
    if (!selectedBatchId) return;
    try {
      setSimulating(true);
      const targetBatch = batches.find((b) => b.id === selectedBatchId);
      const now = Date.now();
      const stepMs = 5 * 60 * 1000;
      let sampleTemps = [];

      if (selectedScenario === "normal") {
        sampleTemps = [4.2, 4.8, 5.0, 4.5, 4.9, 5.2, 4.7, 4.4];
      } else if (selectedScenario === "intermittent") {
        // Vượt ngưỡng 15 phút (3 mẫu) rồi hạ lại
        sampleTemps = [4.5, 5.0, 10.2, 11.0, 10.5, 4.8, 4.6, 4.5];
      } else if (selectedScenario === "freezing") {
        // Lạnh âm độ liên tục 40 phút (>30m)
        sampleTemps = [3.5, 1.0, -2.5, -3.0, -2.8, -3.2, -2.9, -3.5];
      } else {
        // Vi phạm nóng liên tục 40 phút (>30m)
        sampleTemps = [5.5, 6.0, 11.5, 12.8, 13.5, 14.0, 14.5, 15.0];
      }

      const readings = sampleTemps.map((temp, idx) => ({
        batch_id: selectedBatchId,
        batch_code: targetBatch?.batch_code,
        temperature: temp,
        recorded_at: new Date(now - (sampleTemps.length - 1 - idx) * stepMs).toISOString(),
        sensor_id: "SIMULATOR-TRUCK-01",
        shipment_id: 1,
      }));

      const res = await api.sendTemperatureTelemetry({ readings });

      if (addToast) {
        if (res.violationsDetected && res.violationsDetected.length > 0) {
          addToast({
            title: "🚨 Phát hiện Vi phạm Chuỗi lạnh!",
            message: `Nhiệt độ đã vượt ngưỡng liên tục quá 30 phút. Sự kiện vi phạm đã được ghi vào Hash Chain bảo mật!`,
            tone: "error",
          });
        } else {
          addToast({
            title: "Đã bơm dữ liệu cảm biến",
            message: `Đã ghi nhận ${readings.length} mẫu nhiệt độ cho lô ${targetBatch?.batch_code}. Dữ liệu an toàn.`,
            tone: "success",
          });
        }
      }

      await loadBatchHistory(selectedBatchId);
      await loadOverview();
      if (onBatchUpdated) onBatchUpdated();
      scrollToElement("batch-temperature-chart-card", { block: "center", highlight: true });
    } catch (err) {
      if (addToast) {
        addToast({
          title: "Lỗi giả lập IoT",
          message: err.message || "Không thể bơm dữ liệu telemetry.",
          tone: "error",
        });
      }
    } finally {
      setSimulating(false);
    }
  };

  // Nén và Archive dữ liệu cũ (T-104 & T-105)
  const handleArchiveOldLogs = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn nén và chuyển toàn bộ log nhiệt độ cũ hơn ${archiveDays} ngày sang kho lưu trữ lịch sử?`)) {
      return;
    }
    try {
      setArchiving(true);
      const res = await api.archiveColdChainLogs(archiveDays);
      if (addToast) {
        addToast({
          title: "Nén & Archive hoàn tất",
          message: res.message || `Đã chuyển các log cũ sang bảng lưu trữ an toàn.`,
          tone: "success",
        });
      }
      await loadOverview();
      if (selectedBatchId) await loadBatchHistory(selectedBatchId);
    } catch (err) {
      if (addToast) {
        addToast({
          title: "Lỗi bảo trì dữ liệu",
          message: err.message || "Không thể thực hiện nén log.",
          tone: "error",
        });
      }
    } finally {
      setArchiving(false);
    }
  };

  // Tính toán dữ liệu SVG Chart (T-101)
  const chartProps = useMemo(() => {
    if (!historyData || !historyData.logs || historyData.logs.length === 0) return null;

    const logs = historyData.logs;
    const minConfig = historyData.config.minTemp ?? 2.0;
    const maxConfig = historyData.config.maxTemp ?? 8.0;

    const temps = logs.map((l) => l.temperature);
    const minRecorded = Math.min(...temps, minConfig - 2);
    const maxRecorded = Math.max(...temps, maxConfig + 2);

    // Padding cho dải nhiệt độ trục tung Y
    const yMin = Math.floor(Math.min(minRecorded, minConfig - 1));
    const yMax = Math.ceil(Math.max(maxRecorded, maxConfig + 1));
    const yRange = yMax - yMin || 1;

    const width = 800;
    const height = 320;
    const padLeft = 55;
    const padRight = 35;
    const padTop = 30;
    const padBottom = 45;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // Hàm chuyển đổi tọa độ
    const getX = (index) => {
      if (logs.length <= 1) return padLeft + plotW / 2;
      return padLeft + (index / (logs.length - 1)) * plotW;
    };

    const getY = (temp) => {
      return padTop + plotH - ((temp - yMin) / yRange) * plotH;
    };

    // Tọa độ dải an toàn (Safe Zone Rectangle)
    const safeZoneTop = getY(maxConfig);
    const safeZoneBottom = getY(minConfig);
    const safeZoneHeight = Math.max(2, safeZoneBottom - safeZoneTop);

    // Tọa độ đường polyline
    const points = logs.map((l, idx) => `${getX(idx).toFixed(1)},${getY(l.temperature).toFixed(1)}`).join(" ");

    return {
      width,
      height,
      padLeft,
      padTop,
      plotW,
      plotH,
      yMin,
      yMax,
      minConfig,
      maxConfig,
      safeZoneTop,
      safeZoneHeight,
      points,
      logsWithCoords: logs.map((l, idx) => ({
        ...l,
        x: getX(idx),
        y: getY(l.temperature),
      })),
      getX,
      getY,
    };
  }, [historyData]);

  const selectedBatchObj = batches.find((b) => b.id === selectedBatchId);

  return (
    <div className="space-y-6">
      {/* ─── HEADER: TITLE & TOP ACTIONS ────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-600 via-teal-600 to-emerald-500 text-white shadow-lg shadow-teal-500/20 ring-1 ring-white/20">
              <ThermometerSnowflake size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Giám Sát Chuỗi Lạnh IoT
                <span className="rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 px-2 py-0.5 text-[11px] font-extrabold uppercase">
                  Sprint 6
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Phát hiện vi phạm độ trễ liên tục &gt;30 phút · Ghi nhận Hash Chain bất biến · Biểu đồ hành trình
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Nút Cấu hình ngưỡng sản phẩm (T-91) */}
          <button
            type="button"
            id="btn-open-cold-chain-config"
            onClick={() => {
              if (productsList.length > 0) {
                handleOpenConfigModal(productsList[0]);
              } else {
                setShowConfigModal(true);
              }
            }}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs transition-colors cursor-pointer"
          >
            <Sliders size={14} className="text-teal-600" />
            <span>Cấu hình Ngưỡng Sản Phẩm</span>
          </button>

          {/* Nút Bảo trì Nén & Archive log cũ (T-104 & T-105) */}
          <div className="flex items-center gap-1">
            <select
              value={archiveDays}
              onChange={(e) => setArchiveDays(Number(e.target.value))}
              className="text-xs rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 px-2 py-2 font-bold text-purple-700 dark:text-purple-300"
              title="Khoảng thời gian lưu trữ trước khi nén"
            >
              <option value={30}>&gt; 30 ngày</option>
              <option value={60}>&gt; 60 ngày</option>
              <option value={90}>&gt; 90 ngày</option>
            </select>
            <button
              type="button"
              id="btn-archive-cold-chain-logs"
              onClick={handleArchiveOldLogs}
              disabled={archiving}
              className="flex items-center gap-1.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 px-3.5 py-2 text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Archive size={14} />
              <span>{archiving ? "Đang nén..." : "Nén & Archive"}</span>
            </button>
          </div>

          {/* Nút Làm mới */}
          <button
            type="button"
            onClick={() => {
              loadOverview();
              if (selectedBatchId) loadBatchHistory(selectedBatchId);
              if (onBatchUpdated) onBatchUpdated();
            }}
            className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Tải lại dữ liệu"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ─── 4 THẺ THỐNG KÊ OVERVIEW CARDS ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Tổng số lô giám sát */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
            <span>Tổng số lô giám sát</span>
            <Boxes size={16} className="text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {overviewStats?.totalBatches ?? batches.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Tất cả lô đang lưu thông</div>
        </div>

        {/* 2. Lô an toàn chuỗi lạnh */}
        <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 shadow-xs">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 text-xs font-semibold mb-1">
            <span>Chuỗi lạnh an toàn</span>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
            {overviewStats?.compliantBatches ?? batches.filter((b) => !b.cold_chain_alert).length}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
            Duy trì đúng dải nhiệt độ
          </div>
        </div>

        {/* 3. Lô vi phạm chuỗi lạnh (T-103) */}
        <div className="rounded-2xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 p-4 shadow-xs">
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-300 text-xs font-semibold mb-1">
            <span>Vi phạm chuỗi lạnh</span>
            <AlertTriangle size={16} className="text-rose-600 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-rose-700 dark:text-rose-400">
            {overviewStats?.alertBatches ?? batches.filter((b) => b.cold_chain_alert).length}
          </div>
          <div className="mt-1 text-[11px] text-rose-600/80 dark:text-rose-400/80 font-medium">
            Vượt ngưỡng liên tục &gt;30m
          </div>
        </div>

        {/* 4. Tổng số log cảm biến ghi nhận */}
        <div className="rounded-2xl border border-cyan-200/80 dark:border-cyan-900/50 bg-cyan-50/40 dark:bg-cyan-950/20 p-4 shadow-xs">
          <div className="flex items-center justify-between text-cyan-700 dark:text-cyan-300 text-xs font-semibold mb-1">
            <span>Dữ liệu Telemetry</span>
            <Activity size={16} className="text-cyan-600" />
          </div>
          <div className="text-2xl font-black text-cyan-700 dark:text-cyan-400">
            {overviewStats?.totalLogs ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-cyan-600/80 dark:text-cyan-400/80">
            Mẫu đo IoT từ xe lạnh
          </div>
        </div>
      </div>

      {/* ─── KHUNG CHÍNH: BẢNG LÔ HÀNG (TRÁI) & BIỂU ĐỒ HÀNH TRÌNH (PHẢI) ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI (5 CỘT): DANH SÁCH LÔ HÀNG & BỘ LỌC RỦI RO CHUỖI LẠNH (T-103) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Truck size={16} className="text-teal-600" />
              <span>Danh Sách Lô Hàng Vận Chuyển</span>
            </h2>
            <span className="text-xs text-slate-400 font-medium">
              {filteredBatches.length}/{batches.length} lô
            </span>
          </div>

          {/* Ô tìm kiếm & Bộ lọc trạng thái */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã lô, tên sản phẩm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-300"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ALERT">🚨 Đang vi phạm</option>
              <option value="SAFE">✅ Chuỗi lạnh an toàn</option>
            </select>
          </div>

          {/* Danh sách cuộn các lô */}
          <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1">
            {filteredBatches.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 italic">
                Không tìm thấy lô hàng nào phù hợp bộ lọc.
              </div>
            ) : (
              filteredBatches.map((b) => {
                const isSelected = b.id === selectedBatchId;
                const isViolating = Boolean(b.cold_chain_alert);
                return (
                  <div
                    key={b.id}
                    id={`cold-chain-batch-item-${b.id}`}
                    onClick={() => setSelectedBatchId(b.id)}
                    className={`group p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-teal-500 bg-teal-50/40 dark:bg-teal-950/30 shadow-xs"
                        : "border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-300 hover:bg-slate-50/60 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
                            {b.batch_code}
                          </span>
                          {/* T-103: UI Badge Cảnh báo nguy cơ chuỗi lạnh */}
                          {isViolating ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800 px-2 py-0.5 text-[10px] font-black animate-pulse">
                              <AlertTriangle size={10} />
                              Vi phạm chuỗi lạnh
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                              <CheckCircle2 size={10} />
                              An toàn
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 truncate">
                          {b.product_name} · {b.current_location || "Đang trên xe lạnh"}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`font-mono text-xs font-extrabold ${
                            isViolating ? "text-rose-600" : "text-emerald-600"
                          }`}
                        >
                          {b.temperature_c !== null && b.temperature_c !== undefined
                            ? `${b.temperature_c}°C`
                            : "--"}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Nhiệt độ hiện tại</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* CỘT PHẢI (7 CỘT): BIỂU ĐỒ HÀNH TRÌNH NHIỆT ĐỘ (T-101) & BỘ GIẢ LẬP IOT (T-94) */}
        <div className="lg:col-span-7 space-y-6">
          {/* CARD BIỂU ĐỒ HÀNH TRÌNH (T-101) */}
          <div
            id="batch-temperature-chart-card"
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-black text-slate-900 dark:text-white">
                    Biểu Đồ Hành Trình Nhiệt Độ
                  </span>
                  {selectedBatchObj && (
                    <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 px-2 py-0.5 rounded-md">
                      {selectedBatchObj.batch_code}
                    </span>
                  )}
                </div>
                {historyData && (
                  <p className="text-xs text-slate-500 mt-1">
                    Dải an toàn cấu hình:{" "}
                    <strong className="text-emerald-600 font-semibold">
                      {historyData.config.minTemp}°C - {historyData.config.maxTemp}°C
                    </strong>{" "}
                    (Cho phép vượt liên tục tối đa: {historyData.config.maxAllowedDelayMinutes} phút)
                  </p>
                )}
              </div>

              {/* Tóm tắt nhanh min / max / avg */}
              {historyData?.stats && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-1 text-slate-600 dark:text-slate-300">
                    Min: <strong>{historyData.stats.minRecorded ?? "--"}°C</strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-1 text-slate-600 dark:text-slate-300">
                    Max: <strong>{historyData.stats.maxRecorded ?? "--"}°C</strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-1 text-slate-600 dark:text-slate-300">
                    Avg: <strong>{historyData.stats.avgRecorded ?? "--"}°C</strong>
                  </div>
                </div>
              )}
            </div>

            {/* VÙNG VẼ SVG CHART (T-101) */}
            <div className="mt-4 relative">
              {loadingHistory ? (
                <div className="flex items-center justify-center h-64 text-xs text-slate-400 italic">
                  <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải biểu đồ hành trình...
                </div>
              ) : !chartProps || chartProps.logsWithCoords.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6">
                  <Thermometer size={32} className="text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    Chưa có chuỗi log nhiệt độ nào cho lô này
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Hãy sử dụng bộ giả lập cảm biến IoT bên dưới để bơm mẫu thử nghiệm.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${chartProps.width} ${chartProps.height}`}
                    className="w-full h-auto max-h-[340px] select-none"
                  >
                    <defs>
                      <linearGradient id="safeZoneGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.08" />
                      </linearGradient>
                      <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0284c7" />
                        <stop offset="50%" stopColor="#0d9488" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                    </defs>

                    {/* Vùng phân dải an toàn (Safe Zone Band) */}
                    <rect
                      x={chartProps.padLeft}
                      y={chartProps.safeZoneTop}
                      width={chartProps.plotW}
                      height={chartProps.safeZoneHeight}
                      fill="url(#safeZoneGradient)"
                      stroke="#10b981"
                      strokeWidth="1"
                      strokeDasharray="4 2"
                      opacity="0.9"
                    />

                    {/* Nhãn ngưỡng nhiệt độ an toàn */}
                    <text
                      x={chartProps.padLeft + 8}
                      y={chartProps.safeZoneTop + 14}
                      fill="#059669"
                      fontSize="10"
                      fontWeight="bold"
                    >
                      Ngưỡng tối đa ({chartProps.maxConfig}°C)
                    </text>
                    <text
                      x={chartProps.padLeft + 8}
                      y={chartProps.safeZoneTop + chartProps.safeZoneHeight - 6}
                      fill="#059669"
                      fontSize="10"
                      fontWeight="bold"
                    >
                      Ngưỡng tối thiểu ({chartProps.minConfig}°C)
                    </text>

                    {/* Lưới tọa độ ngang (Y grid lines) */}
                    {[chartProps.yMin, Math.round((chartProps.yMin + chartProps.yMax) / 2), chartProps.yMax].map(
                      (val) => {
                        const y = chartProps.getY(val);
                        return (
                          <g key={`grid-y-${val}`}>
                            <line
                              x1={chartProps.padLeft}
                              y1={y}
                              x2={chartProps.padLeft + chartProps.plotW}
                              y2={y}
                              stroke="#e2e8f0"
                              strokeWidth="0.8"
                              strokeDasharray="2 2"
                            />
                            <text
                              x={chartProps.padLeft - 8}
                              y={y + 3.5}
                              textAnchor="end"
                              fill="#94a3b8"
                              fontSize="10"
                              fontFamily="monospace"
                            >
                              {val}°C
                            </text>
                          </g>
                        );
                      },
                    )}

                    {/* Đường nối nhiệt độ mượt mà */}
                    <polyline
                      fill="none"
                      stroke="url(#lineGradient)"
                      strokeWidth="2.5"
                      points={chartProps.points}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Các điểm đo nhiệt độ (Dots) */}
                    {chartProps.logsWithCoords.map((pt, idx) => {
                      const isHovered = hoveredPoint?.id === pt.id;
                      return (
                        <circle
                          key={`dot-${pt.id || idx}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 6 : pt.isOutOfRange ? 4.5 : 3.5}
                          fill={pt.isOutOfRange ? "#ef4444" : "#0d9488"}
                          stroke="#ffffff"
                          strokeWidth={isHovered ? 2.5 : 1.5}
                          className="transition-all cursor-pointer"
                          onMouseEnter={() => setHoveredPoint(pt)}
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                      );
                    })}

                    {/* Nhãn trục thời gian (X axis labels) */}
                    {chartProps.logsWithCoords.length > 0 && (
                      <>
                        <text
                          x={chartProps.padLeft}
                          y={chartProps.height - 12}
                          fill="#64748b"
                          fontSize="10"
                          textAnchor="start"
                        >
                          {new Date(chartProps.logsWithCoords[0].recordedAt).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </text>
                        {chartProps.logsWithCoords.length > 2 && (
                          <text
                            x={chartProps.padLeft + chartProps.plotW / 2}
                            y={chartProps.height - 12}
                            fill="#64748b"
                            fontSize="10"
                            textAnchor="middle"
                          >
                            Hành trình vận chuyển
                          </text>
                        )}
                        <text
                          x={chartProps.padLeft + chartProps.plotW}
                          y={chartProps.height - 12}
                          fill="#64748b"
                          fontSize="10"
                          textAnchor="end"
                        >
                          {new Date(
                            chartProps.logsWithCoords[chartProps.logsWithCoords.length - 1].recordedAt,
                          ).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </text>
                      </>
                    )}
                  </svg>

                  {/* Tooltip khi rê chuột vào điểm đo */}
                  {hoveredPoint && (
                    <div
                      className="absolute z-20 pointer-events-none rounded-xl bg-slate-900/90 backdrop-blur-md text-white p-2.5 text-xs shadow-xl ring-1 ring-white/10"
                      style={{
                        left: `${Math.min(chartProps.width - 150, Math.max(20, hoveredPoint.x - 60))}px`,
                        top: `${Math.max(10, hoveredPoint.y - 65)}px`,
                      }}
                    >
                      <div className="font-extrabold text-teal-300">
                        Nhiệt độ: {hoveredPoint.temperature}°C
                      </div>
                      <div className="text-[11px] text-slate-300">
                        {new Date(hoveredPoint.recordedAt).toLocaleString("vi-VN")}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Cảm biến: {hoveredPoint.sensorId} · {hoveredPoint.isOutOfRange ? "⚠️ Vượt ngưỡng" : "✅ An toàn"}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chú giải biểu đồ */}
            <div className="mt-3 flex items-center justify-center gap-5 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-teal-600 inline-block" />
                <span>Trong dải an toàn</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-rose-500 inline-block" />
                <span>Vượt ngưỡng an toàn</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-5 bg-emerald-500/20 border border-emerald-500 border-dashed inline-block" />
                <span>Phân vùng an toàn cấu hình</span>
              </span>
            </div>
          </div>

          {/* CARD DÒNG THỜI GIAN SỰ KIỆN VI PHẠM HASH CHAIN (T-99) */}
          {historyData?.violationEvents && historyData.violationEvents.length > 0 && (
            <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/20 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-rose-100 dark:border-rose-900/40">
                <h3 className="text-sm font-black text-rose-900 dark:text-rose-200 flex items-center gap-2">
                  <AlertTriangle size={17} className="text-rose-600" />
                  <span>Dòng Thời Gian Vi Phạm Chuỗi Lạnh (Hash Chain)</span>
                </h3>
                <span className="rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 px-2.5 py-0.5 text-xs font-black">
                  {historyData.violationEvents.length} vi phạm
                </span>
              </div>

              <div className="space-y-3">
                {historyData.violationEvents.map((evt) => {
                  const d = evt.data || {};
                  return (
                    <div
                      key={evt.id}
                      className="rounded-xl border border-rose-200/80 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-4 shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <span className="font-extrabold text-rose-700 dark:text-rose-400 text-xs flex items-center gap-1.5">
                          <span>🚨 SỰ KIỆN COLD_CHAIN_VIOLATION</span>
                          <span className="rounded bg-rose-50 dark:bg-rose-950 px-1.5 py-0.2 text-[10px] text-rose-600">
                            ID: {evt.id}
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(evt.timestamp).toLocaleString("vi-VN")}
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <strong>Nhiệt độ đỉnh (Peak):</strong>{" "}
                          <span className="text-rose-600 font-bold">{d.peak_temperature_c ?? "--"}°C</span>
                        </div>
                        <div>
                          <strong>Thời gian vi phạm liên tục:</strong>{" "}
                          <span className="font-bold">{d.duration_minutes ?? "--"} phút</span>{" "}
                          (cho phép: {d.allowed_delay_minutes ?? 30} phút)
                        </div>
                        <div>
                          <strong>Ngưỡng vi phạm:</strong> [{d.threshold_min ?? 2}°C - {d.threshold_max ?? 8}°C]
                        </div>
                        <div>
                          <strong>Cảm biến ghi nhận:</strong> {d.sensor_id || "SENSOR-IoT"}
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-[10px] font-mono text-slate-400 truncate">
                        <Lock size={11} className="text-slate-400 shrink-0" />
                        <span className="shrink-0 font-sans font-medium text-slate-500">Mã băm SHA-256:</span>
                        <span className="truncate" title={evt.currentHash}>
                          {evt.currentHash}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CARD BỘ GIẢ LẬP CẢM BIẾN IOT (T-94) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                  <Play size={14} />
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Bộ Giả Lập Cảm Biến IoT Telemetry (T-94)
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">Thử nghiệm kịch bản</span>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Chọn kịch bản nhiệt độ để bơm dữ liệu telemetry qua Public Ingestion API và quan sát thuật toán phát hiện vi phạm theo độ trễ.
            </p>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  id: "normal",
                  title: "Kịch bản Chuẩn (An toàn)",
                  desc: "Dải nhiệt độ 4.2°C - 5.2°C, chuỗi lạnh bảo đảm 100%.",
                  icon: TrendingUp,
                  color: "border-emerald-200 hover:border-emerald-400 bg-emerald-50/20",
                },
                {
                  id: "intermittent",
                  title: "Kịch bản Vượt Ngắt Quãng",
                  desc: "Tăng 10.5°C trong 15 phút (< 30 phút). Không kích hoạt báo động.",
                  icon: Activity,
                  color: "border-amber-200 hover:border-amber-400 bg-amber-50/20",
                },
                {
                  id: "violation",
                  title: "Kịch bản Vi Phạm Nóng (>30m)",
                  desc: "Vượt 11.5°C - 15°C liên tục 40 phút. BÁO ĐỘNG & Ghi Hash Chain.",
                  icon: AlertTriangle,
                  color: "border-rose-200 hover:border-rose-400 bg-rose-50/20",
                },
                {
                  id: "freezing",
                  title: "Kịch bản Đóng Băng Âm Độ",
                  desc: "Nhiệt độ hạ -3.0°C liên tục 40 phút. BÁO ĐỘNG quá lạnh.",
                  icon: TrendingDown,
                  color: "border-cyan-200 hover:border-cyan-400 bg-cyan-50/20",
                },
              ].map((sc) => {
                const isChosen = selectedScenario === sc.id;
                const Icon = sc.icon;
                return (
                  <div
                    key={sc.id}
                    onClick={() => setSelectedScenario(sc.id)}
                    className={`p-3 rounded-xl border transition cursor-pointer ${
                      isChosen
                        ? "border-teal-500 bg-teal-50/60 dark:bg-teal-950/40 ring-1 ring-teal-500"
                        : `${sc.color} dark:bg-slate-800/40`
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-white">
                      <Icon size={14} className={isChosen ? "text-teal-600" : "text-slate-500"} />
                      <span>{sc.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{sc.desc}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                id="btn-run-iot-simulator"
                onClick={handleRunSimulator}
                disabled={simulating || !selectedBatchId}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:from-teal-700 hover:to-emerald-700 transition disabled:opacity-50 cursor-pointer"
              >
                <Play size={14} />
                <span>
                  {simulating
                    ? "Đang truyền Telemetry..."
                    : `Bơm Telemetry cho Lô "${selectedBatchObj?.batch_code || "..."}"`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── MODAL: CẤU HÌNH DẢI NHIỆT ĐỘ AN TOÀN THEO SẢN PHẨM (T-91) ──────────── */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                  <Sliders size={16} />
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Cấu Hình Ngưỡng Chuỗi Lạnh Sản Phẩm (T-91)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveColdChainConfig} className="mt-4 space-y-4">
              {/* Chọn sản phẩm */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn sản phẩm nông sản
                </label>
                <select
                  value={selectedProductForConfig?.id || ""}
                  onChange={(e) => {
                    const prod = productsList.find((p) => String(p.id) === e.target.value);
                    if (prod) handleOpenConfigModal(prod);
                  }}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs font-medium text-slate-900 dark:text-white"
                >
                  {productsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Đơn vị: {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Dải nhiệt độ an toàn: min_temp và max_temp */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nhiệt độ tối thiểu (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={configForm.min_temp}
                    onChange={(e) => setConfigForm({ ...configForm, min_temp: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs font-mono text-slate-900 dark:text-white"
                    placeholder="VD: 2.0"
                    required
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Ngưỡng đóng băng/quá lạnh</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nhiệt độ tối đa (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={configForm.max_temp}
                    onChange={(e) => setConfigForm({ ...configForm, max_temp: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs font-mono text-slate-900 dark:text-white"
                    placeholder="VD: 8.0"
                    required
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Ngưỡng nóng/hỏng hàng</p>
                </div>
              </div>

              {/* Thời gian cho phép vượt ngưỡng liên tục (max_allowed_delay_minutes) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Thời gian trễ cho phép liên tục (phút)
                </label>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={configForm.max_allowed_delay_minutes}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, max_allowed_delay_minutes: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs font-mono text-slate-900 dark:text-white"
                  placeholder="Mặc định: 30 phút"
                  required
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Nếu vượt dải an toàn liên tục quá số phút này, hệ thống sẽ tự động kích hoạt Báo động vi phạm và ghi nhận vào Hash Chain.
                </p>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:from-teal-700 hover:to-emerald-700 transition disabled:opacity-50 cursor-pointer"
                >
                  {savingConfig ? "Đang lưu..." : "Lưu Cấu Hình"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
