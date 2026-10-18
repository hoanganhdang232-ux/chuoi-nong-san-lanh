import { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ message, type = "success", title, duration = 4000 }) => {
      const id = Date.now() + Math.random().toString(36).substring(2, 9);
      const newToast = { id, message, type, title, duration };
      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
      return id;
    },
    [removeToast],
  );

  const success = useCallback(
    (message, title = "Thao tác thành công!") =>
      addToast({ message, type: "success", title }),
    [addToast],
  );

  const error = useCallback(
    (message, title = "Có lỗi xảy ra") =>
      addToast({ message, type: "error", title }),
    [addToast],
  );

  const info = useCallback(
    (message, title = "Thông báo") =>
      addToast({ message, type: "info", title }),
    [addToast],
  );

  const warning = useCallback(
    (message, title = "Cảnh báo") =>
      addToast({ message, type: "warning", title }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast, success, error, info, warning }}>
      {children}
      {/* Toast Notification Container (Fixed at top-right) */}
      <div
        aria-live="polite"
        className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm sm:max-w-md w-full px-4 sm:px-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto animate-toast-in flex items-start gap-3.5 p-4 rounded-2xl border shadow-xl backdrop-blur-md transition-all duration-300 ${
              toast.type === "error"
                ? "bg-rose-50/95 dark:bg-rose-950/90 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100 shadow-rose-900/10"
                : toast.type === "warning"
                ? "bg-amber-50/95 dark:bg-amber-950/90 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 shadow-amber-900/10"
                : toast.type === "info"
                ? "bg-sky-50/95 dark:bg-sky-950/90 border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-100 shadow-sky-900/10"
                : "bg-white/95 dark:bg-slate-900/95 border-emerald-300/80 dark:border-emerald-700/80 text-slate-800 dark:text-slate-100 shadow-emerald-950/15"
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                toast.type === "error"
                  ? "bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300"
                  : toast.type === "warning"
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300"
                  : toast.type === "info"
                  ? "bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-300"
                  : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300"
              }`}
            >
              {toast.type === "error" ? (
                <AlertTriangle size={18} />
              ) : toast.type === "warning" ? (
                <AlertTriangle size={18} />
              ) : toast.type === "info" ? (
                <Info size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <h4
                className={`text-xs font-bold uppercase tracking-wider ${
                  toast.type === "error"
                    ? "text-rose-700 dark:text-rose-300"
                    : toast.type === "warning"
                    ? "text-amber-700 dark:text-amber-300"
                    : toast.type === "info"
                    ? "text-sky-700 dark:text-sky-300"
                    : "text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {toast.title}
              </h4>
              <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-200 leading-relaxed break-words">
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
              title="Đóng"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
