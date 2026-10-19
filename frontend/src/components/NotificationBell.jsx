import { useState, useEffect, useRef } from "react";
import { Bell, Siren, CheckCircle2, AlertTriangle, Info, Check, RefreshCw } from "lucide-react";
import { api } from "../api.js";
import { useToast } from "../context/ToastContext.jsx";

export default function NotificationBell({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const { addToast } = useToast() || {};

  // Fetch danh sách thông báo
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await api.getNotificationsV1(30);
      if (res) {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch (err) {
      console.warn("Không thể tải thông báo:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user]);

  // Lắng nghe SSE real-time stream để cập nhật thông báo ngay lập tức
  useEffect(() => {
    let eventSource;
    try {
      const sseUrl = "/api/v1/recalls/stream";
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "RECALL_INITIATED" || data.type === "RECALL_CONFIRMED") {
            // Khi có lệnh thu hồi hoặc xác nhận niêm phong mới, cập nhật danh sách
            fetchNotifications();
            if (addToast) {
              addToast({
                title: data.type === "RECALL_INITIATED" ? "LỆNH THU HỒI KHẨN CẤP" : "NIÊM PHONG LÔ THÀNH CÔNG",
                message: data.message || `Lệnh thu hồi đối với lô ${data.rootBatchCode || ""}`,
                tone: data.type === "RECALL_INITIATED" ? "error" : "success",
              });
            }
          }
        } catch (e) {
          console.error("Lỗi parse SSE message:", e);
        }
      };

      eventSource.onerror = () => {
        // Tránh log spam nếu ngắt kết nối
      };
    } catch (err) {
      console.warn("SSE không khả dụng:", err.message);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [addToast]);

  // Xử lý click ra ngoài để đóng dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Đánh dấu 1 tin đã đọc
  const handleMarkRead = async (notifId, e) => {
    e?.stopPropagation();
    try {
      await api.markNotificationRead(notifId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: 1 } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Lỗi đánh dấu đã đọc:", err);
    }
  };

  // Đánh dấu tất cả đã đọc
  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Lỗi đánh dấu tất cả đã đọc:", err);
    }
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case "recall":
      case "RECALL_INITIATED":
        return <Siren size={18} className="text-rose-600 shrink-0" />;
      case "quarantine":
      case "RECALL_CONFIRMED":
        return <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />;
      case "warning":
        return <AlertTriangle size={18} className="text-amber-600 shrink-0" />;
      default:
        return <Info size={18} className="text-cyan-600 shrink-0" />;
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="relative inline-block z-50" ref={dropdownRef}>
      {/* Nút Bell */}
      <button
        type="button"
        id="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
        title="Thông báo hệ thống"
      >
        <Bell size={20} className={unreadCount > 0 ? "animate-wiggle text-rose-600" : ""} />
        {unreadCount > 0 && (
          <span
            id="notification-unread-badge"
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-black text-white ring-2 ring-white dark:ring-slate-900 animate-pulse shadow-md"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          id="notification-dropdown-panel"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-0 shadow-2xl z-[100] overflow-hidden backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Thông báo hệ thống
              </h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 px-2 py-0.2 text-[10px] font-bold">
                  {unreadCount} mới
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  title="Đánh dấu đã đọc tất cả"
                >
                  <Check size={14} />
                  <span>Đọc tất cả</span>
                </button>
              )}
              <button
                type="button"
                onClick={fetchNotifications}
                disabled={loading}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md"
                title="Làm mới"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* List items */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                <Bell size={32} className="mx-auto mb-2 opacity-30" />
                <p>Không có thông báo nào</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                  className={`flex items-start gap-3 p-3.5 transition-colors cursor-pointer ${
                    notif.is_read
                      ? "bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40 opacity-75"
                      : "bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-l-4 border-rose-500 font-medium"
                  }`}
                >
                  <div className="mt-0.5">{getNotifIcon(notif.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {notif.title}
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatTime(notif.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                      {notif.message}
                    </p>
                  </div>
                  {!notif.is_read && (
                    <button
                      type="button"
                      onClick={(e) => handleMarkRead(notif.id, e)}
                      className="mt-1 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 p-1"
                      title="Đánh dấu đã đọc"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 bg-slate-50/50 dark:bg-slate-900/50 text-center">
            <span className="text-[11px] text-slate-400">
              Giám sát chuỗi lạnh & Cảnh báo thu hồi nông sản
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
