import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Code,
} from "lucide-react";
import { api } from "../api.js";

const ACTION_COLORS = {
  POST: "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  PUT: "bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  PATCH: "bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  DELETE: "bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800",
};

export default function AuditLogsView() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const limit = 20;
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Inspect modal
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAuditLogs({
        page,
        limit,
        action: actionFilter || undefined,
        resourceType: resourceFilter || undefined,
      });
      setLogs(res.data || []);
      setTotal(res.pagination?.total || 0);
    } catch (err) {
      setError(err.message || "Không thể tải nhật ký thao tác.");
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, resourceFilter, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit) || 1;

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(log.id).includes(q) ||
      String(log.resource_type || "").toLowerCase().includes(q) ||
      String(log.resource_id || "").toLowerCase().includes(q) ||
      String(log.user_id || "").toLowerCase().includes(q) ||
      String(log.ip_address || "").toLowerCase().includes(q) ||
      String(log.action || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 card-shadow border border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Nhật ký thao tác hệ thống (Audit Trail)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ghi nhận tự động các hành động sửa đổi dữ liệu (POST / PUT / PATCH / DELETE) kèm Actor & IP
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Làm mới
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Tìm theo ID, loại tài nguyên, người dùng, IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
            />
          </div>

          <div className="relative">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-800 dark:text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
            >
              <option value="">Tất cả hành động (Action)</option>
              <option value="POST">POST (Tạo mới)</option>
              <option value="PUT">PUT (Cập nhật)</option>
              <option value="PATCH">PATCH (Sửa đổi)</option>
              <option value="DELETE">DELETE (Xóa)</option>
            </select>
          </div>

          <div className="relative">
            <select
              value={resourceFilter}
              onChange={(e) => {
                setResourceFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-800 dark:text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
            >
              <option value="">Tất cả tài nguyên (Resource)</option>
              <option value="batches">Lô hàng (batches)</option>
              <option value="locations">Địa điểm (locations)</option>
              <option value="products">Sản phẩm (products)</option>
              <option value="land-plots">Thửa đất (land-plots)</option>
              <option value="transfers">Bàn giao (transfers)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 p-4 text-xs font-medium text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 card-shadow border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Hành động</th>
                <th className="px-4 py-3">Tài nguyên</th>
                <th className="px-4 py-3">Resource ID</th>
                <th className="px-4 py-3">Người dùng (Actor)</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3 text-center">Mã phản hồi</th>
                <th className="px-4 py-3 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Đang tải danh sách nhật ký...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Chưa có nhật ký thao tác nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => {
                  const actionMethod = String(log.action || "").split(" ")[0];
                  const actionColor =
                    ACTION_COLORS[actionMethod] ||
                    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
                  const isSuccess =
                    log.status_code >= 200 && log.status_code < 300;
                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors ${
                        idx % 2 === 0
                          ? "bg-white dark:bg-slate-900"
                          : "bg-slate-50/50 dark:bg-slate-900/50"
                      } hover:bg-slate-50 dark:hover:bg-slate-800/60`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {log.created_at
                          ? new Date(log.created_at).toLocaleString("vi-VN")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-lg border px-2 py-0.5 font-mono text-[10px] font-bold ${actionColor}`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                        {log.resource_type}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-600 dark:text-slate-400">
                        {log.resource_id || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-[10px] text-slate-700 dark:text-slate-300">
                            {log.user_id ? `U${log.user_id}` : "SYS"}
                          </span>
                          <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px]">
                            {log.user_id ? `User #${log.user_id}` : "Hệ thống"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {log.ip_address || "127.0.0.1"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 font-mono text-[10px] font-bold ${
                            isSuccess
                              ? "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300"
                              : "bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300"
                          }`}
                        >
                          {log.status_code || 200}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-emerald-700 dark:hover:text-emerald-400 transition cursor-pointer shadow-2xs"
                        >
                          <Eye size={12} />
                          Xem payload
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 px-4 py-3 text-xs text-slate-500 dark:text-slate-400 gap-2">
          <div>
            Hiển thị{" "}
            <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">
              {filteredLogs.length}
            </span>{" "}
            trên tổng số{" "}
            <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">
              {total}
            </span>{" "}
            thao tác
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            >
              <ChevronLeft size={14} /> Trước
            </button>
            <span className="font-mono px-2 font-bold text-slate-700 dark:text-slate-200">
              Trang {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            >
              Sau <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Payload Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="animate-modal-in relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSelectedLog(null)}
              className="absolute right-4 top-4 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Code size={20} className="text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Chi tiết Request Payload
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedLog.action} {selectedLog.resource_type}{" "}
                  {selectedLog.resource_id ? `(${selectedLog.resource_id})` : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 dark:bg-slate-950 p-3 border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-slate-400">Thời điểm:</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {new Date(selectedLog.created_at).toLocaleString("vi-VN")}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">IP thực hiện:</span>
                  <p className="font-mono text-slate-800 dark:text-slate-200">
                    {selectedLog.ip_address || "127.0.0.1"}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Dữ liệu Body (Đã khử nhạy cảm - Sanitized):
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    ✓ Mật khẩu & Token đã được che giấu
                  </span>
                </div>
                <pre className="max-h-64 overflow-auto rounded-xl bg-slate-950 p-3.5 font-mono text-xs text-emerald-400 border border-slate-800">
                  {selectedLog.request_body
                    ? JSON.stringify(
                        typeof selectedLog.request_body === "string"
                          ? JSON.parse(selectedLog.request_body)
                          : selectedLog.request_body,
                        null,
                        2
                      )
                    : "// Không có payload kèm theo"}
                </pre>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
