import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import {
  ArrowLeft,
  CheckCircle2,
  Leaf,
  ShieldAlert,
  Thermometer,
} from "lucide-react";

function TemperatureChart({ readings }) {
  if (readings.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        Chưa có dữ liệu cảm biến.
      </p>
    );
  }
  const width = 760;
  const height = 220;
  const padding = 28;
  const values = readings.map((reading) => Number(reading.temperature));
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(10, ...values);
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
  const thresholdY =
    height -
    padding -
    ((8 - minimum) * (height - padding * 2)) / (maximum - minimum || 1);

  const areaPoints = `${points} ${width - padding},${height - padding} ${padding},${height - padding}`;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[560px] w-full"
        role="img"
        aria-label="Biểu đồ nhiệt độ chuỗi lạnh"
      >
        <defs>
          <linearGradient id="tempAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((line) => {
          const y = padding + (line * (height - padding * 2)) / 3;
          return (
            <line
              key={line}
              x1={padding}
              x2={width - padding}
              y1={y}
              y2={y}
              stroke="#e2e8f0"
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeWidth="1.5"
            />
          );
        })}

        {/* Warning threshold line */}
        <line
          x1={padding}
          x2={width - padding}
          y1={thresholdY}
          y2={thresholdY}
          stroke="#f43f5e"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />

        {/* Area fill */}
        <polygon points={areaPoints} fill="url(#tempAreaGradient)" />

        {/* Temperature line */}
        <polyline
          points={points}
          fill="none"
          stroke="#059669"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {values.map((value, index) => {
          const [cx, cy] = points.split(" ")[index].split(",");
          const isWarning = value > 8;
          return (
            <g key={index}>
              <circle
                cx={cx}
                cy={cy}
                r={isWarning ? "5.5" : "4"}
                fill={isWarning ? "#f43f5e" : "#10b981"}
                stroke="#ffffff"
                strokeWidth="2"
              />
              <text
                x={cx}
                y={Number(cy) - 9}
                textAnchor="middle"
                className={`text-[10px] font-mono font-bold ${
                  isWarning ? "fill-rose-500 font-extrabold" : "fill-slate-600 dark:fill-slate-300"
                }`}
              >
                {value}°C
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function PublicTracePage() {
  const { batchCode } = useParams();
  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchTrace = async () => {
      try {
        const data = await api.getPublicTrace(batchCode);
        setTrace(data);
      } catch (traceError) {
        setError(traceError.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTrace();
  }, [batchCode]);

  if (loading)
    return (
      <main className="min-h-screen flex items-center justify-center p-8 text-center text-slate-500 font-medium">
        Đang tải thông tin nguồn gốc điện tử...
      </main>
    );

  if (error)
    return (
      <main className="min-h-screen flex items-center justify-center p-8 text-center text-rose-700 font-medium bg-slate-50 dark:bg-slate-950">
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 p-6 max-w-md shadow-xl">
          <ShieldAlert className="mx-auto text-rose-600 mb-2" size={32} />
          <p>{error}</p>
        </div>
      </main>
    );

  const unsafe = trace.safetyStatus !== "Chưa ghi nhận cảnh báo";
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16 antialiased transition-colors">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <a
            href="/login"
            className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 transition hover:text-emerald-600"
          >
            <ArrowLeft size={18} /> Agritrace
          </a>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                Hồ sơ công khai
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
        {/* Hero Card */}
        <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 card-shadow mb-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <span className="inline-block text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
                Chứng thư nguồn gốc điện tử
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {trace.productName}
              </h1>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Mã định danh lô:</span>
                <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  {trace.batchCode}
                </span>
              </div>
            </div>
            <div
              className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold shadow-xs border ${
                unsafe
                  ? "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                  : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
              }`}
            >
              {unsafe ? <ShieldAlert size={20} className="text-rose-600" /> : <CheckCircle2 size={20} className="text-emerald-600" />}
              {trace.safetyStatus}
            </div>
          </div>
        </div>

        {/* Region & Harvest Grid */}
        <div className="grid gap-6 sm:grid-cols-2 mb-8">
          <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 card-shadow">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400">
                <Leaf size={22} />
              </span>
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Vùng trồng nông sản</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 font-medium">
                  {trace.growingRegion || "Chưa cập nhật"}
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 size={13} /> Khai báo tọa độ định vị
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 card-shadow">
            <h2 className="font-bold text-slate-900 dark:text-white mb-3">Nhật ký thu hoạch</h2>
            {trace.harvestJournal.length ? (
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300 font-medium">
                {trace.harvestJournal.map((entry, index) => (
                  <li key={`${entry.harvestedAt}-${index}`} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>{new Date(entry.harvestedAt).toLocaleString("vi-VN")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">
                Chưa có nhật ký thu hoạch.
              </p>
            )}
          </div>
        </div>

        {/* Transport & Cold Chain Section */}
        <div className="grid gap-6 sm:grid-cols-2 mb-8">
          <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 card-shadow">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Lịch sử vận chuyển & bàn giao</h2>
            {trace.transportHistory.length ? (
              <ol className="space-y-4 border-l-2 border-emerald-300 dark:border-emerald-700 ml-2 pl-4">
                {trace.transportHistory.map((item, index) => (
                  <li key={`${item.timestamp}-${index}`} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full bg-emerald-600 ring-4 ring-white dark:ring-slate-900 shadow-xs" />
                    <p className="font-bold text-slate-900 dark:text-white text-sm">{item.stage}</p>
                    <time className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      {new Date(item.timestamp).toLocaleString("vi-VN")}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-400">
                Chưa có lịch sử vận chuyển.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 card-shadow">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400">
                <Thermometer size={22} />
              </span>
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Giám sát chuỗi lạnh IoT</h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                  Cảm biến IoT ghi nhận nhiệt độ thời gian thực. Ngưỡng cảnh báo tự động kích hoạt khi nhiệt độ vượt 8°C liên tục quá 30 phút.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Temperature Chart Section */}
        <section className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 card-shadow">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">Biểu đồ giám sát nhiệt độ chuỗi lạnh</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Dữ liệu ghi nhận từ cảm biến nhiệt trên thùng vận chuyển</p>
            </div>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
              {trace.temperatureSeries.length} mẫu cảm biến
            </span>
          </div>
          <TemperatureChart readings={trace.temperatureSeries} />
        </section>

        <footer className="mt-8 border-t border-slate-200 dark:border-slate-800 pt-5 text-center text-xs text-slate-500 dark:text-slate-400">
          Hồ sơ công khai tuân thủ tiêu chuẩn an toàn thực phẩm. Không hiển thị giá, khối lượng giao dịch nội bộ hoặc dữ liệu đối tác.
        </footer>
      </div>
    </main>
  );
}
