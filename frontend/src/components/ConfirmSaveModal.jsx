import { useEffect } from "react";
import { AlertCircle, CheckCircle2, X, FileText } from "lucide-react";

/**
 * Modal Xác nhận lưu thông tin kèm Preview dữ liệu chuẩn SaaS
 * @param {boolean} isOpen - Trạng thái hiển thị modal
 * @param {string} title - Tiêu đề modal (Mặc định: "Xác nhận lưu thông tin")
 * @param {string} subtitle - Phụ đề hướng dẫn
 * @param {object} data - Dữ liệu preview từ form
 * @param {Array<{key: string, label: string, icon?: any, format?: (val: any, data: any) => any}>} schema - Cấu trúc các trường preview
 * @param {Function} onClose - Hàm hủy bỏ / đóng modal
 * @param {Function} onConfirm - Hàm xác nhận lưu
 * @param {boolean} isLoading - Trạng thái đang gọi API lưu
 */
export default function ConfirmSaveModal({
  isOpen,
  title = "Xác nhận lưu thông tin",
  subtitle = "Vui lòng kiểm tra kỹ bản tóm tắt dữ liệu trước khi lưu vào hệ thống",
  data = {},
  schema = [],
  onClose,
  onConfirm,
  isLoading = false,
  confirmText = "Xác nhận lưu",
  icon: HeaderIcon = FileText,
  noticeText = "Dữ liệu sau khi xác nhận sẽ được lưu vào hệ thống và kích hoạt ký băm SHA-256.",
}) {
  // Đóng modal khi bấm phím ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !isLoading) onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "auto";
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* 1. Backdrop Blur làm mờ nền phía sau (Gaussian Blur cao cấp) */}
      <div
        className="gaussian-backdrop fixed inset-0 animate-fade-in"
        onClick={!isLoading ? onClose : undefined}
      />

      {/* 2. Hộp thoại Modal chính (Fade-in & Scale-up - Mở rộng kích thước rộng rãi hơn) */}
      <div className="animate-modal-in modal-card-glow relative w-full max-w-2xl rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden transition-all">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-7 py-5 bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 shadow-2xs">
              <HeaderIcon size={22} />
            </span>
            <div>
              <h3 id="confirm-modal-title" className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body: Preview dữ liệu người dùng vừa nhập - Thoáng đãng, rõ nét */}
        <div className="max-h-[65vh] overflow-y-auto px-7 py-6">
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-5 space-y-4">
            {schema.map(({ key, label, format, icon: FieldIcon }) => {
              const rawValue = data?.[key];
              const displayValue = format ? format(rawValue, data) : (rawValue ?? "—");

              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-6 border-b border-slate-200/50 dark:border-slate-800/60 pb-3 last:border-0 last:pb-0"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 min-w-[130px]">
                    {FieldIcon && <FieldIcon size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />}
                    {label}:
                  </span>
                  <span className="text-right text-sm font-semibold text-slate-900 dark:text-slate-100 break-all font-mono">
                    {displayValue}
                  </span>
                </div>
              );
            })}
          </div>

          {noticeText && (
            <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 p-3.5 text-xs text-amber-800 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/50">
              <AlertCircle size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="leading-relaxed">{noticeText}</span>
            </div>
          )}
        </div>

        {/* Footer: 2 nút hành động (Hủy bỏ & Xác nhận lưu) */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/80 px-7 py-4.5 rounded-b-3xl">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-400 transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-950/20 hover:from-emerald-700 hover:to-teal-700 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {isLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
