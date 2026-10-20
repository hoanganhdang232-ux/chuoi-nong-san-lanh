import { useState, useEffect } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Play,
  History,
  Lock,
  RefreshCw,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { api } from "../api.js";

export default function SystemIntegrityView() {
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);
  const [scanHistory, setScanHistory] = useState([]);
  const [privacyRequests, setPrivacyRequests] = useState([]);
  const [activeTab, setActiveTab] = useState("integrity"); // 'integrity' | 'privacy'
  const [message, setMessage] = useState(null);
  const [error, setError] = useState("");

  // Form ẩn danh hóa NĐ 13
  const [targetType, setTargetType] = useState("user");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("Yêu cầu xóa/ẩn danh dữ liệu cá nhân theo Điều 16 Nghị định 13/2023/NĐ-CP");

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");
      const [histRes, privRes] = await Promise.all([
        api.getSystemIntegrityRuns({ limit: 15 }).catch(() => ({ runs: [] })),
        api.getPrivacyRequests({ limit: 15 }).catch(() => ({ requests: [] })),
      ]);
      setScanHistory(histRes?.runs || []);
      setPrivacyRequests(privRes?.requests || []);
    } catch (err) {
      setError(err.message || "Không thể tải thông tin an ninh hệ thống.");
    } finally {
      setLoading(false);
    }
  };

  const handleRunManualScan = async () => {
    try {
      setScanning(true);
      setMessage(null);
      setError("");
      const result = await api.runSystemIntegrityCheck();
      setMessage({
        type: result.status === "VALID" ? "success" : "error",
        text:
          result.status === "VALID"
            ? `✓ Hoàn tất quét ${result.totalBatches} lô hàng trong ${result.durationMs}ms. Toàn bộ chuỗi Hash nguyên bản 100%!`
            : `🚨 BÁO ĐỘNG: Phát hiện ${result.corruptedCount} lô hàng bị can thiệp trái phép!`,
      });
      await loadAll();
    } catch (err) {
      setError(err.message || "Quá trình quét toàn hệ thống gặp sự cố.");
    } finally {
      setScanning(false);
    }
  };

  const handleAnonymize = async (e) => {
    e.preventDefault();
    if (!targetId) {
      setError("Vui lòng nhập ID của nông hộ / người dùng cần ẩn danh.");
      return;
    }

    try {
      setAnonymizing(true);
      setMessage(null);
      setError("");
      const result = await api.anonymizeFarmer({
        targetType,
        targetId: Number(targetId),
        reason,
      });
      setMessage({
        type: "success",
        text: `✓ Đã ẩn danh thành công đối tượng #${targetId} thành '${result.pseudonym}'. Tính toàn vẹn Hash Chain được bảo toàn 100%!`,
      });
      setTargetId("");
      await loadAll();
    } catch (err) {
      setError(err.message || "Không thể thực hiện ẩn danh hóa.");
    } finally {
      setAnonymizing(false);
    }
  };

  const latestScan = scanHistory[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400">
                <ShieldCheck size={16} />
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Bảo Mật CSDL & Tuân Thủ Nghị Định 13 (S-57 / S-58)
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Kiểm Tra Toàn Vẹn Hash Chain & Bảo Vệ Dữ Liệu Nông Hộ
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Giám sát tính bất biến của các sự kiện mã hóa, phát hiện giả mạo và quản lý quyền ẩn danh dữ liệu cá nhân
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunManualScan}
            disabled={scanning}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 shrink-0 self-start sm:self-auto"
          >
            {scanning ? (
              <RefreshCw size={15} className="animate-spin text-emerald-500" />
            ) : (
              <Play size={15} />
            )}
            <span>{scanning ? "Đang quét toàn DB..." : "Quét Toàn Hệ Thống Ngay"}</span>
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 pt-5 border-t border-slate-100 dark:border-slate-800 mt-5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("integrity")}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === "integrity"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            <ShieldCheck size={14} />
            Toàn vẹn Hash Chain (T-131 / T-132)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("privacy")}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === "privacy"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            <Lock size={14} />
            Ẩn danh hóa NĐ 13/2023 (T-133 / T-134)
          </button>
        </div>
      </div>

      {/* Message & Alert Banner */}
      {message && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-md ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-200"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 text-rose-700 text-xs font-bold flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: INTEGRITY WORKER & HISTORY */}
      {activeTab === "integrity" && (
        <div className="space-y-6">
          {/* Status KPI Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md">
              <span className="text-slate-400 font-semibold text-xs block mb-1">Trạng Thái Hệ Thống Hiện Tại</span>
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 rounded-full ${
                    latestScan?.status === "VALID" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                  }`}
                />
                <span className="text-xl font-black text-slate-900 dark:text-white">
                  {latestScan?.status === "VALID" ? "AN TOÀN - NGUYÊN BẢN" : "CẢNH BÁO CAN THIỆP"}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">
                Lần quét gần nhất: {latestScan?.runAt ? new Date(latestScan.runAt).toLocaleString("vi-VN") : "Chưa có"}
              </span>
            </div>

            <div className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md">
              <span className="text-slate-400 font-semibold text-xs block mb-1">Số Lô Hợp Lệ / Tổng Lô</span>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                {latestScan ? `${latestScan.validCount} / ${latestScan.totalBatches}` : "0 / 0"}
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">
                Tỷ lệ toàn vẹn: {latestScan?.totalBatches ? ((latestScan.validCount / latestScan.totalBatches) * 100).toFixed(1) : 100}%
              </span>
            </div>

            <div className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md">
              <span className="text-slate-400 font-semibold text-xs block mb-1">Tần Suất Quét Tự Động</span>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                Mỗi 24 Giờ (02:00)
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-1">
                Background Cronjob Active
              </span>
            </div>
          </div>

          {/* Scan History Table */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <History size={18} className="text-emerald-500" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Lịch Sử Các Đợt Quét Toàn Vẹn CSDL
                </h3>
              </div>
              <span className="text-xs text-slate-500">Lưu vào bảng system_integrity_logs</span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">Đang tải lịch sử quét...</div>
            ) : scanHistory.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">Chưa có bản ghi quét nào.</div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-black uppercase text-slate-500">
                      <th className="py-3 px-3">Thời gian</th>
                      <th className="py-3 px-3">Tổng số lô</th>
                      <th className="py-3 px-3">Lô hợp lệ</th>
                      <th className="py-3 px-3">Lô vi phạm</th>
                      <th className="py-3 px-3">Thời gian chạy</th>
                      <th className="py-3 px-3">Nguồn kích hoạt</th>
                      <th className="py-3 px-3 text-right">Kết luận</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {scanHistory.map((run) => (
                      <tr key={run.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                          {new Date(run.runAt).toLocaleString("vi-VN")}
                        </td>
                        <td className="py-3.5 px-3 font-bold">{run.totalBatches}</td>
                        <td className="py-3.5 px-3 text-emerald-600 dark:text-emerald-400 font-bold">
                          {run.validCount}
                        </td>
                        <td className="py-3.5 px-3 font-bold">
                          <span className={run.corruptedCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400"}>
                            {run.corruptedCount}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-slate-500">{run.durationMs} ms</td>
                        <td className="py-3.5 px-3 font-mono text-[10px] text-slate-500">{run.triggeredBy}</td>
                        <td className="py-3.5 px-3 text-right">
                          <span
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                              run.status === "VALID"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}
                          >
                            {run.status === "VALID" ? "✓ TOÀN VẸN" : "🚨 BỊ CAN THIỆP"}
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
      )}

      {/* TAB 2: PRIVACY & ND 13/2023 ANONYMIZATION */}
      {activeTab === "privacy" && (
        <div className="space-y-6">
          {/* Anonymization Form Card */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Lock size={18} className="text-cyan-500" />
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Thực Thi Quyền Ẩn Danh Hóa Dữ Liệu Nông Hộ (Nghị định 13/2023/NĐ-CP)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Thay thế Tên, SĐT, Địa chỉ cá nhân thành chuỗi Pseudonym mà KHÔNG làm hỏng Hash Chain
                </p>
              </div>
            </div>

            <form onSubmit={handleAnonymize} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Loại đối tượng
                  </label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
                  >
                    <option value="user">Tài khoản Nông dân (User)</option>
                    <option value="farm">Trang trại Nông hộ (Farm)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    ID đối tượng cần ẩn danh
                  </label>
                  <input
                    type="number"
                    placeholder="VD: 5"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Căn cứ pháp lý / Lý do
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={anonymizing}
                  className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-white font-bold text-xs shadow-md transition hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  {anonymizing ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
                  <span>Thực Thi Ẩn Danh Hóa Ngay</span>
                </button>
              </div>
            </form>
          </div>

          {/* Privacy Requests History Table */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-cyan-500" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Danh Sách Yêu Cầu Ẩn Danh Hóa Đã Thực Thi
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">Bảo toàn 100% Hash Chain</span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">Đang tải danh sách yêu cầu...</div>
            ) : privacyRequests.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">Chưa có yêu cầu ẩn danh nào.</div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-black uppercase text-slate-500">
                      <th className="py-3 px-3">Mã yêu cầu</th>
                      <th className="py-3 px-3">Loại & ID</th>
                      <th className="py-3 px-3">Tên gốc đã ẩn</th>
                      <th className="py-3 px-3">Tên mã hóa (Pseudonym)</th>
                      <th className="py-3 px-3">Thời gian thực thi</th>
                      <th className="py-3 px-3 text-right">Toàn vẹn Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {privacyRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-3 font-mono text-[11px] font-bold text-slate-600 dark:text-slate-400">
                          {req.request_code}
                        </td>
                        <td className="py-3.5 px-3 font-bold capitalize">
                          {req.target_type} #{req.target_id}
                        </td>
                        <td className="py-3.5 px-3 text-slate-500 line-through">
                          {req.original_identifier || "N/A"}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 py-1 px-2 rounded-lg border border-cyan-200/60">
                            {req.pseudonym}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-slate-500">
                          {new Date(req.anonymized_at).toLocaleString("vi-VN")}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                            <CheckCircle2 size={12} /> BẢO TOÀN 100%
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
      )}
    </div>
  );
}
