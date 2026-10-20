import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Search,
  RefreshCw,
  ThermometerSnowflake,
  Siren,
  Truck,
  Inbox,
} from "lucide-react";
import { api } from "../api.js";

export default function NotificationCenterDrawer({ isOpen, onClose, onRefreshBell }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'unread' | 'cold_chain' | 'recall' | 'transfer'
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ all: 0, unread: 0, cold_chain: 0, recall: 0, transfer: 0 });

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getNotificationHistory({
        type: activeTab === "unread" ? "all" : activeTab,
        isRead: activeTab === "unread" ? "unread" : "all",
        search,
        limit: 100,
      });

      if (res) {
        setNotifications(res.notifications || []);
        if (res.categoryCounts) {
          setStats(res.categoryCounts);
        }
      }
    } catch (err) {
      console.warn("Không thể tải lịch sử thông báo:", err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsReadV1();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setStats((prev) => ({ ...prev, unread: 0 }));
      if (onRefreshBell) onRefreshBell();
    } catch (err) {
      console.error("Lỗi đánh dấu tất cả đã đọc:", err);
    }
  };

  const handleMarkSingleRead = async (id, e) => {
    e?.stopPropagation();
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
      setStats((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
      if (onRefreshBell) onRefreshBell();
    } catch (err) {
      console.error("Lỗi đánh dấu đã đọc:", err);
    }
  };

  const getIcon = (type = "", title = "") => {
    const t = `${type} ${title}`.toLowerCase();
    if (t.includes("cold_chain") || t.includes("chuỗi lạnh") || t.includes("nhiệt độ")) {
      return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950/80 dark:text-cyan-400">
          <ThermometerSnowflake size={18} />
        </span>
      );
    }
    if (t.includes("recall") || t.includes("thu hồi") || t.includes("quarantine")) {
      return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-400">
          <Siren size={18} />
        </span>
      );
    }
    if (t.includes("transfer") || t.includes("bàn giao") || t.includes("vận chuyển")) {
      return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400">
          <Truck size={18} />
        </span>
      );
    }
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <Bell size={18} />
      </span>
    );
  };

  const formatTime = (isoString) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl flex flex-col h-full border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400">
              <Bell size={18} />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Trung Tâm Thông Báo
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Toàn bộ cảnh báo chuỗi lạnh, thu hồi & bàn giao
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={fetchHistory}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Làm mới"
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Filter Pills & Actions (T-121) */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 shrink-0">
          {/* Search box */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm thông báo theo từ khóa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 border border-transparent focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition ${
                activeTab === "all"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              Tất cả ({stats.all || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("unread")}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition flex items-center gap-1 ${
                activeTab === "unread"
                  ? "bg-rose-600 text-white"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100"
              }`}
            >
              Chưa đọc ({stats.unread || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("cold_chain")}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition flex items-center gap-1 ${
                activeTab === "cold_chain"
                  ? "bg-cyan-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              ❄️ Chuỗi lạnh ({stats.cold_chain || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("recall")}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition flex items-center gap-1 ${
                activeTab === "recall"
                  ? "bg-rose-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              🚨 Thu hồi ({stats.recall || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("transfer")}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition flex items-center gap-1 ${
                activeTab === "transfer"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              📦 Bàn giao ({stats.transfer || 0})
            </button>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              Hiển thị {notifications.length} thông báo
            </span>
            {stats.unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                <CheckCheck size={14} />
                <span>Đánh dấu tất cả là đã đọc</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? (
            <div className="py-20 text-center text-sm text-slate-400 font-medium">
              <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-emerald-500" />
              Đang tải danh sách thông báo...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-24 text-center text-slate-400">
              <Inbox size={48} className="mx-auto mb-3 opacity-30 text-slate-400" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Không tìm thấy thông báo nào
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Không có sự cố hoặc thông báo phù hợp với bộ lọc hiện tại.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                onClick={() => !item.is_read && handleMarkSingleRead(item.id)}
                className={`p-4 transition-colors flex items-start gap-3.5 cursor-pointer ${
                  item.is_read
                    ? "bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40 opacity-80"
                    : "bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 border-l-4 border-emerald-500"
                }`}
              >
                {getIcon(item.type, item.title)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4
                      className={`text-xs font-bold truncate ${
                        item.is_read
                          ? "text-slate-800 dark:text-slate-200"
                          : "text-slate-900 dark:text-white font-extrabold"
                      }`}
                    >
                      {item.title}
                    </h4>
                    <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                      {formatTime(item.created_at)}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                    {item.message}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                      {item.type || item.kind}
                    </span>
                    {!item.is_read && (
                      <button
                        type="button"
                        onClick={(e) => handleMarkSingleRead(item.id, e)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        <Check size={13} /> Đã đọc
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <p className="text-[11px] text-slate-400">
            Hệ thống thông báo thời gian thực • SCRUM-193 Notification Hub
          </p>
        </div>
      </div>
    </div>
  );
}
