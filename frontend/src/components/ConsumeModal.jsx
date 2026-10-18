import { useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2, X, ShoppingCart } from "lucide-react";
import { api } from "../api.js";

export default function ConsumeModal({ batch, onClose, onSuccess }) {
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!batch) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.consumeBatch(batch.id, { note: note.trim() });
      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Không thể xác nhận tiêu thụ lô.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 gaussian-backdrop animate-fade-in">
      <div className="animate-modal-in modal-card-glow relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400">
            <ShoppingCart size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Ghi nhận bán hết / Tiêu thụ
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Đánh dấu lô hàng đã bán lẻ hoặc tiêu thụ hết (S-29)
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 p-3.5 border border-amber-200/80 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Lưu ý nghiệp vụ bất biến:</p>
              <p className="mt-0.5 opacity-90 leading-relaxed">
                Thao tác này sẽ cập nhật số lượng còn lại về <strong>0</strong> và trạng thái thành <strong>Đã tiêu thụ (CONSUMED)</strong>.
                Một sự kiện bất biến sẽ được ghi vào chuỗi Hash SHA-256. Lô đã tiêu thụ sẽ không thể tách, gộp hoặc bàn giao tiếp.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 rounded-xl bg-slate-50 dark:bg-slate-950 p-3 text-xs border border-slate-200/70 dark:border-slate-800">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Mã lô:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">{batch.batch_code || batch.code}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Sản phẩm:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{batch.product_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Khối lượng hiện tại:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {Number(batch.remaining_quantity || 0).toLocaleString()} {batch.product_unit || "kg"}
            </span>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 p-3 text-xs font-medium text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="consume-note" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú tiêu thụ / Kênh bán (Tùy chọn)
            </label>
            <textarea
              id="consume-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Đã bán lẻ hết tại cửa hàng VinMart số 10..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Đang ghi nhận...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Xác nhận tiêu thụ
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
