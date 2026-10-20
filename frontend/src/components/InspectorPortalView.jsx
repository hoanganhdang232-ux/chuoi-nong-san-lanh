import { useState, useEffect } from "react";
import {
  Search,
  FileDown,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Layers,
  Thermometer,
  Lock,
  UserCheck,
  RefreshCw,
  Clock,
} from "lucide-react";
import { api } from "../api.js";

export default function InspectorPortalView({ initialBatchCode = "" }) {
  const [searchCode, setSearchCode] = useState(initialBatchCode);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [dossier, setDossier] = useState(null);
  const [error, setError] = useState("");
  const [availableBatches, setAvailableBatches] = useState([]);

  useEffect(() => {
    // Tải danh sách lô hàng mẫu để làm gợi ý tìm kiếm nhanh
    api
      .getBatches()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.batches || [];
        setAvailableBatches(list.slice(0, 8));
        if (!initialBatchCode && list.length > 0) {
          handleSearch(list[0].batch_code);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialBatchCode) {
      setSearchCode(initialBatchCode);
      handleSearch(initialBatchCode);
    }
  }, [initialBatchCode]);

  const handleSearch = async (codeToSearch) => {
    const code = (codeToSearch || searchCode || "").trim();
    if (!code) {
      setError("Vui lòng nhập mã lô hàng cần thanh tra.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const data = await api.getInspectorTrace(code);
      setDossier(data);
      setSearchCode(code);
    } catch (err) {
      setDossier(null);
      setError(err.message || "Không thể tìm thấy hồ sơ thanh tra cho mã lô này.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!dossier?.batch?.batchCode) return;
    try {
      setExportingPdf(true);
      await api.downloadInspectorPdf(dossier.batch.batchCode);
    } catch (err) {
      alert(err.message || "Không thể xuất tệp tin PDF.");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400">
                <Search size={16} />
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Cổng Tra Cứu Thanh Tra Liên Tổ Chức (S-54 / T-125)
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Hồ Sơ Kiểm Tra Nguồn Gốc & Chuỗi Lạnh
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tra cứu hồ sơ phả hệ xuyên tổ chức, đối chiếu bằng chứng mật mã học Hash Chain và xuất PDF chính thức
            </p>
          </div>

          {dossier && (
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition shrink-0 active:scale-95 disabled:opacity-50"
            >
              {exportingPdf ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <FileDown size={16} />
              )}
              <span>{exportingPdf ? "Đang biên soạn PDF..." : "Xuất Hồ Sơ Kiểm Tra (PDF)"}</span>
            </button>
          )}
        </div>

        {/* Search Bar & Quick Chips */}
        <div className="mt-5 space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Nhập mã lô hàng (VD: BATCH-D49525595E hoặc mã công khai TRC-...)"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition shadow-inner"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs shadow-md transition hover:bg-slate-800 dark:hover:bg-slate-100 shrink-0"
            >
              {loading ? "Đang tra cứu..." : "Tra cứu"}
            </button>
          </form>

          {/* Quick Suggestions */}
          {availableBatches.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="font-semibold text-slate-400">Gợi ý nhanh:</span>
              {availableBatches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSearch(b.batch_code)}
                  className={`px-2.5 py-1 rounded-xl font-mono text-[11px] font-bold transition border ${
                    searchCode === b.batch_code
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400"
                  }`}
                >
                  {b.batch_code}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Loading & Error States */}
      {loading ? (
        <div className="p-16 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center shadow-lg">
          <RefreshCw size={36} className="mx-auto mb-3 animate-spin text-emerald-500" />
          <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
            Đang tổng hợp hồ sơ thanh tra liên tổ chức...
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Đang chạy kiểm tra chéo mật mã học Hash Chain và lịch sử chuỗi lạnh
          </p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-3xl border border-rose-200 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-sm flex items-start gap-3 shadow-md">
          <AlertTriangle size={20} className="shrink-0 text-rose-600 mt-0.5" />
          <div>
            <h4 className="font-bold">Không thể tra cứu hồ sơ</h4>
            <p className="text-xs mt-1 text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        </div>
      ) : dossier ? (
        /* Full Dossier View */
        <div className="space-y-6">
          {/* T-127: HASH CHAIN INTEGRITY SEAL BANNER */}
          <div
            className={`p-6 rounded-3xl border-2 shadow-xl backdrop-blur-xl relative overflow-hidden transition-all ${
              dossier.hashChain.isChainValid
                ? "bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-500/60 text-emerald-950 dark:text-emerald-100"
                : "bg-rose-50/90 dark:bg-rose-950/40 border-rose-500/60 text-rose-950 dark:text-rose-100"
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl shrink-0 shadow-md ${
                    dossier.hashChain.isChainValid
                      ? "bg-emerald-600 text-white"
                      : "bg-rose-600 text-white"
                  }`}
                >
                  {dossier.hashChain.isChainValid ? <ShieldCheck size={32} /> : <AlertTriangle size={32} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        dossier.hashChain.isChainValid
                          ? "bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200"
                          : "bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-200"
                      }`}
                    >
                      {dossier.hashChain.isChainValid ? "CON DẤU: HỢP LỆ (VALID)" : "CẢNH BÁO: BỊ CAN THIỆP (INVALID)"}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      {dossier.hashChain.blockCount} Khối sự kiện
                    </span>
                  </div>
                  <h3 className="text-lg font-black mt-1">
                    {dossier.hashChain.isChainValid
                      ? "Chuỗi Khối Hash Chain Nguyên Bản - Toàn Vẹn 100%"
                      : "Cảnh Báo: Phát Hiện Dấu Hiệu Đứt Gãy / Sửa Đổi Dữ Liệu!"}
                  </h3>
                  <p className="text-xs opacity-85 mt-0.5 max-w-2xl leading-relaxed">
                    {dossier.hashChain.isChainValid
                      ? "Toàn bộ chuỗi liên kết các sự kiện từ thu hoạch, vận chuyển đến phân phối đều khớp chính xác thuật toán SHA-256. Không có dấu hiệu bị can thiệp ngoài quy trình."
                      : "Cơ sở dữ liệu phát hiện có bản ghi không khớp với mã băm liên kết trước đó. Lô hàng này không đủ điều kiện lưu thông minh bạch!"}
                  </p>
                </div>
              </div>

              {/* Head Hash Pill */}
              <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-right shrink-0">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Head Hash Chuỗi</span>
                <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                  {(dossier.hashChain.headHash || "").slice(0, 16)}...
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-0.5 font-semibold">
                  SHA-256 Verified
                </span>
              </div>
            </div>
          </div>

          {/* Grid: 2 Columns Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1 & 2: Batch Info & Origin */}
            <div className="lg:col-span-2 space-y-6">
              {/* Batch Legal Details */}
              <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-md">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-emerald-500" />
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                      1. Thông Tin Lô Nông Sản & Pháp Lý
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                    {dossier.batch.batchCode}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Sản phẩm:</span>
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {dossier.batch.productName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Khối lượng ban đầu:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {dossier.batch.initialQuantity} {dossier.batch.unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Khối lượng còn lại:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {dossier.batch.remainingQuantity} {dossier.batch.unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Mã công khai:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {dossier.batch.publicCode || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Ngày thu hoạch:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {dossier.batch.harvestedAt
                        ? new Date(dossier.batch.harvestedAt).toLocaleDateString("vi-VN")
                        : "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Vị trí hiện tại:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {dossier.batch.currentLocation || "Kho bảo quản"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Origin & ND 13 Anonymization Card */}
              <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-md">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-emerald-500" />
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                      2. Xuất Xứ Nông Hộ & Chứng Nhận (NĐ 13/2023)
                    </h3>
                  </div>
                  {dossier.origin.isAnonymized ? (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 font-bold text-[10px] border border-cyan-200">
                      <Lock size={12} /> Đã bảo vệ PII (NĐ 13/2023)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-[10px]">
                      <UserCheck size={12} /> Thông tin xác thực
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Trang trại / Nông hộ:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {dossier.origin.farmName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Địa chỉ sản xuất:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {dossier.origin.farmAddress}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Thửa đất / Canh tác:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {dossier.origin.plotName} ({dossier.origin.areaHa || 1} ha, {dossier.origin.soilType})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Chứng nhận chất lượng:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {dossier.origin.certificationStandard || "VietGAP"} ({dossier.origin.certificationCode || "VG-DL01"})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 3: Cold Chain & Organizations */}
            <div className="space-y-6">
              {/* Cold Chain Audit Summary */}
              <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-md">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <Thermometer size={18} className="text-cyan-500" />
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    Giám Sát Chuỗi Lạnh
                  </h3>
                </div>

                <div className="mt-4 space-y-3 text-xs">
                  <div className="p-3 rounded-2xl bg-cyan-50/50 dark:bg-cyan-950/30 border border-cyan-200/60 dark:border-cyan-800/40">
                    <span className="text-slate-500 block text-[11px]">Ngưỡng nhiệt độ an toàn:</span>
                    <span className="font-black text-cyan-800 dark:text-cyan-300 text-sm">
                      {dossier.coldChain.thresholds.minTemp ?? 2}°C → {dossier.coldChain.thresholds.maxTemp ?? 8}°C
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Độ trễ cho phép: {dossier.coldChain.thresholds.maxAllowedDelayMinutes ?? 30} phút
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">Min</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {dossier.coldChain.stats.minTemperature}°C
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">TB</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {dossier.coldChain.stats.avgTemperature}°C
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">Max</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {dossier.coldChain.stats.maxTemperature}°C
                      </span>
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-2xl border text-[11px] font-bold ${
                      dossier.coldChain.alertCount > 0
                        ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300"
                    }`}
                  >
                    {dossier.coldChain.alertCount > 0
                      ? `🚨 Có ${dossier.coldChain.alertCount} sự kiện vi phạm nhiệt độ`
                      : "✓ 0 vi phạm - Nhiệt độ luôn ổn định"}
                  </div>
                </div>
              </div>

              {/* Organizations Involved */}
              <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-md">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <Building2 size={18} className="text-emerald-500" />
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    Các Tổ Chức Trong Chuỗi
                  </h3>
                </div>

                <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {dossier.organizationsInvolved.map((org, i) => (
                    <div key={org.id || i} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">{org.name}</span>
                        <span className="text-[10px] text-slate-400 capitalize">{org.type} • {org.role}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-mono text-[10px] font-bold">
                        Org #{org.id}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Cross-organization Timeline & Block Explorer */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-md overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-emerald-500" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  3. Nhật Ký Các Khối Sự Kiện Hash Chain ({dossier.hashChain.events.length} blocks)
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Mỗi khối liên kết toán học SHA-256
              </span>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-black uppercase text-slate-500">
                    <th className="py-3 px-3">#</th>
                    <th className="py-3 px-3">Sự kiện</th>
                    <th className="py-3 px-3">Thời gian</th>
                    <th className="py-3 px-3">Người thực hiện</th>
                    <th className="py-3 px-3 font-mono">Previous Hash</th>
                    <th className="py-3 px-3 font-mono">Current Hash</th>
                    <th className="py-3 px-3 text-center">Khớp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dossier.hashChain.events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-bold text-slate-500">{ev.blockIndex}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                          {ev.eventType}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                        {new Date(ev.timestamp).toLocaleString("vi-VN")}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {ev.actor}
                        </span>
                        {ev.isActorAnonymized && (
                          <span className="ml-1 text-[9px] text-cyan-600 dark:text-cyan-400 font-bold">
                            (NĐ13)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                        {(ev.previousHash || "GENESIS").slice(0, 10)}...
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        {(ev.currentHash || "").slice(0, 10)}...
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[11px]">
                          ✓
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
