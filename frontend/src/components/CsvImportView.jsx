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
      setErrorDetails({
        message: "Kích thước file vượt quá giới hạn cho phép (tối đa 5MB).",
        errors: [],
      });
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
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = async () => {
    if (!fileContent.trim()) {
      setErrorDetails({
        message: "Vui lòng chọn một file CSV hợp lệ có dữ liệu.",
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
      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err) {
      if (err.data && (err.data.errors || err.data.error)) {
        setErrorDetails({
          message: err.data.error || err.message,
          errors: err.data.errors || [],
          totalRows: err.data.total_rows,
        });
      } else {
        setErrorDetails({
          message: err.message || "Quá trình nhập dữ liệu thất bại.",
          errors: [],
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl bg-white p-6 card-shadow border border-slate-200/80">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Nhập danh mục từ File CSV (S-32)
              </h2>
              <p className="text-xs text-slate-500">
                Hỗ trợ nhập hàng loạt Sản phẩm & Thửa đất với cơ chế giao dịch All-or-Nothing
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadSample}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <Download size={14} />
            Tải file mẫu ({activeTab === "products" ? "Sản phẩm" : "Thửa đất"})
          </button>
        </div>

        {/* Tab switcher */}
        <div className="mt-6 flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => handleTabChange("products")}
            className={`pb-3 text-xs font-bold transition-all mr-6 border-b-2 ${
              activeTab === "products"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            1. Danh mục Sản phẩm (Products)
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("land-plots")}
            className={`pb-3 text-xs font-bold transition-all border-b-2 ${
              activeTab === "land-plots"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            2. Danh mục Thửa đất (Land Plots)
          </button>
        </div>
      </div>

      {/* Rules Notice */}
      <div className="rounded-2xl bg-cyan-50/60 p-4 border border-cyan-200/80 text-xs text-cyan-900">
        <div className="flex items-start gap-2.5">
          <HelpCircle size={18} className="text-cyan-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Quy tắc All-or-Nothing trong 1 Database Transaction:</p>
            <p className="text-cyan-800">
              Toàn bộ dữ liệu trong file được kiểm tra chặt chẽ. Nếu phát hiện <strong>bất kỳ dòng nào sai định dạng</strong> (thiếu trường, sai kiểu số, tọa độ không hợp lệ),
              hệ thống sẽ <strong>hủy bỏ toàn bộ quá trình (Rollback)</strong> và trả về bảng báo cáo lỗi chi tiết (Số dòng + Cột + Lý do) để bạn chỉnh sửa.
            </p>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {result && (
        <div className="rounded-2xl bg-emerald-50 p-5 border border-emerald-200 text-xs text-emerald-900">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">
                Nhập dữ liệu thành công!
              </p>
              <p className="mt-1">
                Đã thêm mới thành công <strong>{result.inserted}</strong> bản ghi vào hệ thống trong 1 Transaction an toàn.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Details Breakdown */}
      {errorDetails && (
        <div className="rounded-2xl bg-rose-50 p-5 border border-rose-200 text-xs text-rose-900">
          <div className="flex items-start gap-3">
            <XCircle size={22} className="text-rose-600 shrink-0" />
            <div className="w-full">
              <p className="text-sm font-bold text-rose-800">
                Giao dịch bị từ chối (Transaction Rollbacked)
              </p>
              <p className="mt-1 font-medium">{errorDetails.message}</p>

              {errorDetails.errors && errorDetails.errors.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-xl border border-rose-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-rose-100/70 font-bold uppercase tracking-wider text-rose-800 text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Dòng (Row)</th>
                        <th className="px-3 py-2">Cột (Col)</th>
                        <th className="px-3 py-2">Trường (Field)</th>
                        <th className="px-3 py-2">Nguyên nhân lỗi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100">
                      {errorDetails.errors.map((err, i) => (
                        <tr key={i} className="hover:bg-rose-50/50">
                          <td className="px-3 py-2 font-mono font-bold text-rose-900">
                            #{err.row}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {err.col || "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-800">
                            {err.field || "—"}
                          </td>
                          <td className="px-3 py-2 text-rose-700">
                            {err.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload Box */}
      <div className="rounded-2xl bg-white p-6 card-shadow border border-slate-200/80">
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center hover:border-emerald-400 transition-colors bg-slate-50/40">
          <Upload size={40} className="text-slate-400 mb-3" />
          <h4 className="text-sm font-bold text-slate-800">
            Chọn tệp CSV để tải lên
          </h4>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            Kéo thả tệp CSV vào đây hoặc bấm để chọn tệp từ máy tính. Kích thước tối đa: 5MB.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="mt-4 block text-xs text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
          />

          {file && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 border border-emerald-200">
              <FileCheck size={16} />
              <span>
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </span>
            </div>
          )}
        </div>

        {/* Preview of file */}
        {fileContent && (
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-700">
                Nội dung xem trước (Preview):
              </span>
              <span>{fileContent.trim().split("\n").length} dòng</span>
            </div>
            <pre className="max-h-40 overflow-auto rounded-xl bg-slate-900 p-3.5 font-mono text-xs text-emerald-300">
              {fileContent.split("\n").slice(0, 10).join("\n")}
              {fileContent.split("\n").length > 10 ? "\n..." : ""}
            </pre>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleImport}
            disabled={!file || isSubmitting}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 transition"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Đang kiểm tra & Thực thi Transaction...
              </>
            ) : (
              <>
                <Upload size={16} />
                Bắt đầu Nhập dữ liệu (Atomic Import)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
