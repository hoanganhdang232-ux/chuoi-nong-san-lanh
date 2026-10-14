import { useEffect } from "react";
import { CheckCircle2, AlertTriangle, XCircle, X, Info } from "lucide-react";

export default function Toast({ message, type = "success", onClose, duration = 4000 }) {
  useEffect(() => {
    if (!duration) return;
    const timer = setTimeout(() => {
      onClose?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const config = {
    success: {
      bg: "bg-emerald-900/95 text-white border-emerald-500/40 shadow-emerald-950/20",
      iconBg: "bg-emerald-500/20 text-emerald-400",
      icon: CheckCircle2,
      badge: "Thành công",
    },
    error: {
      bg: "bg-rose-900/95 text-white border-rose-500/40 shadow-rose-950/20",
      iconBg: "bg-rose-500/20 text-rose-400",
      icon: XCircle,
      badge: "Lỗi",
    },
    warning: {
      bg: "bg-amber-900/95 text-white border-amber-500/40 shadow-amber-950/20",
      iconBg: "bg-amber-500/20 text-amber-400",
      icon: AlertTriangle,
      badge: "Cảnh báo",
    },
    info: {
      bg: "bg-slate-900/95 text-white border-slate-700 shadow-slate-950/20",
      iconBg: "bg-slate-700/50 text-slate-300",
      icon: Info,
      badge: "Thông tin",
    },
  }[type] || {
    bg: "bg-emerald-900/95 text-white border-emerald-500/40 shadow-emerald-950/20",
    iconBg: "bg-emerald-500/20 text-emerald-400",
    icon: CheckCircle2,
    badge: "Thành công",
  };

  const Icon = config.icon;

  return (
    <div
      role="alert"
      className={`fixed top-5 right-5 z-50 flex items-start gap-3.5 max-w-md w-[calc(100vw-2.5rem)] sm:w-auto rounded-2xl border p-4 shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${config.bg}`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${config.iconBg}`}>
        <Icon size={20} />
      </div>

      <div className="flex-1 pt-0.5 min-w-0 pr-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">
            {config.badge}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-medium leading-snug break-words">
          {message}
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng thông báo"
        className="shrink-0 -mr-1 -mt-1 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}
