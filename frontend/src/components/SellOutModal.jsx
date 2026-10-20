import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, X, CheckCircle2, ShieldAlert, Package } from "lucide-react";
import { api } from "../api.js";

const STATUS_LABELS = {
  registered: { label: "Đã đăng ký", color: "bg-slate-100 text-slate-700 border-slate-200" },
  pending_confirmation: { label: "Chờ bàn giao", color: "bg-amber-50 text-amber-800 border-amber-300" },
  processed: { label: "Đã sơ chế", color: "bg-blue-50 text-blue-700 border-blue-200" },
  in_transit: { label: "Đang vận chuyển", color: "bg-orange-50 text-orange-800 border-orange-200" },
  delivered: { label: "Đã giao nhận", color: "bg-emerald-50 text-emerald-800 border-emerald-300" },
  recalled: { label: "Thu hồi", color: "bg-rose-50 text-rose-800 border-rose-300" },
  consumed: { label: "Đã tiêu thụ", color: "bg-slate-100 text-slate-600 border-slate-200" },
  sold_out: { label: "Đã bán hết", color: "bg-purple-50 text-purple-800 border-purple-300" },
};

export default function SellOutModal({ isOpen, batch, onClose, onSuccess, onError }) {
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Reset modal state whenever opened for a new batch
  useEffect(() => {
    if (isOpen) {
      setConfirmed(false);
      setIsSubmitting(false);
      setErrorMessage("");
    }
  }, [isOpen, batch]);

  if (!isOpen || !batch) return null;

  const statusInfo = STATUS_LABELS[batch.status] || {
    label: batch.status || "Chưa xác định",
    color: "bg-slate-100 text-slate-700 border-slate-200",
  };

  const remainingQty = Number(batch.remaining_quantity ?? 0);
  const unit = batch.product_unit || "kg";

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!confirmed || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await api.sellOutLot(batch.id);

      // Successfully updated to sold_out (200 OK)
      const updatedLot = response?.lot || response?.data || {
        ...batch,
        status: "sold_out",
        remaining_quantity: 0,
      };

      if (onSuccess) {
        onSuccess(updatedLot, "Xác nhận bán hết lô hàng thành công!");
      }
      onClose();
    } catch (error) {
      console.error("Sell-out failed:", error);
      let message = "Đã xảy ra lỗi khi xác nhận bán hết lô hàng.";

      if (error.status === 403) {
        message = "Bạn không có quyền thực hiện thao tác này.";
      } else if (error.status === 400) {
        message = "Lô hàng không hợp lệ hoặc đã ở trạng thái sold_out.";
      } else if (error.message) {
        message = error.message;
      }

      setErrorMessage(message);
      if (onError) {
        onError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sell-out-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 sm:p-7 shadow-2xl ring-1 ring-slate-900/10 transition-all transform animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Đóng"
          className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition disabled:opacity-40"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 ring-8 ring-amber-50">
            <AlertTriangle size={24} className="stroke-[2.2]" />
          </div>
          <div className="pr-6">
            <h3 id="sell-out-modal-title" className="text-xl font-bold text-slate-900">
              Xác nhận bán hết lô hàng
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Vui lòng rà soát kỹ thông tin lô hàng trước khi xác nhận. Sau khi hoàn tất, hệ thống sẽ chuyển trạng thái sang <span className="font-semibold text-purple-700">Đã bán hết (sold_out)</span> và đồng bộ chuỗi hash truy xuất nguồn gốc.
            </p>
          </div>
        </div>

        {/* Batch Info Card (Thẻ thông tin lô hàng) */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-emerald-600" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Thông tin lô hàng
              </span>
            </div>
            {batch.product_name && (
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                {batch.product_name}
              </span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Mã lô (Batch ID) */}
            <div className="rounded-xl bg-white p-3 border border-slate-100 shadow-2xs">
              <span className="block text-[11px] font-medium text-slate-500">
                Mã lô (Batch ID)
              </span>
              <span className="mt-1 block font-mono text-xs font-bold text-slate-900 break-all">
                {batch.batch_code || `LOT-${batch.id}`}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">ID: #{batch.id}</span>
            </div>

            {/* Trạng thái hiện tại */}
            <div className="rounded-xl bg-white p-3 border border-slate-100 shadow-2xs">
              <span className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Trạng thái hiện tại
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {statusInfo.label}
              </span>
            </div>

            {/* Số lượng còn lại */}
            <div className="rounded-xl bg-white p-3 border border-slate-100 shadow-2xs">
              <span className="block text-[11px] font-medium text-slate-500">
                Số lượng còn lại
              </span>
              <span className="mt-1 block font-mono text-base font-black text-slate-900">
                {remainingQty.toLocaleString()}{" "}
                <span className="text-xs font-medium text-slate-500">{unit}</span>
              </span>
            </div>
          </div>

          {batch.current_location && (
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Điểm lưu kho / phân phối:</span>
              <span className="font-medium text-slate-700">{batch.current_location}</span>
            </div>
          )}
        </div>

        {/* Error Message Box */}
        {errorMessage && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs font-medium text-rose-800 animate-in fade-in duration-150"
          >
            <ShieldAlert size={18} className="text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Confirmation Checkbox */}
        <label
          htmlFor="sell-out-checkbox"
          className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition select-none ${
            confirmed
              ? "border-emerald-300 bg-emerald-50/50 ring-2 ring-emerald-500/20"
              : "border-slate-200 bg-slate-50/80 hover:bg-slate-100/70"
          }`}
        >
          <input
            id="sell-out-checkbox"
            type="checkbox"
            checked={confirmed}
            disabled={isSubmitting}
            onChange={(e) => {
              setConfirmed(e.target.checked);
              if (errorMessage) setErrorMessage("");
            }}
            className="mt-0.5 h-4.5 w-4.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
          />
          <div className="text-xs sm:text-sm font-medium text-slate-800 leading-snug">
            Tôi xác nhận lô hàng này đã bán hết thực tế cho người tiêu dùng.
          </div>
        </label>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition disabled:opacity-40"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!confirmed || isSubmitting}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
              confirmed && !isSubmitting
                ? "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-600/20 cursor-pointer"
                : "bg-slate-300 cursor-not-allowed opacity-60"
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>Xác nhận</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
