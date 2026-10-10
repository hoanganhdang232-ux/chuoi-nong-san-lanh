import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api.js";
import NationalHeader from "../components/NationalHeader.jsx";
import {
  ArrowLeft,
  CheckCircle2,
  ShieldAlert,
  Thermometer,
  MapPin,
  Calendar,
  Building2,
  QrCode,
  Download,
  Printer,
  ChevronRight,
  ShieldCheck,
  Truck,
  Sprout,
  Store,
} from "lucide-react";

function TemperatureChart({ readings }) {
  if (!readings || readings.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
        Chưa có dữ liệu cảm biến nhiệt độ ghi nhận cho lô hàng này.
      </div>
    );
  }

  const width = 760;
  const height = 200;
  const padding = 32;
  const values = readings.map((reading) => Number(reading.temperature));
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(12, ...values);

  const points = values
    .map((value, index) => {
      const x =
        padding +
        (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y =
        height -
        padding -
        ((value - minimum) * (height - padding * 2)) / (maximum - minimum || 1);
      return `${x},${y}`;
    })
    .join(" ");

  const threshold8Y =
    height -
    padding -
    ((8 - minimum) * (height - padding * 2)) / (maximum - minimum || 1);

  const threshold2Y =
    height -
    padding -
    ((2 - minimum) * (height - padding * 2)) / (maximum - minimum || 1);

  return (
    <div className="overflow-x-auto bg-white p-4 rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Biểu đồ giám sát nhiệt độ cảm biến IoT</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-brand-600 inline-block"></span> Nhiệt độ thực tế
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t border-dashed border-rose-500 inline-block"></span> Ngưỡng cảnh báo (8°C)
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[540px]"
        role="img"
        aria-label="Biểu đồ nhiệt độ chuỗi lạnh"
      >
        {/* Horizontal grid lines */}
        {[0, 1, 2, 3].map((line) => {
          const y = padding + (line * (height - padding * 2)) / 3;
          return (
            <line
              key={line}
              x1={padding}
              x2={width - padding}
              y1={y}
              y2={y}
              stroke="#f1f5f9"
              strokeWidth="1"
            />
          );
        })}

        {/* 8°C Threshold line */}
        <line
          x1={padding}
          x2={width - padding}
          y1={threshold8Y}
          y2={threshold8Y}
          stroke="#f43f5e"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <text x={width - padding + 5} y={threshold8Y + 4} fill="#f43f5e" fontSize="10" fontWeight="bold">
          8°C
        </text>

        {/* Temperature curve */}
        <polyline
          points={points}
          fill="none"
          stroke="#16a34a"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {values.map((value, index) => {
          const point = points.split(" ")[index];
          if (!point) return null;
          const [cx, cy] = point.split(",");
          const isOver = value > 8;
          return (
            <circle
              key={`${readings[index].timestamp}-${index}`}
              cx={cx}
              cy={cy}
              r="4"
              fill={isOver ? "#f43f5e" : "#16a34a"}
              stroke="#ffffff"
              strokeWidth="1.5"
            >
              <title>{`${value}°C lúc ${new Date(readings[index].timestamp).toLocaleString("vi-VN")}`}</title>
            </circle>
          );
        })}

        <text x={padding} y={16} fill="#64748b" fontSize="11">
          Nhiệt độ (°C) — Dải an toàn: 2°C đến 8°C
        </text>
      </svg>
    </div>
  );
}

export default function PublicTracePage() {
  const { batchCode } = useParams();
  const [trace, setTrace] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPublicTrace(batchCode)
      .then(setTrace)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [batchCode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <NationalHeader />
        <main className="flex-1 max-w-4xl mx-auto w-full p-8 text-center text-slate-500">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-brand-800 border-r-transparent mb-4"></div>
          <p className="font-semibold text-slate-700">Đang tra cứu hồ sơ truy xuất nguồn gốc...</p>
          <p className="text-xs text-slate-500 mt-1">Đang kiểm tra chữ ký điện tử và chuỗi sự kiện Blockchain</p>
        </main>
      </div>
    );
  }

  if (error || !trace) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <NationalHeader />
        <main className="flex-1 max-w-xl mx-auto w-full p-8 text-center">
          <div className="bg-white p-8 rounded-xl border border-rose-200 shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-4">
              <ShieldAlert size={28} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Không tìm thấy mã truy xuất</h2>
            <p className="text-sm text-slate-600 mb-6">
              Mã lô hàng <strong>{batchCode}</strong> không tồn tại trên hệ thống hoặc chưa được công khai.
            </p>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-800 hover:bg-brand-900 text-white font-semibold rounded-lg text-sm shadow transition-all"
            >
              <ArrowLeft size={16} /> Quay lại trang tra cứu
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const isViolated = trace.safetyStatus !== "Chưa ghi nhận cảnh báo";
  const harvestInfo = trace.harvestJournal?.[0];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <NationalHeader />

      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 flex-1">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-brand-800 transition-colors"
          >
            <ArrowLeft size={16} /> Quay lại trang tra cứu
          </Link>
          <button
            onClick={() => window.print()}
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
          >
            <Printer size={14} /> In hồ sơ xác thực
          </button>
        </div>

        {/* Official Certificate Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          {/* Certificate Header Banner */}
          <div className="bg-brand-900 text-white p-6 border-b border-brand-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 block mb-1">
                  HỒ SƠ ĐIỆN TỬ XÁC THỰC QUỐC GIA
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                  {trace.productName}
                </h1>
                <div className="text-xs text-brand-100 font-mono mt-1">
                  Mã định danh lô: <span className="text-white font-bold">{trace.batchCode}</span>
                </div>
              </div>

              {/* Status Badge */}
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm ${
                  isViolated
                    ? "bg-rose-100 text-rose-800 border border-rose-300"
                    : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                }`}
              >
                {isViolated ? <ShieldAlert size={20} className="text-rose-700" /> : <CheckCircle2 size={20} className="text-emerald-700" />}
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-500">Trạng thái chất lượng</div>
                  <div>{trace.safetyStatus}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Key Details Grid */}
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
                <MapPin size={20} />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Vùng trồng / Xuất xứ</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {trace.growingRegion || "Vùng trồng Tây Nguyên"}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-800 shrink-0">
                <Calendar size={20} />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Thời điểm thu hoạch</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {harvestInfo?.harvestedAt
                    ? new Date(harvestInfo.harvestedAt).toLocaleDateString("vi-VN")
                    : "Đã xác nhận thu hoạch"}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-800 shrink-0">
                <ShieldCheck size={20} />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Bảo vệ tính toàn vẹn</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  SHA-256 Hash Chain
                </div>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-8">
            {/* 1. Cold Chain Temperature Chart */}
            <section>
              <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Thermometer size={18} className="text-brand-700" />
                Giám sát nhiệt độ chuỗi lạnh liên tục (IoT)
              </h2>
              <TemperatureChart readings={trace.temperatureSeries || []} />
            </section>

            {/* 2. Supply Chain Journey (Timeline) */}
            <section>
              <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Truck size={18} className="text-brand-700" />
                Hành trình chuỗi cung ứng đã xác thực
              </h2>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {(trace.transportHistory && trace.transportHistory.length > 0) ? (
                  trace.transportHistory.map((item, index) => (
                    <div key={index} className="relative flex items-start gap-3">
                      <div className="absolute -left-6 top-1 h-5 w-5 rounded-full border-2 border-white bg-brand-700 shadow-sm flex items-center justify-center text-white text-[10px]">
                        ✓
                      </div>
                      <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 w-full">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <span className="font-bold text-slate-900 text-sm">{item.stage}</span>
                          <span className="text-xs text-slate-500">
                            {new Date(item.timestamp).toLocaleString("vi-VN")}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500 italic">
                    Chưa có lịch sử di chuyển ghi nhận.
                  </div>
                )}
              </div>
            </section>

            {/* 3. Electronic Stamp & Legal Notice */}
            <div className="rounded-lg bg-emerald-50/60 p-4 border border-emerald-200 text-xs text-emerald-950 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-emerald-900 text-sm">
                  <CheckCircle2 size={16} /> Chứng nhận Truy xuất Nguồn gốc Hợp lệ
                </div>
                <p className="text-slate-600">
                  Dữ liệu được lưu trữ phân tán và mã hoá theo công nghệ Hash Chain. Bất kỳ sự can thiệp hoặc thay đổi dữ liệu nào đều sẽ bị phát hiện tự động.
                </p>
              </div>
              <div className="shrink-0 text-center font-mono text-[10px] p-2 bg-white rounded border border-emerald-200">
                <div className="font-bold text-slate-800">QR VERIFIED</div>
                <div className="text-slate-500">{trace.batchCode}</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
