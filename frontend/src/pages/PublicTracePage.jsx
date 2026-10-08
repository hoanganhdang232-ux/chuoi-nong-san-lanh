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
      <p className="py-10 text-center text-sm text-slate-500">
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

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[560px] w-full"
        role="img"
        aria-label="Biểu đồ nhiệt độ chuỗi lạnh"
      >
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
              strokeWidth="1"
            />
          );
        })}
        <line
          x1={padding}
          x2={width - padding}
          y1={thresholdY}
          y2={thresholdY}
          stroke="#e11d48"
          strokeDasharray="6 6"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#047857"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {values.map((value, index) => {
          const [cx, cy] = points.split(" ")[index].split(",");
          return (
            <circle
              key={`${readings[index].timestamp}-${index}`}
              cx={cx}
              cy={cy}
              r="4"
              fill="#047857"
            >
              <title>{`${value}°C · ${new Date(readings[index].timestamp).toLocaleString("vi-VN")}`}</title>
            </circle>
          );
        })}
        <text x={padding} y={18} fill="#64748b" fontSize="12">
          °C · Ngưỡng cảnh báo 8°C
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

  if (loading)
    return (
      <main className="min-h-screen p-8 text-center text-slate-500">
        Đang tải hồ sơ truy xuất...
      </main>
    );
  if (error)
    return (
      <main className="min-h-screen p-8 text-center text-rose-700">
        {error}
      </main>
    );

  const unsafe = trace.safetyStatus !== "Chưa ghi nhận cảnh báo";
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <a
            href="/login"
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-emerald-700"
          >
            <ArrowLeft size={18} /> Agritrace
          </a>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Hồ sơ công khai
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
        <section className="border-b border-slate-200 pb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
            Truy xuất nguồn gốc
          </p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-bold sm:text-4xl">
                {trace.productName}
              </h1>
              <p className="mt-2 text-slate-600">Mã lô {trace.batchCode}</p>
            </div>
            <div
              className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${unsafe ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}
            >
              {unsafe ? <ShieldAlert size={19} /> : <CheckCircle2 size={19} />}
              {trace.safetyStatus}
            </div>
          </div>
        </section>

        <section className="grid gap-8 border-b border-slate-200 py-8 sm:grid-cols-2">
          <div className="flex items-start gap-4">
            <span className="rounded-lg bg-emerald-100 p-3 text-emerald-800">
              <Leaf size={22} />
            </span>
            <div>
              <h2 className="font-semibold">Vùng trồng</h2>
              <p className="mt-1 text-slate-600">
                {trace.growingRegion || "Chưa cập nhật"}
              </p>
            </div>
          </div>
          <div>
            <h2 className="font-semibold">Nhật ký thu hoạch</h2>
            {trace.harvestJournal.length ? (
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {trace.harvestJournal.map((entry, index) => (
                  <li key={`${entry.harvestedAt}-${index}`}>
                    {new Date(entry.harvestedAt).toLocaleString("vi-VN")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Chưa có nhật ký thu hoạch.
              </p>
            )}
          </div>
        </section>

        <section className="grid gap-8 border-b border-slate-200 py-8 sm:grid-cols-2">
          <div>
            <h2 className="font-semibold">Lịch sử vận chuyển</h2>
            {trace.transportHistory.length ? (
              <ol className="mt-4 space-y-4 border-l border-emerald-200 pl-4">
                {trace.transportHistory.map((item, index) => (
                  <li key={`${item.timestamp}-${index}`} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-600" />
                    <p className="font-medium">{item.stage}</p>
                    <time className="text-sm text-slate-500">
                      {new Date(item.timestamp).toLocaleString("vi-VN")}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Chưa có lịch sử vận chuyển.
              </p>
            )}
          </div>
          <div className="flex items-start gap-4">
            <span className="rounded-lg bg-cyan-100 p-3 text-cyan-800">
              <Thermometer size={22} />
            </span>
            <div>
              <h2 className="font-semibold">Giám sát chuỗi lạnh</h2>
              <p className="mt-1 text-sm text-slate-600">
                Dữ liệu nhiệt độ theo thời gian; ngưỡng cảnh báo trên 8°C liên
                tục quá 30 phút.
              </p>
            </div>
          </div>
        </section>

        <section className="pt-8">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="font-semibold">Biểu đồ nhiệt độ</h2>
            <span className="text-xs text-slate-500">
              {trace.temperatureSeries.length} mẫu cảm biến
            </span>
          </div>
          <TemperatureChart readings={trace.temperatureSeries} />
        </section>
        <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Hồ sơ công khai không hiển thị giá, khối lượng giao dịch nội bộ, đối
          tác hoặc dữ liệu cá nhân.
        </footer>
      </div>
    </main>
  );
}
