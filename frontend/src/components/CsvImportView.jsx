import { useState, useRef } from "react";
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  HelpCircle,
  FileCheck,
} from "lucide-react";
import { api } from "../api.js";
import { useToast } from "../context/ToastContext.jsx";

const SAMPLE_PRODUCTS_CSV = `name,unit
Thanh long ruột đỏ,kg
Sầu riêng Ri6,kg
Bơ booth Đắk Lắk,kg
Xoài cát Hòa Lộc,kg`;

const SAMPLE_LAND_PLOTS_CSV = `name,area_ha,latitude,longitude
Nông trường Đơn Dương Lô A,3.5,11.8354,108.5298
Vườn Sầu Riêng Krông Pắc 01,5.2,12.7123,108.2845
Trang trại Cam Sành Cần Thơ,2.8,10.0452,105.7469`;

export default function CsvImportView({ onImportSuccess }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("products"); // 'products' | 'land-plots'
  const [file, setFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const fileInputRef = useRef(null);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setFile(null);
    setFileContent("");
    setResult(null);
    setErrorDetails(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.size > 5 * 1024 * 1024) {
      const err = {
        message: "Kích thước file vượt quá giới hạn cho phép (tối đa 5MB).",
        errors: [],
      };
      setErrorDetails(err);
      toast.error(err.message);
      return;
    }

    setFile(selectedFile);
    setErrorDetails(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      setFileContent(event.target.result || "");
    };
    reader.readAsText(selectedFile);
  };

  const handleDownloadSample = () => {
    const content =
      activeTab === "products" ? SAMPLE_PRODUCTS_CSV : SAMPLE_LAND_PLOTS_CSV;
    const filename =
      activeTab === "products"
        ? "sample_products.csv"
        : "sample_land_plots.csv";

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    toast.info(`Đã tải xuống file mẫu ${filename}`);
  };

  const handleUpload = async () => {
    if (!file || !fileContent) {
      toast.warning("Vui lòng chọn một file CSV trước khi tải lên.");
      setErrorDetails({
        message: "Vui lòng chọn một file CSV trước khi tải lên.",
        errors: [],
      });
      return;
    }

    setIsSubmitting(true);
    setErrorDetails(null);
    setResult(null);

    try {
      let res;
      if (activeTab === "products") {
        res = await api.importProductsCsv(fileContent);
      } else {
        res = await api.importLandPlotsCsv(fileContent);
      }
      setResult(res);
      setFile(null);
      setFileContent("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      toast.success(res.message || "Nhập dữ liệu thành công!");
      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err) {
      const errMsg = err.data?.error || err.message || "Quá trình nhập dữ liệu thất bại.";
      if (err.data && (err.data.errors || err.data.error)) {
        setErrorDetails({
          message: errMsg,
          errors: err.data.errors || [],
          totalRows: err.data.total_rows,
        });
      } else {
        setErrorDetails({
          message: errMsg,
          errors: [],
        });
      }
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 card-shadow border border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Nhập danh mục từ File CSV
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hỗ trợ nhập hàng loạt Sản phẩm & Thửa đất với cơ chế giao dịch All-or-Nothing
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadSample}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
          >
            <Download size={14} />
            Tải file mẫu ({activeTab === "products" ? "Sản phẩm" : "Thửa đất"})
          </button>
        </div>

        {/* Tab switcher */}
        <div className="mt-6 flex border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => handleTabChange("products")}
            className={`pb-3 text-xs font-bold transition-all mr-6 border-b-2 cursor-pointer ${
              activeTab === "products"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            1. Danh mục Sản phẩm (Products)
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("land-plots")}
            className={`pb-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === "land-plots"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            2. Thửa đất canh tác (Land Plots)
          </button>
        </div>

        {/* Format guidelines */}
        <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <HelpCircle size={16} className="text-cyan-600 dark:text-cyan-400 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100">Cấu trúc cột bắt buộc:</span>{" "}
              {activeTab === "products" ? (
                <>
                  <code className="rounded bg-slate-200/80 dark:bg-slate-800 px-1 py-0.5 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    name
                  </code>{" "}
                  (Tên sản phẩm),{" "}
                  <code className="rounded bg-slate-200/80 dark:bg-slate-800 px-1 py-0.5 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    unit
                  </code>{" "}
                  (Đơn vị tính, mặc định: kg).
                </>
              ) : (
                <>
                  <code className="rounded bg-slate-200/80 dark:bg-slate-800 px-1 py-0.5 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    name
                  </code>{" "}
                  (Tên thửa đất),{" "}
                  <code className="rounded bg-slate-200/80 dark:bg-slate-800 px-1 py-0.5 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    area_ha
                  </code>{" "}
                  (Diện tích hecta &gt; 0),{" "}
                  <code className="rounded bg-slate-200/80 dark:bg-slate-800 px-1 py-0.5 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    latitude
                  </code>
                  ,{" "}
                  <code className="rounded bg-slate-200/80 dark:bg-slate-800 px-1 py-0.5 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    longitude
                  </code>{" "}
                  (Tọa độ GPS thập phân).
                </>
              )}
            </div>
          </div>
        </div>

        {/* Upload Dropzone */}
        <div className="mt-6">
          <div className="flex justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 px-6 pt-6 pb-6 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition">
            <div className="text-center">
              <Upload className="mx-auto h-10 w-10 text-slate-400" />
              <div className="mt-3 flex text-xs text-slate-600 dark:text-slate-300 justify-center">
                <label
                  htmlFor="file-upload"
                  className="relative cursor-pointer rounded-md font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 focus-within:outline-none"
                >
                  <span>Chọn file từ máy tính</span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />
                </label>
                <p className="pl-1">hoặc kéo thả vào đây</p>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Chỉ chấp nhận định dạng .CSV (Tối đa 5MB)
              </p>
            </div>
          </div>

          {file && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-950/50 p-3 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-2">
                <FileCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold">{file.name}</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setFileContent("");
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="font-bold text-slate-500 hover:text-rose-600 cursor-pointer"
              >
                Hủy file
              </button>
            </div>
          )}
        </div>

        {/* Submit button */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={!file || isSubmitting}
            onClick={handleUpload}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Đang xử lý giao dịch...
              </>
            ) : (
              <>
                <Upload size={16} />
                Tiến hành nạp dữ liệu
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Notification Result */}
      {result && (
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 p-6 border border-emerald-200 dark:border-emerald-800 animate-fadeIn">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                Giao dịch thành công (Atomic Commit)
              </h3>
              <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
                {result.message}
              </p>
              <div className="mt-3 flex gap-4 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <div>
                  Tổng số dòng xử lý:{" "}
                  <span className="font-mono font-bold">{result.total_rows}</span>
                </div>
                <div>
                  Bản ghi tạo mới:{" "}
                  <span className="font-mono font-bold">
                    {result.created_count || result.count}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Details (All-or-Nothing rollback summary) */}
      {errorDetails && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/50 p-6 border border-rose-200 dark:border-rose-800 animate-fadeIn">
          <div className="flex items-start gap-3">
            <XCircle size={24} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                Nhập dữ liệu không thành công — Đã hoàn tác toàn bộ (Rollback)
              </h3>
              <p className="mt-1 text-xs text-rose-800 dark:text-rose-300">
                {errorDetails.message}
              </p>

              {errorDetails.errors && errorDetails.errors.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900">
                  <div className="bg-rose-100/60 dark:bg-rose-900/40 px-4 py-2 text-xs font-bold text-rose-900 dark:text-rose-200 border-b border-rose-200 dark:border-rose-800">
                    Chi tiết các dòng không hợp lệ ({errorDetails.errors.length} lỗi)
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-rose-100 dark:divide-rose-900/30">
                    {errorDetails.errors.map((item, idx) => (
                      <div
                        key={idx}
                        className="px-4 py-2.5 text-xs flex items-center justify-between gap-4"
                      >
                        <span className="font-mono font-bold text-rose-700 dark:text-rose-400 shrink-0">
                          Dòng {item.row}:
                        </span>
                        <span className="text-slate-600 dark:text-slate-300 flex-1">
                          {item.error}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
