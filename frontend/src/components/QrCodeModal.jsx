import { useState, useRef, useEffect } from "react";
import {
  QrCode,
  Download,
  Copy,
  Printer,
  Check,
  ExternalLink,
  X,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "../api.js";

export default function QrCodeModal({ batch, isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("preview"); // 'preview' | 'sticker'
  const [stickerSize, setStickerSize] = useState("70x70"); // '50x50', '70x70', '100x60'
  const [error, setError] = useState("");
  const printAreaRef = useRef(null);

  useEffect(() => {
    if (isOpen && batch?.id) {
      loadQr();
    } else {
      setQrData(null);
      setError("");
    }
  }, [isOpen, batch?.id]);

  const loadQr = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await api.generateBatchQr(batch.id);
      setQrData(data);
    } catch (err) {
      setError(err.message || "Không thể tạo mã QR.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!qrData?.publicUrl) return;
    navigator.clipboard.writeText(qrData.publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPng = () => {
    if (!qrData?.qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrData.qrDataUrl;
    a.download = `QR_${batch.batch_code || qrData.publicCode}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadSvg = () => {
    if (!qrData?.qrSvg) return;
    const blob = new Blob([qrData.qrSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `QR_${batch.batch_code || qrData.publicCode}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400">
              <QrCode size={20} />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Mã QR Truy Xuất Nguồn Gốc Lô
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lô: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{batch?.batch_code}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 pt-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-colors ${
              activeTab === "preview"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            Mã QR điện tử
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sticker")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === "sticker"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            <Printer size={14} />
            In tem dán nhãn bao bì
          </button>
        </div>

        {/* Body content */}
        <div className="py-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500 font-medium">
              <QrCode size={40} className="mx-auto mb-3 animate-pulse text-emerald-500" />
              Đang sinh mã QR chuẩn GS1 & chuỗi khóa...
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 text-sm">
              {error}
            </div>
          ) : qrData ? (
            activeTab === "preview" ? (
              <div className="flex flex-col items-center">
                {/* QR Display Card */}
                <div className="relative p-5 rounded-3xl bg-white border-2 border-emerald-500/30 shadow-lg mb-4 text-center">
                  {qrData.qrDataUrl ? (
                    <img
                      src={qrData.qrDataUrl}
                      alt="Mã QR Truy Xuất"
                      className="w-56 h-56 mx-auto rounded-xl"
                    />
                  ) : null}
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 py-1 px-3 rounded-full border border-emerald-200">
                    <ShieldCheck size={14} />
                    Mã bảo mật: {qrData.publicCode}
                  </div>
                </div>

                {/* Public URL Box */}
                <div className="w-full flex items-center gap-2 p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 mb-4">
                  <input
                    type="text"
                    readOnly
                    value={qrData.publicUrl}
                    className="flex-1 bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 outline-none px-2"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition shadow-2xs shrink-0"
                  >
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    <span>{copied ? "Đã chép" : "Sao chép"}</span>
                  </button>
                  <a
                    href={qrData.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                    title="Mở trang công khai"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>

                {/* Quick actions */}
                <div className="w-full grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadPng}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                  >
                    <Download size={14} /> Tải ảnh PNG (512px)
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSvg}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                  >
                    <Download size={14} /> Tải file vector SVG
                  </button>
                </div>
              </div>
            ) : (
              /* Sticker Print Layout */
              <div className="flex flex-col items-center">
                {/* Size selector */}
                <div className="w-full flex items-center justify-between mb-3 text-xs">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Khổ tem dán:</span>
                  <div className="flex gap-2">
                    {["50x50", "70x70", "100x60"].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setStickerSize(size)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition ${
                          stickerSize === size
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {size} mm
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sticker Printable Preview Box */}
                <div
                  ref={printAreaRef}
                  id="printable-sticker-area"
                  className={`p-4 bg-white text-slate-900 border-2 border-dashed border-emerald-500/50 rounded-2xl shadow-md mx-auto my-2 flex flex-col items-center justify-between text-center ${
                    stickerSize === "50x50"
                      ? "w-64 h-64"
                      : stickerSize === "100x60"
                        ? "w-80 h-52 flex-row text-left px-5"
                        : "w-72 h-72"
                  }`}
                >
                  <div className={stickerSize === "100x60" ? "flex-1 pr-3" : "w-full"}>
                    <div className="flex items-center justify-center gap-1 text-[11px] font-black uppercase tracking-wider text-emerald-800 border-b border-emerald-100 pb-1 mb-1.5">
                      <Sparkles size={12} className="text-emerald-600 shrink-0" />
                      <span>Agritrace • Chuỗi Sạch</span>
                    </div>
                    <h3 className="font-extrabold text-sm text-slate-900 leading-tight">
                      {qrData.productName || batch.product_name}
                    </h3>
                    <p className="font-mono text-[11px] font-bold text-slate-700 mt-0.5">
                      {batch.batch_code}
                    </p>
                    <div className="mt-1 text-[10px] text-slate-600 font-medium">
                      <span>Chuẩn VietGAP / ISO 22005</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center shrink-0">
                    <img
                      src={qrData.qrDataUrl}
                      alt="QR Sticker"
                      className={stickerSize === "50x50" ? "w-28 h-28" : "w-32 h-32"}
                    />
                    <span className="text-[9px] font-mono font-bold text-slate-500 mt-1">
                      Quét tra cứu nguồn gốc
                    </span>
                  </div>
                </div>

                <div className="w-full mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition"
                  >
                    <Printer size={16} /> In tem ngay qua máy in nhãn
                  </button>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
