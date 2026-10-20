import { useState, useEffect } from "react";
import {
  Truck,
  RefreshCw,
  Filter,
  BarChart2,
} from "lucide-react";
import { api } from "../api.js";

export default function TransporterAnalyticsView() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("violation_rate_desc");

  useEffect(() => {
    loadData();
  }, [sortBy]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.getTransporterViolations({ sortBy });
      setData(res);
    } catch (err) {
      setError(err.message || "Không thể tải báo cáo vi phạm đơn vị vận tải.");
    } finally {
      setLoading(false);
    }
  };

  const kpis = data?.kpis || {};
  const transporters = data?.transporters || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400">
                <Truck size={16} />
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
                Báo Cáo Phân Tích Logistics (S-56 / T-130)
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Thống Kê Vi Phạm Chuỗi Lạnh Theo Đơn Vị Vận Chuyển
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Đánh giá tỷ lệ tuân thủ nhiệt độ bảo quản, xếp hạng mức độ rủi ro của từng nhà xe và đội xe chuyên dụng
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm transition active:scale-95 shrink-0 self-start sm:self-auto"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-cyan-500" : ""} />
            <span>Làm mới</span>
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <span className="font-semibold text-slate-500 dark:text-slate-400">Sắp xếp theo:</span>
            <div className="flex gap-1">
              {[
                { key: "violation_rate_desc", label: "Tỷ lệ vi phạm cao nhất" },
                { key: "violation_rate_asc", label: "Tỷ lệ vi phạm thấp nhất" },
                { key: "shipments_desc", label: "Số chuyến nhiều nhất" },
                { key: "name", label: "Tên nhà xe" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSortBy(tab.key)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                    sortBy === tab.key
                      ? "bg-cyan-600 text-white shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <span className="text-[11px] text-slate-400">
            Cập nhật lần cuối: {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("vi-VN") : "..."}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md">
          <span className="text-slate-400 font-semibold text-xs block mb-1">Tổng Đơn Vị Vận Tải</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {kpis.totalTransporters ?? 0}
            </span>
            <span className="text-xs text-slate-400">nhà xe</span>
          </div>
          <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold mt-1 block">
            100% trang bị cảm biến IoT
          </span>
        </div>

        {/* KPI 2 */}
        <div className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md">
          <span className="text-slate-400 font-semibold text-xs block mb-1">Tổng Chuyến Vận Chuyển</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {kpis.totalShipments ?? 0}
            </span>
            <span className="text-xs text-slate-400">chuyến</span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">
            Gồm liên tỉnh & nội bộ
          </span>
        </div>

        {/* KPI 3 */}
        <div className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md">
          <span className="text-slate-400 font-semibold text-xs block mb-1">Tỷ Lệ Vi Phạm TB</span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-black ${
                (kpis.avgViolationRatePct || 0) > 15
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {kpis.avgViolationRatePct ?? 0}%
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">
            {kpis.totalViolations ?? 0} sự kiện vượt ngưỡng
          </span>
        </div>

        {/* KPI 4 */}
        <div className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md">
          <span className="text-slate-400 font-semibold text-xs block mb-1">Nhà Xe An Toàn Nhất</span>
          <div className="min-w-0">
            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 block truncate">
              {kpis.safestTransporter?.name || "Đang tổng hợp"}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold block mt-1">
              Tỷ lệ vi phạm: {kpis.safestTransporter?.rate ?? 0}%
            </span>
          </div>
        </div>
      </div>

      {/* Main Ranking Table & Visual Bars */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <BarChart2 size={18} className="text-cyan-500" />
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
              Bảng Xếp Hạng Mức Độ Tuân Thủ Chuỗi Lạnh
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Phân loại theo tiêu chuẩn ISO 22005 & GSP
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400 font-medium">
            <RefreshCw size={28} className="mx-auto mb-2 animate-spin text-cyan-500" />
            Đang tổng hợp dữ liệu cảm biến IoT...
          </div>
        ) : error ? (
          <div className="p-4 my-4 rounded-2xl bg-rose-50 text-rose-700 text-xs font-medium">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-black uppercase text-slate-500">
                  <th className="py-3 px-3">Mã & Đơn vị vận tải</th>
                  <th className="py-3 px-3">Phương tiện / Biển số</th>
                  <th className="py-3 px-3 text-center">Tổng chuyến</th>
                  <th className="py-3 px-3 text-center">Đạt chuẩn</th>
                  <th className="py-3 px-3 text-center">Vi phạm</th>
                  <th className="py-3 px-3 w-48">Tỷ lệ vi phạm %</th>
                  <th className="py-3 px-3 text-right">Phân hạng tuân thủ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transporters.map((trp) => (
                  <tr key={trp.transporterId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-3">
                      <div className="font-bold text-slate-900 dark:text-white text-xs">{trp.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{trp.code} • SĐT: {trp.contactPhone}</div>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs">
                        {trp.licensePlate || "N/A"}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-xs">{trp.vehicleType}</div>
                    </td>
                    <td className="py-3.5 px-3 text-center font-bold text-slate-800 dark:text-slate-200">
                      {trp.totalShipments}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {trp.compliantShipments}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      <span className={`font-bold ${trp.violatingShipments > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400"}`}>
                        {trp.violatingShipments}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono font-bold">
                          <span style={{ color: trp.statusColor }}>{trp.violationRatePct}%</span>
                          <span className="text-slate-400 text-[10px]">{trp.violatingShipments}/{trp.totalShipments}</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, Math.max(trp.violationRatePct, 4))}%`,
                              backgroundColor: trp.statusColor,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <span
                        className="inline-block px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-2xs"
                        style={{
                          backgroundColor: `${trp.statusColor}20`,
                          color: trp.statusColor,
                          border: `1px solid ${trp.statusColor}40`,
                        }}
                      >
                        {trp.complianceLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
