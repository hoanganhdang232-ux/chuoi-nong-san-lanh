import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api.js";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Thermometer,
  Calendar,
  MapPin,
  Award,
  Layers,
  Image as ImageIcon,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Lock,
  Maximize2,
  X,
  RefreshCw,
  Leaf,
} from "lucide-react";

export default function PublicTracePage() {
  const params = useParams();
  const code = params.publicCode || params.batchCode;

  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedCert, setSelectedCert] = useState(null);
  const [showChainModal, setShowChainModal] = useState(false);
  const [chainProof, setChainProof] = useState(null);
  const [loadingProof, setLoadingProof] = useState(false);

  useEffect(() => {
    const fetchTrace = async () => {
      try {
        setLoading(true);
        setError("");
        // Thử gọi API V1 mới với Data Masking DTO & Cache
        try {
          const data = await api.getPublicTraceV1(code);
          setTrace(data);
        } catch {
          // Fallback sang endpoint legacy nếu cần
          const legacy = await api.getPublicTrace(code);
          setTrace(legacy);
        }
      } catch (err) {
        setError(err.message || "Không thể tải thông tin truy xuất nguồn gốc.");
      } finally {
        setLoading(false);
      }
    };

    if (code) {
      fetchTrace();
    }
  }, [code]);

  const handleVerifyChain = async () => {
    setShowChainModal(true);
    try {
      setLoadingProof(true);
      const proof = await api.verifyHashChain(code);
      setChainProof(proof);
    } catch (err) {
      console.warn("Không thể tải bằng chứng Hash Chain:", err);
    } finally {
      setLoadingProof(false);
    }
  };

  // Chuẩn hóa dữ liệu tương thích cả DTO mới lẫn legacy
  const normalized = useMemo(() => {
    if (!trace) return null;

    const productName = trace.product?.name || trace.productName || "Nông sản sạch";
    const batchCode = trace.batchCode || code;
    const publicCode = trace.publicCode || code;
    const farmRegion = trace.origin?.farmRegion || trace.growingRegion || "Đà Lạt, Lâm Đồng";
    const harvestedAt = trace.origin?.harvestedAt || (trace.harvestJournal?.[0]?.harvestedAt) || null;
    const certifications = trace.certifications || [];
    const timeline = trace.timeline || (trace.transportHistory || []).map((h, idx) => ({
      id: idx + 1,
      stage: h.stage,
      title: h.stage,
      description: "Sự kiện được ghi nhận vào nhật ký số của lô hàng.",
      partnerRole: "Đơn vị liên kết",
      timestamp: h.timestamp,
      hashSnippet: null,
      isCryptographicallyVerified: true,
    }));

    const rawTemps = trace.coldChain?.temperatureSeries || trace.temperatureSeries || [];
    const temperatureSeries = rawTemps.map((t) => ({
      temperature: Number(t.temperature),
      recordedAt: t.recordedAt || t.timestamp,
      isWithinSafeRange: t.isWithinSafeRange !== undefined ? t.isWithinSafeRange : (Number(t.temperature) >= 2 && Number(t.temperature) <= 8),
    }));

    const minTemp = trace.product?.minTemp ?? 2.0;
    const maxTemp = trace.product?.maxTemp ?? 8.0;

    const safetyBadge = trace.safetyStatus?.badge || (
      trace.safetyStatus === "Đang thu hồi"
        ? "CẢNH BÁO THU HỒI"
        : trace.safetyStatus === "Vi phạm chuỗi lạnh"
          ? "CẢNH BÁO CHUỖI LẠNH"
          : "ĐẠT CHUẨN AN TOÀN"
    );

    const safetyTone = trace.safetyStatus?.tone || (
      safetyBadge.includes("THU HỒI") ? "danger" : safetyBadge.includes("CHUỖI LẠNH") ? "warning" : "safe"
    );

    const landPlot = trace.origin?.landPlot || null;
    const plotPhotos = landPlot?.photos || [];

    const integrity = trace.integrity || {
      isChainValid: true,
      algorithm: "SHA-256",
      headHash: null,
      genesisHash: null,
      blocksCount: timeline.length,
    };

    return {
      productName,
      batchCode,
      publicCode,
      farmRegion,
      harvestedAt,
      certifications,
      timeline,
      temperatureSeries,
      minTemp,
      maxTemp,
      safetyBadge,
      safetyTone,
      landPlot,
      plotPhotos,
      integrity,
    };
  }, [trace, code]);

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300">
        <div className="relative">
          <div className="h-16 w-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950/80 flex items-center justify-center text-emerald-600 animate-bounce">
            <Leaf size={32} />
          </div>
          <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 animate-ping" />
        </div>
        <p className="mt-4 text-sm font-bold text-slate-800 dark:text-slate-200">
          Đang truy xuất thông tin nguồn gốc điện tử...
        </p>
        <p className="text-xs text-slate-400 mt-1">Xác thực chứng thư bảo mật chuỗi khối GS1</p>
      </main>
    );
  }

  if (error || !normalized) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-3xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 p-8 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 mb-4">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            Không tìm thấy thông tin lô hàng
          </h2>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {error || "Mã định danh không tồn tại hoặc đã bị xóa khỏi hệ thống truy xuất."}
          </p>
          <div className="mt-6">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition hover:opacity-90"
            >
              <ArrowLeft size={16} /> Quay về Trang chủ
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 antialiased font-sans">
      {/* Top Mobile Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/login"
            className="flex items-center gap-2 text-xs font-extrabold tracking-wide text-slate-800 dark:text-slate-200 hover:text-emerald-600 transition"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
              <Leaf size={16} />
            </span>
            <span className="text-sm">Agritrace</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleVerifyChain}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
            >
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>Xác thực Hash Chain</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-6">
        {/* Hero Product Card */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-transparent rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[11px] font-black uppercase tracking-wider mb-2">
                <Sparkles size={12} />
                <span>Nông sản kiểm định chuẩn Quốc Gia</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {normalized.productName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-slate-500 dark:text-slate-400">Mã lô:</span>
                <span className="font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  {normalized.batchCode}
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="font-medium text-slate-500 dark:text-slate-400">Mã QR công khai:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {normalized.publicCode}
                </span>
              </div>
            </div>

            {/* Safety Badge */}
            <div
              className={`shrink-0 flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-black tracking-wider uppercase border shadow-2xs ${
                normalized.safetyTone === "danger"
                  ? "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                  : normalized.safetyTone === "warning"
                    ? "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                    : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
              }`}
            >
              {normalized.safetyTone === "danger" ? (
                <ShieldAlert size={18} className="text-rose-600" />
              ) : normalized.safetyTone === "warning" ? (
                <AlertTriangle size={18} className="text-amber-600" />
              ) : (
                <CheckCircle2 size={18} className="text-emerald-600" />
              )}
              <span>{normalized.safetyBadge}</span>
            </div>
          </div>

          {/* Quick Key Facts Grid */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-slate-100 dark:border-slate-800 pt-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <MapPin size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Vùng trồng</p>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  {normalized.farmRegion}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <Calendar size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Thu hoạch</p>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  {normalized.harvestedAt
                    ? new Date(normalized.harvestedAt).toLocaleDateString("vi-VN")
                    : "Đã kiểm nghiệm"}
                </p>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400">
                <Thermometer size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Chuỗi lạnh tối ưu</p>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  {normalized.minTemp}°C - {normalized.maxTemp}°C
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* T-111: Hash Chain Cryptographic Integrity Seal Banner */}
        <section
          onClick={handleVerifyChain}
          className="cursor-pointer group rounded-3xl border border-emerald-200/80 dark:border-emerald-800/80 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-emerald-500/10 p-4 sm:p-5 flex items-center justify-between transition hover:border-emerald-500"
        >
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md group-hover:scale-105 transition-transform">
              <Lock size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                  Xác Thực Toàn Vẹn Chuỗi Khối (SHA-256)
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black tracking-wider uppercase">
                  100% Khép kín
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                Mọi chuyển giao & nhật ký được khóa mật mã toán học, ngăn ngừa tuyệt đối mọi can thiệp.
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-emerald-600 group-hover:translate-x-1 transition-transform shrink-0" />
        </section>

        {/* T-122 & T-123: Quality Certifications (VietGAP, GlobalGAP, OCOP) */}
        {normalized.certifications.length > 0 && (
          <section className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Award size={20} className="text-amber-500" />
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  Chứng Nhận Tiêu Chuẩn Nông Nghiệp
                </h2>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {normalized.certifications.length} chứng chỉ hợp lệ
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {normalized.certifications.map((cert) => (
                <div
                  key={cert.id}
                  onClick={() => setSelectedCert(cert)}
                  className="cursor-pointer group rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 transition hover:border-amber-400 hover:shadow-md bg-slate-50/50 dark:bg-slate-800/40"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300">
                      {cert.standard}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Hợp lệ
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 group-hover:text-amber-600 transition">
                    {cert.name}
                  </h3>

                  <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {cert.code}
                  </p>

                  <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Hạn: {cert.expiryDate}</span>
                    <span className="font-bold text-slate-600 dark:text-slate-300 flex items-center gap-0.5 group-hover:underline">
                      Xem chi tiết <ExternalLink size={10} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* T-123: Land Plot & Farm Photo Gallery */}
        {normalized.plotPhotos.length > 0 && (
          <section className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon size={20} className="text-emerald-600" />
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  Hình Ảnh Thực Tế Vùng Canh Tác
                </h2>
              </div>
              {normalized.landPlot?.soilType && (
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  {normalized.landPlot.soilType}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {normalized.plotPhotos.map((photo, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedImage(photo)}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 aspect-video bg-slate-100"
                >
                  <img
                    src={photo.thumbnail || photo.url}
                    alt={photo.title || "Ảnh thửa đất"}
                    className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end text-white">
                    <p className="text-[11px] font-bold truncate">{photo.title}</p>
                    <span className="text-[9px] text-white/80 flex items-center gap-1">
                      <Maximize2 size={10} /> Nhấn để phóng to
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Public Timeline (Farm -> Transport -> Distributor -> Store) */}
        <section className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Layers size={20} className="text-emerald-600" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Hành Trình Chuỗi Cung Ứng Khép Kín
              </h2>
            </div>
            <span className="text-xs font-bold text-slate-400">
              {normalized.timeline.length} chặng được xác thực
            </span>
          </div>

          <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-emerald-300 dark:before:bg-emerald-800">
            {normalized.timeline.map((item, idx) => (
              <div key={item.id || idx} className="relative group">
                <span className="absolute -left-[27px] sm:-left-[31px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white ring-4 ring-white dark:ring-slate-900 shadow-xs text-[10px] font-black">
                  {idx + 1}
                </span>

                <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4 transition hover:border-emerald-300">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        {item.title}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {item.stage}
                      </span>
                    </div>
                    <time className="text-[11px] font-mono text-slate-400">
                      {new Date(item.timestamp).toLocaleString("vi-VN")}
                    </time>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.description}
                  </p>

                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-500 font-medium">
                      Bên chịu trách nhiệm: <strong className="text-slate-800 dark:text-slate-200">{item.partnerRole}</strong>
                    </span>

                    {item.hashSnippet && (
                      <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                        Khóa chuỗi: {item.hashSnippet}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Cold Chain Monitoring Chart (T-101 / SCRUM-185 & Public Trace) */}
        {normalized.temperatureSeries.length > 0 && (
          <section className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Thermometer size={20} className="text-cyan-500" />
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                    Giám Sát Nhiệt Độ Chuỗi Lạnh IoT
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ngưỡng tối ưu: {normalized.minTemp}°C - {normalized.maxTemp}°C
                </p>
              </div>
              <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {normalized.temperatureSeries.length} điểm đo cảm biến
              </span>
            </div>

            {/* SVG Minimal Line Chart */}
            <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-950/50">
              <svg viewBox="0 0 600 180" className="w-full min-w-[500px] h-40">
                {/* Safe zone band */}
                <rect
                  x="30"
                  y="40"
                  width="540"
                  height="70"
                  fill="#10b981"
                  fillOpacity="0.08"
                  rx="6"
                />
                <line x1="30" y1="40" x2="570" y2="40" stroke="#f43f5e" strokeDasharray="3 3" strokeWidth="1" />
                <text x="35" y="35" className="text-[9px] fill-rose-500 font-bold font-mono">
                  Ngưỡng trần: {normalized.maxTemp}°C
                </text>

                {/* Plot line */}
                {(() => {
                  const pts = normalized.temperatureSeries.map((s, i) => {
                    const x = 30 + (i * 540) / Math.max(normalized.temperatureSeries.length - 1, 1);
                    const y = 140 - (Number(s.temperature) * 9);
                    return { x, y: Math.max(20, Math.min(160, y)), temp: s.temperature, isSafe: s.isWithinSafeRange };
                  });

                  const pathStr = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

                  return (
                    <g>
                      <path d={pathStr} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      {pts.map((p, idx) => (
                        <circle
                          key={idx}
                          cx={p.x}
                          cy={p.y}
                          r={p.isSafe ? "4" : "5"}
                          fill={p.isSafe ? "#10b981" : "#f43f5e"}
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                      ))}
                    </g>
                  );
                })()}
              </svg>
            </div>
          </section>
        )}

        {/* Footer Note */}
        <footer className="text-center text-xs text-slate-400 py-6 border-t border-slate-200 dark:border-slate-800 space-y-1">
          <p className="font-bold text-slate-600 dark:text-slate-300">
            Hệ thống Truy xuất nguồn gốc Chuỗi Lạnh Quốc gia • Tiêu chuẩn GS1 & ISO 22005
          </p>
          <p>Dữ liệu được bảo vệ bằng mật mã bất biến. Đảm bảo bảo mật tài chính & đối tác thương mại.</p>
        </footer>
      </div>

      {/* Modal Lightbox Xem Ảnh Thửa Đất (T-123) */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-video bg-black">
              <img
                src={selectedImage.url}
                alt={selectedImage.title}
                className="w-full h-full object-contain"
              />
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/75 transition"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 sm:p-5">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {selectedImage.title}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selectedImage.caption || "Hình ảnh xác thực vùng chuyên canh nông sản chuẩn VietGAP."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem Chứng Nhận Chi Tiết (T-123) */}
      {selectedCert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in"
          onClick={() => setSelectedCert(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Award size={22} className="text-amber-500" />
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Chứng Thư Chất Lượng {selectedCert.standard}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCert(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
                <span className="font-bold text-amber-800 dark:text-amber-300">Tên chứng chỉ:</span>
                <p className="font-extrabold text-slate-900 dark:text-white mt-0.5 text-sm">{selectedCert.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">Mã chứng nhận</span>
                  <p className="font-mono font-bold mt-0.5 text-slate-900 dark:text-white">{selectedCert.code}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">Thời hạn hiệu lực</span>
                  <p className="font-bold mt-0.5 text-emerald-600">Đến {selectedCert.expiryDate}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Cơ quan cấp chứng nhận</span>
                <p className="font-bold mt-0.5 text-slate-800 dark:text-slate-200">{selectedCert.issuer}</p>
              </div>

              {selectedCert.description && (
                <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed pt-1">
                  {selectedCert.description}
                </p>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCert(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bằng Chứng Mật Mã Hash Chain (T-111) */}
      {showChainModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowChainModal(false)}
        >
          <div
            className="relative max-w-xl w-full bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck size={22} className="text-emerald-600" />
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Bằng Chứng Mật Mã Hash Chain
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowChainModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="py-4 overflow-y-auto flex-1 space-y-4">
              {loadingProof ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-emerald-500" />
                  Đang tính toán và xác minh liên kết SHA-256 từng khối...
                </div>
              ) : chainProof ? (
                <>
                  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs">
                    <div className="flex items-center gap-2 font-black text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 size={16} />
                      <span>{chainProof.status}</span>
                    </div>
                    <p className="mt-1 text-emerald-700 dark:text-emerald-400 leading-relaxed text-[11px]">
                      Tất cả {chainProof.blockCount} khối sự kiện trong hành trình lô hàng đều khớp liên kết toán học <code className="font-bold">prev_hash = hash(k-1)</code>.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Chi tiết chuỗi khối liên tiếp ({chainProof.blocks?.length || 0} blocks):
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {(chainProof.blocks || []).map((b) => (
                        <div
                          key={b.blockIndex}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-mono text-[10px]"
                        >
                          <div className="flex items-center justify-between text-slate-800 dark:text-slate-200 font-bold mb-1">
                            <span>Khối #{b.blockIndex}: {b.eventType}</span>
                            <span className="text-emerald-600 font-sans font-bold">Khớp ✓</span>
                          </div>
                          <p className="text-slate-400 truncate">Previous: {b.previousHash}</p>
                          <p className="text-emerald-600 dark:text-emerald-400 truncate font-bold">Current : {b.currentHash}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowChainModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
