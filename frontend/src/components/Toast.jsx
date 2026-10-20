import { useEffect } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

/**
 * Toast Notification nổi góc trên bên phải
 * @param {string} message - Nội dung thông báo
 * @param {string} tone - "success" | "error"
 * @param {boolean} isOpen - Trạng thái hiển thị
 * @param {Function} onClose - Hàm đóng toast
 * @param {number} duration - Thời gian hiển thị (ms)
 */
export default function Toast({
  message,
  tone = "success",
  isOpen,
  onClose,
  duration = 3500,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [isOpen, duration, onClose]);

  if (!isOpen || !message) return null;

  const isError = tone === "error";

  return (
    <div
      role="alert"
      className={`animate-toast-in fixed top-5 right-5 z-50 flex items-center gap-3 rounded-2xl border p-4 shadow-xl min-w-[320px] max-w-md ${
        isError
          ? "border-rose-200 bg-rose-50/95 text-rose-900 shadow-rose-950/10"
          : "border-emerald-200/90 bg-white/95 text-slate-800 shadow-emerald-950/10 backdrop-blur-md"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          isError ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
        }`}
      >
        {isError ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
      </span>
      <div className="min-w-0 flex-1 pr-2">
        <h4
          className={`text-[11px] font-bold uppercase tracking-wider ${
            isError ? "text-rose-800" : "text-emerald-800"
          }`}
        >
          {isError ? "Có lỗi xảy ra" : "Thao tác thành công"}
        </h4>
        <p className="mt-0.5 text-xs font-semibold leading-snug break-words">
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
      >
        <X size={16} />
      </button>
    </div>
  );
}
