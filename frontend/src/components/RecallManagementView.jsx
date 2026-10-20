import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Siren,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Search,
  RefreshCw,
  Building2,
  MapPin,
  Lock,
  Boxes,
  Radio,
  Layers,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { api } from "../api.js";
import { useToast } from "../context/ToastContext.jsx";
import { scrollToElement } from "../utils/scrollHelper.js";
import * as XLSX from "xlsx";

export default function RecallManagementView({ user, batches = [], onBatchUpdated }) {
  const { addToast } = useToast() || {};

  // State quản lý danh sách lệnh thu hồi
  const [recalls, setRecalls] = useState([]);
  const [selectedRecallId, setSelectedRecallId] = useState(null);
  const [affectedData, setAffectedData] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);

  // Bộ lọc bảng lô bị ảnh hưởng
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL | PENDING | QUARANTINED
  const [orgFilter, setOrgFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [quarantineTarget, setQuarantineTarget] = useState(null); // Lô được chọn để niêm phong

  // 1. Tải danh sách các lệnh thu hồi
  const loadRecalls = useCallback(async (autoSelectFirst = false) => {
    try {
      setLoadingList(true);
      const res = await api.getRecallsV1();
      const list = Array.isArray(res) ? res : res?.recalls || [];
      setRecalls(list);

      if (list.length > 0) {
        if (autoSelectFirst || !selectedRecallId) {
          setSelectedRecallId(list[0].id);
        }
      } else {
        setSelectedRecallId(null);
        setAffectedData(null);
      }
    } catch (err) {
      console.error("Lỗi tải danh sách thu hồi:", err);
      if (addToast) {
        addToast({
          title: "Lỗi tải dữ liệu",
          message: err.message || "Không thể tải danh sách lệnh thu hồi.",
          tone: "error",
        });
      }
    } finally {
      setLoadingList(false);
    }
  }, [selectedRecallId, addToast]);

  // 2. Tải chi tiết các lô bị ảnh hưởng của lệnh thu hồi đang chọn
  const loadAffectedBatches = useCallback(async (recallId) => {
    if (!recallId) return;
    try {
      setLoadingDetail(true);
      const res = await api.getRecallAffectedBatches(recallId);
      setAffectedData(res);
    } catch (err) {
      console.error("Lỗi tải chi tiết lô bị ảnh hưởng:", err);
      if (addToast) {
        addToast({
          title: "Lỗi",
          message: err.message || "Không thể tải chi tiết lô bị ảnh hưởng.",
          tone: "error",
        });
      }
    } finally {
      setLoadingDetail(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadRecalls(true);
  }, []);

  useEffect(() => {
    if (selectedRecallId) {
      loadAffectedBatches(selectedRecallId);
    }
  }, [selectedRecallId, loadAffectedBatches]);

  // 3. T-83: Real-time SSE Handler
  useEffect(() => {
    let eventSource;
    try {
      const streamUrl = "/api/v1/recalls/stream";
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setSseConnected(true);
      };

      const handleSseMessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const isRecall = payload.type === "RECALL_INITIATED" || event.type === "recall_created";
          const isQuarantine = payload.type === "RECALL_CONFIRMED" || event.type === "batch_quarantined";

          if (isRecall) {
            // Có lệnh thu hồi mới
            loadRecalls();
            if (addToast) {
              const code = payload.recallCode || payload.recall_code || "";
              addToast({
                title: "LỆNH THU HỒI MỚI",
                message: code ? `Lệnh ${code} vừa được kích hoạt!` : (payload.message || "Có lệnh thu hồi mới được kích hoạt!"),
                tone: "error",
              });
            }
          } else if (isQuarantine) {
            // Có một lô vừa được niêm phong cách ly
            if (selectedRecallId) {
              loadAffectedBatches(selectedRecallId);
            }
            loadRecalls();
            if (addToast) {
              const bCode = payload.batchCode || payload.batch_code || "";
              const qLoc = payload.quarantineLocation || payload.quarantine_location || "khu vực cách ly";
              addToast({
                title: "NIÊM PHONG LÔ THÀNH CÔNG",
                message: bCode ? `Lô ${bCode} đã được niêm phong tại ${qLoc}.` : (payload.message || "Lô hàng đã được niêm phong cách ly."),
                tone: "success",
              });
            }
          }
        } catch (e) {
          console.error("Lỗi phân tích SSE payload:", e);
        }
      };

      eventSource.onmessage = handleSseMessage;
      eventSource.addEventListener("recall_created", handleSseMessage);
      eventSource.addEventListener("batch_quarantined", handleSseMessage);

      eventSource.onerror = () => {
        setSseConnected(false);
      };
    } catch (err) {
      console.warn("SSE connection error:", err);
      setSseConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [selectedRecallId, loadRecalls, loadAffectedBatches, addToast]);

  // 4. Lọc danh sách lô bị ảnh hưởng (T-77)
  const allBatches = useMemo(() => {
    const list = affectedData?.batches || affectedData?.items || affectedData?.allItemsForStats || [];
    return Array.isArray(list) ? list : [];
  }, [affectedData]);

  const filteredBatches = useMemo(() => {
    return allBatches.filter((b) => {
      // Lọc trạng thái
      if (statusFilter === "PENDING" && b.quarantine_status === "QUARANTINED") return false;
      if (statusFilter === "QUARANTINED" && b.quarantine_status !== "QUARANTINED") return false;

      // Lọc tổ chức
      if (orgFilter !== "ALL" && String(b.organization_id) !== String(orgFilter)) return false;

      // Lọc từ khóa tìm kiếm
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const code = (b.batch_code || "").toLowerCase();
        const prod = (b.product_name || "").toLowerCase();
        const loc = (b.current_location || "").toLowerCase();
        const org = (b.organization_name || "").toLowerCase();
        if (!code.includes(q) && !prod.includes(q) && !loc.includes(q) && !org.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [allBatches, statusFilter, orgFilter, searchQuery]);

  // Danh sách tổ chức duy nhất để đưa vào dropdown filter
  const uniqueOrgs = useMemo(() => {
    const map = new Map();
    for (const b of allBatches) {
      if (b.organization_id && !map.has(b.organization_id)) {
        map.set(b.organization_id, b.organization_name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allBatches]);

  // 5. Xuất báo cáo Excel (.xlsx) chuẩn chỉnh từng cột
  const handleExportExcel = async () => {
    if (!selectedRecallId) return;
    try {
      const recall = affectedData?.recall;
      const allItems = affectedData?.allItemsForStats || allBatches || [];
      const recallCode = recall?.recall_code || `RECALL-${selectedRecallId}`;

      const wb = XLSX.utils.book_new();
      const wsData = [
        [`BÁO CÁO THU HỒI LÔ HÀNG NÔNG SẢN - LỆNH: ${recallCode}`],
        [`Lô gốc: ${recall?.root_batch_code || "N/A"} - Sản phẩm: ${recall?.root_product_name || "N/A"}`],
        [`Lý do: ${recall?.reason || "Không rõ"}`],
        [`Thời gian phát lệnh: ${recall?.created_at ? new Date(recall.created_at).toLocaleString("vi-VN") : "N/A"}`],
        [], // Dòng trống cách biệt tiêu đề và bảng dữ liệu
        [
          "STT",
          "Mã Lô Hàng",
          "Tên Sản Phẩm",
          "Đơn Vị Tính",
          "Tổ Chức Quản Lý",
          "Loại Tổ Chức",
          "Vị Trí Hiện Tại",
          "Khối Lượng Còn (kg)",
          "Đã Bán/Tiêu Thụ (kg)",
          "Lô Pha Trộn (Blended)",
          "Trạng Thái Niêm Phong",
          "Vị Trí Cách Ly",
          "Thời Gian Niêm Phong",
          "Người Niêm Phong",
        ],
      ];

      allItems.forEach((item, index) => {
        const isQuarantined = item.quarantine_status === "QUARANTINED" ? "Đã niêm phong" : "Chưa niêm phong";
        const isBlended = item.is_blended ? "Có (Lô gộp)" : "Không";
        wsData.push([
          index + 1,
          item.batch_code || "",
          item.product_name || "",
          item.product_unit || "kg",
          item.organization_name || "",
          item.organization_type || "",
          item.current_location || "",
          Number(item.remaining_quantity || 0),
          Number(item.consumed_quantity || 0),
          isBlended,
          isQuarantined,
          item.quarantine_location || "",
          item.quarantined_at ? new Date(item.quarantined_at).toLocaleString("vi-VN") : "",
          item.quarantined_by_name || "",
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      // Căn chỉnh độ rộng từng cột rộng rãi, chuyên nghiệp, không bao giờ bị tràn cột hoặc che khuất
      ws["!cols"] = [
        { wch: 6 },  // STT
        { wch: 26 }, // Mã Lô Hàng
        { wch: 22 }, // Tên Sản Phẩm
        { wch: 14 }, // Đơn Vị Tính
        { wch: 28 }, // Tổ Chức Quản Lý
        { wch: 18 }, // Loại Tổ Chức
        { wch: 28 }, // Vị Trí Hiện Tại
        { wch: 20 }, // Khối Lượng Còn (kg)
        { wch: 20 }, // Đã Bán/Tiêu Thụ (kg)
        { wch: 24 }, // Lô Pha Trộn (Blended)
        { wch: 24 }, // Trạng Thái Niêm Phong
        { wch: 32 }, // Vị Trí Cách Ly
        { wch: 24 }, // Thời Gian Niêm Phong
        { wch: 22 }, // Người Niêm Phong
      ];

      XLSX.utils.book_append_sheet(wb, ws, "BaoCaoThuHoi");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bao_Cao_Thu_Hoi_${recallCode}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      if (addToast) {
        addToast({
          title: "Xuất file thành công",
          message: "Báo cáo kiểm toán thu hồi đã được tải xuống dưới dạng Excel (.xlsx).",
          tone: "success",
        });
      }
    } catch (err) {
      if (addToast) {
        addToast({
          title: "Lỗi xuất file",
          message: err.message || "Không thể tải báo cáo Excel.",
          tone: "error",
        });
      }
    }
  };

  const currentRecall = affectedData?.recall;
  const rawSummary = affectedData?.summary || {};
  const summary = {
    quarantineProgressPercent: rawSummary.quarantineProgressPercent ?? rawSummary.quarantine_rate ?? 0,
    quarantinedBatches: rawSummary.quarantinedBatches ?? rawSummary.quarantined_batches ?? 0,
    totalBatches: rawSummary.totalBatches ?? rawSummary.total_batches ?? allBatches.length,
    quarantineWeightPercent: rawSummary.quarantineWeightPercent ?? rawSummary.weight_quarantine_rate ?? 0,
    quarantinedRemainingKg: rawSummary.quarantinedRemainingKg ?? rawSummary.quarantined_quantity ?? 0,
    totalRemainingKg: rawSummary.totalRemainingKg ?? rawSummary.total_remaining_quantity ?? 0,
    blendedBatchesCount: rawSummary.blendedBatchesCount ?? rawSummary.blended_batches_count ?? allBatches.filter((b) => b.is_blended).length,
    totalConsumedKg: rawSummary.totalConsumedKg ?? rawSummary.total_consumed_quantity ?? 0,
  };

  return (
    <div className="space-y-6">
      {/* ─── HEADER & ACTIONS ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-rose-200/80 dark:border-rose-900/40 bg-gradient-to-r from-rose-50/60 via-white to-amber-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-rose-950/20 p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-rose-600 to-red-500 text-white shadow-lg shadow-rose-500/25 ring-4 ring-rose-100 dark:ring-rose-950/50">
            <Siren size={24} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Quản lý Thu hồi & Niêm phong Lô hàng
              </h2>
              {/* Badge SSE Live */}
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  sseConnected
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
                title={sseConnected ? "SSE Real-time đang kết nối trực tiếp" : "SSE đang kết nối lại..."}
              >
                <Radio size={11} className={sseConnected ? "animate-pulse text-emerald-600" : ""} />
                {sseConnected ? "LIVE STREAM" : "CONNECTING"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              Truy quét toàn diện phả hệ xuôi (BFS), nhận diện lô gộp/pha trộn và giám sát niêm phong đa điểm
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => loadRecalls()}
            disabled={loadingList}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs transition-colors"
          >
            <RefreshCw size={14} className={loadingList ? "animate-spin" : ""} />
            <span>Làm mới</span>
          </button>

          {/* Nút Tạo lệnh thu hồi (Chỉ Admin / Auditor) */}
          {["farm_admin", "processor_admin", "distributor_admin", "auditor"].includes(user?.role) && (
            <button
              type="button"
              id="btn-open-create-recall"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <Siren size={15} />
              <span>+ Mở Lệnh Thu Hồi Khẩn Cấp</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── DANH SÁCH LỆNH THU HỒI SELECTOR ─────────────────────────────── */}
      {recalls.length === 0 && !loadingList ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center bg-white/50 dark:bg-slate-900/50">
          <ShieldCheck size={48} className="mx-auto mb-3 text-emerald-500 opacity-60" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Hiện không có lệnh thu hồi nào đang hoạt động
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Tất cả các lô hàng nông sản trong chuỗi cung ứng đều an toàn. Bấm &quot;Mở Lệnh Thu Hồi&quot; nếu phát hiện nguy cơ an toàn thực phẩm.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tabs chọn Recall */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {recalls.map((r) => {
              const isSelected = r.id === selectedRecallId;
              const isClosed = r.status === "CLOSED";
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedRecallId(r.id);
                    scrollToElement("recall-detail-section", { block: "start", highlight: true });
                  }}
                  className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-all shrink-0 border ${
                    isSelected
                      ? "bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20"
                      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-rose-300 hover:bg-rose-50/40 dark:hover:bg-rose-950/20"
                  }`}
                >
                  <Siren size={14} className={isSelected ? "text-white" : "text-rose-600"} />
                  <span>{r.recall_code}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : isClosed
                        ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                    }`}
                  >
                    {r.status}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ─── T-82: TIẾN ĐỘ THU HỒI REAL-TIME WIDGET ─────────────────────── */}
          {summary && currentRecall && (
            <div id="recall-detail-section" className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-black text-slate-900 dark:text-white">
                      {currentRecall.recall_code}
                    </span>
                    <span className="rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 px-2 py-0.5 text-xs font-extrabold border border-rose-200 dark:border-rose-900">
                      Lô gốc: {currentRecall.root_batch_code}
                    </span>
                    <span className="text-xs text-slate-400">
                      Khởi tạo bởi {currentRecall.created_by_name || "Admin"} · {new Date(currentRecall.created_at).toLocaleString("vi-VN")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                    <strong className="text-rose-600">Lý do thu hồi:</strong> {currentRecall.reason}
                  </p>
                </div>

                {/* Nút Xuất Báo Cáo Excel (.xlsx) (T-78) */}
                <button
                  type="button"
                  id="btn-export-recall-excel"
                  data-testid="btn-export-recall-csv"
                  onClick={handleExportExcel}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 shadow-2xs transition-colors"
                >
                  <FileSpreadsheet size={15} />
                  <span>Xuất Báo Cáo Excel (.xlsx)</span>
                </button>
              </div>

              {/* Progress Bars (T-82) */}
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Tiến độ Số lô đã niêm phong */}
                <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Lock size={14} className="text-emerald-600" />
                      <span>Số lô đã niêm phong</span>
                    </span>
                    <span className="font-extrabold text-emerald-600 text-sm">
                      {summary.quarantineProgressPercent}%
                    </span>
                  </div>
                  {/* Progress bar line */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${summary.quarantineProgressPercent}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{summary.quarantinedBatches} đã niêm phong</span>
                    <span>Tổng {summary.totalBatches} lô</span>
                  </div>
                </div>

                {/* 2. Tiến độ Khối lượng tồn đã thu hồi */}
                <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Boxes size={14} className="text-cyan-600" />
                      <span>Khối lượng đã cách ly</span>
                    </span>
                    <span className="font-extrabold text-cyan-600 text-sm">
                      {summary.quarantineWeightPercent}%
                    </span>
                  </div>
                  {/* Progress bar line */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${summary.quarantineWeightPercent}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{summary.quarantinedRemainingKg.toLocaleString()} kg niêm phong</span>
                    <span>Tồn {summary.totalRemainingKg.toLocaleString()} kg</span>
                  </div>
                </div>

                {/* 3. Lô gộp pha trộn (T-74) */}
                <div className="rounded-xl border border-purple-200/80 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-950/20 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">
                    <Layers size={14} className="text-purple-600" />
                    <span>Lô gộp / pha trộn</span>
                  </div>
                  <div className="text-2xl font-black text-purple-800 dark:text-purple-200">
                    {summary.blendedBatchesCount} <span className="text-xs font-normal text-purple-600">lô pha trộn</span>
                  </div>
                  <p className="mt-1 text-[11px] text-purple-600 dark:text-purple-400">
                    Nhiễm chéo phả hệ qua merge
                  </p>
                </div>

                {/* 4. Khối lượng đã xuất bán/tiêu thụ */}
                <div className="rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">
                    <AlertTriangle size={14} className="text-amber-600" />
                    <span>Đã bán / tiêu thụ</span>
                  </div>
                  <div className="text-2xl font-black text-amber-800 dark:text-amber-200">
                    {summary.totalConsumedKg.toLocaleString()} <span className="text-xs font-normal text-amber-600">kg</span>
                  </div>
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    Nguy cơ ra thị trường cần thu hồi
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ─── T-77: BẢNG DANH SÁCH LÔ BỊ ẢNH HƯỞNG & BỘ LỌC ──────────────── */}
          <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            {/* Bộ lọc bảng (Filter Toolbar) */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm mã lô, kho, sản phẩm..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                {/* Filter Trạng thái Niêm phong */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                >
                  <option value="ALL">Tất cả trạng thái niêm phong</option>
                  <option value="PENDING">Chờ niêm phong (Chưa cách ly)</option>
                  <option value="QUARANTINED">Đã niêm phong cách ly</option>
                </select>

                {/* Filter Tổ chức */}
                {uniqueOrgs.length > 0 && (
                  <select
                    value={orgFilter}
                    onChange={(e) => setOrgFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                  >
                    <option value="ALL">Tất cả tổ chức sở hữu</option>
                    {uniqueOrgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Quick filter: Chỉ xem lô của đơn vị tôi */}
                {user?.role !== "auditor" && (
                  <button
                    type="button"
                    onClick={() => {
                      const myOrgId = String(user?.organizationId ?? user?.organization_id ?? "");
                      setOrgFilter(orgFilter === myOrgId ? "ALL" : myOrgId);
                    }}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all border ${
                      orgFilter === String(user?.organizationId ?? user?.organization_id ?? "")
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                        : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    }`}
                    title="Lọc nhanh các lô nông sản thuộc quyền xử lý của tổ chức bạn"
                  >
                    🏢 Lô thuộc đơn vị tôi
                  </button>
                )}
              </div>

              <div className="text-xs text-slate-500 font-medium">
                Hiển thị <strong>{filteredBatches.length}</strong> / {allBatches.length} lô ảnh hưởng
              </div>
            </div>

            {/* Bảng dữ liệu */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold">
                    <th className="px-4 py-3">Mã Lô Hàng</th>
                    <th className="px-4 py-3">Sản Phẩm</th>
                    <th className="px-4 py-3">Tổ Chức Sở Hữu</th>
                    <th className="px-4 py-3">Vị Trí / Kho Hàng</th>
                    <th className="px-4 py-3 text-right">Tồn Kho (kg)</th>
                    <th className="px-4 py-3 text-right">Đã Bán (kg)</th>
                    <th className="px-4 py-3">Đặc Tính</th>
                    <th className="px-4 py-3 text-center">Trạng Thái Niêm Phong</th>
                    <th className="px-4 py-3 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingDetail ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-rose-500" />
                        <span>Đang tải thông tin phả hệ lô bị thu hồi...</span>
                      </td>
                    </tr>
                  ) : filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400">
                        Không có lô hàng nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((batch) => {
                      const isQuarantined = batch.quarantine_status === "QUARANTINED";
                      const currentOrgId = user?.organizationId ?? user?.organization_id;
                      const canQuarantine =
                        !isQuarantined &&
                        (["farm_admin", "processor_admin", "distributor_admin", "auditor"].includes(user?.role) &&
                          (user?.role === "auditor" || currentOrgId === batch.organization_id));

                      return (
                        <tr
                          key={batch.id}
                          id={`affected-batch-row-${batch.batch_id || batch.id}`}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                            !isQuarantined ? "bg-rose-50/20 dark:bg-rose-950/10" : ""
                          }`}
                        >
                          {/* Mã Lô */}
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              {batch.batch_code}
                              {batch.batch_code === currentRecall?.root_batch_code && (
                                <span className="rounded-full bg-rose-600 text-white px-1.5 py-0.2 text-[9px] font-black uppercase">
                                  GỐC
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Sản phẩm */}
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                            {batch.product_name}
                          </td>

                          {/* Đơn vị giữ */}
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            <div className="flex items-center gap-1">
                              <Building2 size={13} className="text-slate-400 shrink-0" />
                              <span className="font-semibold">{batch.organization_name}</span>
                            </div>
                          </td>

                          {/* Vị trí hiện tại */}
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            <div className="flex items-center gap-1">
                              <MapPin size={13} className="text-slate-400 shrink-0" />
                              <span>{batch.current_location || batch.location_name || "Kho trung tâm"}</span>
                            </div>
                            {batch.quarantine_location && (
                              <div className="mt-0.5 text-[10px] text-emerald-600 font-bold">
                                Vị trí cách ly: {batch.quarantine_location}
                              </div>
                            )}
                          </td>

                          {/* Tồn kho còn lại */}
                          <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                            {Number(batch.remaining_quantity || 0).toLocaleString()} {batch.product_unit || "kg"}
                          </td>

                          {/* Đã tiêu thụ / bán */}
                          <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                            {Number(batch.consumed_quantity || 0).toLocaleString()} {batch.product_unit || "kg"}
                          </td>

                          {/* Đặc tính Blended / Merged (T-74) */}
                          <td className="px-4 py-3">
                            {batch.is_blended ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 px-2 py-0.5 text-[10px] font-bold border border-purple-200 dark:border-purple-800">
                                <Layers size={11} />
                                <span>Pha trộn (Blended)</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Đơn nguồn</span>
                            )}
                          </td>

                          {/* Trạng thái Niêm phong */}
                          <td className="px-4 py-3 text-center">
                            {isQuarantined ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 px-2.5 py-1 text-[11px] font-extrabold border border-emerald-300 dark:border-emerald-800">
                                <ShieldCheck size={13} />
                                <span>Đã niêm phong</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 px-2.5 py-1 text-[11px] font-extrabold border border-rose-300 dark:border-rose-800 animate-pulse">
                                <AlertTriangle size={13} />
                                <span>Chờ niêm phong</span>
                              </span>
                            )}
                          </td>

                          {/* Nút Thao tác (T-80) */}
                          <td className="px-4 py-3 text-right">
                            {canQuarantine ? (
                              <button
                                type="button"
                                onClick={() => setQuarantineTarget(batch)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white shadow-xs transition-colors"
                                title="Xác nhận niêm phong cách ly kho"
                              >
                                <Lock size={12} />
                                <span>Niêm phong</span>
                              </button>
                            ) : isQuarantined ? (
                              <span className="text-[11px] text-emerald-600 font-semibold">
                                ✓ Hoàn tất
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                Chờ đơn vị xử lý
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── T-72: MODAL TẠO LỆNH THU HỒI KHẨN CẤP ───────────────────────── */}
      {showCreateModal && (
        <CreateRecallModal
          batches={batches}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(newRecall) => {
            setShowCreateModal(false);
            loadRecalls();
            if (newRecall?.id) {
              setSelectedRecallId(newRecall.id);
            }
            if (onBatchUpdated) onBatchUpdated();
            scrollToElement("recall-detail-section", { block: "start", highlight: true });
          }}
        />
      )}

      {/* ─── T-80: MODAL XÁC NHẬN NIÊM PHONG & CÁCH LY ────────────────────── */}
      {quarantineTarget && (
        <QuarantineConfirmModal
          batch={quarantineTarget}
          onClose={() => setQuarantineTarget(null)}
          onSuccess={(quarantinedBatchId) => {
            setQuarantineTarget(null);
            if (selectedRecallId) {
              loadAffectedBatches(selectedRecallId);
            }
            loadRecalls();
            if (onBatchUpdated) onBatchUpdated();
            if (quarantinedBatchId) {
              scrollToElement(`affected-batch-row-${quarantinedBatchId}`, { block: "center", highlight: true });
            }
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT T-72: MODAL XÁC NHẬN TẠO LỆNH THU HỒI
// ─────────────────────────────────────────────────────────────────────────────
function CreateRecallModal({ batches = [], onClose, onSuccess }) {
  const [availableBatches, setAvailableBatches] = useState(batches);
  const [rootBatchId, setRootBatchId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const { addToast } = useToast() || {};

  useEffect(() => {
    if (!batches || batches.length === 0) {
      api.getBatches().then((res) => {
        const list = Array.isArray(res) ? res : res?.batches || [];
        setAvailableBatches(list);
      }).catch(() => {});
    } else {
      setAvailableBatches(batches);
    }
  }, [batches]);

  const reasonLen = reason.trim().length;
  const isReasonValid = reasonLen >= 20;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!rootBatchId) {
      setErrorMsg("Vui lòng chọn một lô hàng gốc để khởi tạo lệnh thu hồi.");
      return;
    }

    if (!isReasonValid) {
      setErrorMsg(`Lý do thu hồi bắt buộc phải có ít nhất 20 ký tự (Hiện tại: ${reasonLen}/20).`);
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.createRecallV1({
        rootBatchId: Number(rootBatchId),
        reason: reason.trim(),
      });

      if (addToast) {
        addToast({
          title: "Khởi tạo lệnh thu hồi thành công",
          message: `Lệnh ${res.recall?.recall_code || ""} đã được mở và đóng gói vào Hash Chain!`,
          tone: "success",
        });
      }

      onSuccess(res.recall);
    } catch (err) {
      setErrorMsg(err.message || "Không thể khởi tạo lệnh thu hồi.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedBatchObj = availableBatches.find((b) => String(b.id) === String(rootBatchId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        id="modal-create-recall"
        className="w-full max-w-xl rounded-2xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
      >
        {/* Nút đóng */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
        >
          <X size={20} />
        </button>

        {/* Tiêu đề Modal */}
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400">
            <Siren size={22} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Kích Hoạt Lệnh Thu Hồi Khẩn Cấp
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              SCRUM-169 · Đóng gói sự kiện RECALL_INITIATED vào Blockchain Hash Chain
            </p>
          </div>
        </div>

        {/* CẢNH BÁO ĐỎ TÁC ĐỘNG (T-72) */}
        <div className="mt-4 rounded-xl border-2 border-rose-500/60 bg-rose-50/80 dark:bg-rose-950/40 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-rose-900 dark:text-rose-200">
              <strong className="block font-black text-rose-700 dark:text-rose-300 uppercase tracking-wide">
                Cảnh báo tác động nghiêm trọng toàn chuỗi
              </strong>
              <p>
                Khi xác nhận mở lệnh thu hồi:
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-rose-800 dark:text-rose-300">
                <li>Lô hàng gốc sẽ bị chuyển ngay sang trạng thái <strong>RECALLED</strong>.</li>
                <li>Thuật toán BFS sẽ tự động quét xuôi phả hệ, khóa mọi lô con, lô cháu và các <strong>lô gộp/pha trộn (Blended)</strong> có liên quan.</li>
                <li>Hệ thống tự động phát thông báo khẩn tới toàn bộ tổ chức đang lưu giữ các lô chịu tác động.</li>
                <li>Sự kiện sẽ được băm SHA-256 và lưu vĩnh viễn vào chuỗi hash phi tập trung, không thể đảo ngược.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {errorMsg}
            </div>
          )}

          {/* Chọn Lô Gốc */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Chọn Lô Hàng Gốc Nghi Ngờ Sự Cố <span className="text-rose-600">*</span>
            </label>
            <select
              id="select-root-batch"
              value={rootBatchId}
              onChange={(e) => setRootBatchId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
              required
            >
              <option value="">-- Chọn một lô nông sản trong hệ thống --</option>
              {availableBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_code} · {b.product_name} ({b.remaining_quantity || b.initial_quantity || 0} kg) · {b.organization_name || ""}
                </option>
              ))}
            </select>

            {selectedBatchObj && (
              <div className="mt-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 p-2.5 text-xs text-slate-600 dark:text-slate-300">
                <div>Mã: <strong>{selectedBatchObj.batch_code}</strong> · Sản phẩm: <strong>{selectedBatchObj.product_name}</strong></div>
                <div>Đơn vị: <strong>{selectedBatchObj.organization_name}</strong> · Trạng thái hiện tại: <strong>{selectedBatchObj.status}</strong></div>
              </div>
            )}
          </div>

          {/* Nhập Lý Do Thu Hồi (Bắt buộc >= 20 ký tự) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Lý Do Thu Hồi Chi Tiết <span className="text-rose-600">*</span>
              </label>
              <span
                id="reason-char-count"
                className={`text-[11px] font-bold ${
                  isReasonValid ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {reasonLen} / 20 ký tự {isReasonValid ? "(Đạt yêu cầu)" : "(Tối thiểu 20 ký tự)"}
              </span>
            </div>
            <textarea
              id="textarea-recall-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mô tả nguyên nhân chi tiết sự cố an toàn thực phẩm, vi phạm chuỗi lạnh hoặc kết quả xét nghiệm vi sinh... (tối thiểu 20 ký tự)"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
              required
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              id="btn-submit-recall"
              disabled={submitting || !isReasonValid || !rootBatchId}
              className="rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 disabled:opacity-50 px-5 py-2 text-xs font-bold text-white shadow-md shadow-rose-600/30 transition-all flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Đang xử lý & Băm Hash...</span>
                </>
              ) : (
                <>
                  <Siren size={15} />
                  <span>Kích Hoạt Lệnh Thu Hồi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT T-80: MODAL XÁC NHẬN NIÊM PHONG & CÁCH LY
// ─────────────────────────────────────────────────────────────────────────────
function QuarantineConfirmModal({ batch, onClose, onSuccess }) {
  const [quarantineLocation, setQuarantineLocation] = useState(
    batch.current_location ? `Khu cách ly - ${batch.current_location}` : "Khu vực niêm phong cách ly kho lạnh số 1",
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const { addToast } = useToast() || {};

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    try {
      setSubmitting(true);
      const batchId = batch.batch_id || batch.id;
      await api.quarantineBatch(batchId, {
        quarantineLocation: quarantineLocation.trim(),
      });

      if (addToast) {
        addToast({
          title: "Niêm phong thành công",
          message: `Lô hàng ${batch.batch_code} đã được cách ly tại ${quarantineLocation.trim()}.`,
          tone: "success",
        });
      }

      onSuccess(batchId);
    } catch (err) {
      setErrorMsg(err.message || "Không thể thực hiện niêm phong lô hàng.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        id="modal-quarantine-batch"
        className="w-full max-w-lg rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 p-6 shadow-2xl relative"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400">
            <Lock size={22} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Xác Nhận Niêm Phong & Cách Ly Lô
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              SCRUM-172 (T-79, T-80, T-81) · Đóng dấu RECALL_CONFIRMED vào Hash Chain
            </p>
          </div>
        </div>

        {/* Thông tin lô hàng */}
        <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 text-xs space-y-1.5 border border-slate-200/80 dark:border-slate-700">
          <div className="flex justify-between">
            <span className="text-slate-500">Mã lô cần niêm phong:</span>
            <span className="font-bold text-slate-900 dark:text-white">{batch.batch_code}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Sản phẩm:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{batch.product_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Khối lượng tồn cần cách ly:</span>
            <span className="font-bold text-rose-600">{Number(batch.remaining_quantity || 0).toLocaleString()} kg</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Đơn vị chịu trách nhiệm:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{batch.organization_name}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Vị Trí Niêm Phong & Cách Ly Trong Kho <span className="text-emerald-600">*</span>
            </label>
            <input
              type="text"
              id="input-quarantine-location"
              value={quarantineLocation}
              onChange={(e) => setQuarantineLocation(e.target.value)}
              placeholder="Ví dụ: Kho cách ly số 2 - Dãy B Kệ K05"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 text-xs text-amber-800 dark:text-amber-300">
            <strong>Lưu ý:</strong> Hành động này sẽ chuyển trạng thái lô sang <strong>QUARANTINED</strong>, cấm tuyệt đối việc xuất kho hay bàn giao, đồng thời phát sóng cập nhật thời gian thực tới toàn mạng lưới.
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              id="btn-confirm-quarantine-submit"
              disabled={submitting || !quarantineLocation.trim()}
              className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition-all flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Đang ghi nhận vào Hash Chain...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>Xác Nhận Đã Niêm Phong</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
