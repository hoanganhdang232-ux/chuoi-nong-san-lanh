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
  Lock,
} from "lucide-react";
import { api } from "../api.js";

const ACTION_COLORS = {
  POST: "bg-emerald-100 text-emerald-800 border-emerald-200",
  PUT: "bg-blue-100 text-blue-800 border-blue-200",
  PATCH: "bg-amber-100 text-amber-800 border-amber-200",
  DELETE: "bg-rose-100 text-rose-800 border-rose-200",
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

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(log.resource_id || "").toLowerCase().includes(q) ||
      String(log.resource_type || "").toLowerCase().includes(q) ||
      String(log.action || "").toLowerCase().includes(q) ||
      String(log.user_id || "").toLowerCase().includes(q) ||
      String(log.user_name || "").toLowerCase().includes(q) ||
      String(log.user_email || "").toLowerCase().includes(q) ||
      String(log.ip_address || "").includes(q)
    );
  });

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-white p-6 card-shadow border border-slate-200/80">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <FileText size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Nhật ký thao tác hệ thống (Audit Log)
              </h2>
              <p className="text-xs text-slate-500">
                Lưu vết tự động toàn bộ thao tác ghi/sửa/xóa (S-31), bảo mật dữ liệu nhạy cảm
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Làm mới
            </button>
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <Lock size={14} />
              <span>Bảo vệ quyền riêng tư</span>
            </div>
          </div>
        </div>

        {/* Filters bar */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Tìm theo ID, loại tài nguyên, người dùng, IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div className="relative">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
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
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
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
        <div className="rounded-xl bg-rose-50 p-4 text-xs font-medium text-rose-700 border border-rose-200">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl bg-white card-shadow border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
            <tbody className="divide-y divide-slate-100">
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
                filteredLogs.map((log) => {
                  const actionMethod = String(log.action || "").split(" ")[0];
                  const actionColor =
                    ACTION_COLORS[actionMethod] ||
                    "bg-slate-100 text-slate-700 border-slate-200";
                  const isSuccess =
                    log.status_code >= 200 && log.status_code < 300;
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-500">
                        {log.created_at
                          ? new Date(log.created_at).toLocaleString("vi-VN")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${actionColor}`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">
                        {log.resource_type}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-600">
                        {log.resource_id ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">
                            {log.resource_id}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-600">
                        {log.user_name || log.user_email || (log.user_id ? `#${log.user_id}` : "System")}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-400">
                        {log.ip_address || "127.0.0.1"}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isSuccess
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {log.status_code || 200}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                        >
                          <Eye size={12} /> Xem Payload
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <div>
            Hiển thị <strong>{filteredLogs.length}</strong> / <strong>{total}</strong> bản ghi
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Trước
            </button>
            <span className="font-semibold text-slate-700">
              Trang {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Sau <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Payload Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/10">
            <button
              type="button"
              onClick={() => setSelectedLog(null)}
              className="absolute right-4 top-4 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <Code size={20} className="text-emerald-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Chi tiết Request Payload
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedLog.action} {selectedLog.resource_type}{" "}
                  {selectedLog.resource_id ? `(${selectedLog.resource_id})` : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 border border-slate-100">
                <div>
                  <span className="text-slate-400">Thời điểm:</span>
                  <p className="font-medium text-slate-800">
                    {new Date(selectedLog.created_at).toLocaleString("vi-VN")}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">IP thực hiện:</span>
                  <p className="font-mono text-slate-800">
                    {selectedLog.ip_address || "127.0.0.1"}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-slate-700">
                    Dữ liệu Body (Đã khử nhạy cảm - Sanitized):
                  </span>
                  <span className="text-[10px] text-emerald-600 font-medium">
                    ✓ Mật khẩu & Token đã được che giấu
                  </span>
                </div>
                <pre className="max-h-64 overflow-auto rounded-xl bg-slate-900 p-3.5 font-mono text-xs text-emerald-300">
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
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
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
