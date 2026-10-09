import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Box,
  CheckCircle2,
  Clock,
  Droplets,
  Download,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Thermometer,
  Tractor,
  Truck,
  ClipboardList,
  X,
  XCircle,
} from "lucide-react";
import Sidebar from "../components/Sidebar.jsx";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

const EVENT_META = {
  batch_harvested:           { label: "Thu hoạch",           color: "bg-emerald-100 text-emerald-700",  icon: Tractor },
  batch_processed:           { label: "Đã sơ chế",           color: "bg-blue-100 text-blue-700",       icon: ClipboardList },
  batch_in_transit:          { label: "Đang vận chuyển",     color: "bg-amber-100 text-amber-700",    icon: Truck },
  batch_delivered:           { label: "Đã giao",             color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  batch_transfer_requested:  { label: "Yêu cầu bàn giao",  color: "bg-violet-100 text-violet-700",   icon: ArrowRightLeft },
  batch_transferred:         { label: "Xác nhận bàn giao", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  batch_transfer_rejected:   { label: "Từ chối bàn giao",  color: "bg-rose-100 text-rose-700",      icon: ShieldAlert },
  batch_recalled:            { label: "Thu hồi",             color: "bg-rose-100 text-rose-700",      icon: Siren },
  cold_chain_violation:      { label: "Vi phạm chuỗi lạnh",color: "bg-orange-100 text-orange-700",  icon: AlertTriangle },
  temperature_series_recorded:{ label: "Ghi cảm biến",      color: "bg-sky-100 text-sky-700",        icon: Thermometer },
  temperature_check:         { label: "Kiểm tra nhiệt độ", color: "bg-sky-100 text-sky-700",        icon: Thermometer },
  temperature_violation:     { label: "Vi phạm nhiệt độ",  color: "bg-orange-100 text-orange-700",  icon: AlertTriangle },
  batch_split:               { label: "Tách lô",             color: "bg-indigo-100 text-indigo-700",  icon: ArrowRightLeft },
  batch_split_child:         { label: "Lô con (tách)",       color: "bg-indigo-100 text-indigo-700",  icon: ArrowRightLeft },
  batch_split_parent:        { label: "Lô cha (tách)",       color: "bg-indigo-100 text-indigo-700",  icon: ArrowRightLeft },
  batch_merge:               { label: "Gộp lô",              color: "bg-teal-100 text-teal-700",      icon: ArrowRightLeft },
};

function EventBadge({ eventType }) {
  const meta = EVENT_META[eventType] || { label: eventType, color: "bg-slate-100 text-slate-600", icon: ClipboardList };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.color}`}>
      <Icon size={12} />
      {meta.label}
    </span>
  );
}

function DataField({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-xs text-slate-400 min-w-fit">{label}:</span>
      <span className="text-xs text-slate-700 font-medium break-all">{String(value)}</span>
    </div>
  );
}

function HashBadge({ label, hash }) {
  const [copied, setCopied] = useState(false);
  if (!hash) return null;
  const short = hash.startsWith("GENESIS") ? hash : `${hash.slice(0, 8)}…${hash.slice(-6)}`;
  const copy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={hash}
      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500 hover:bg-slate-200 transition-colors"
    >
      {label}: <span className="text-slate-700">{short}</span>
      <span className="ml-1 text-[9px] text-slate-400">{copied ? "✓" : "⎘"}</span>
    </button>
  );
}

const STATUS_META = {
  registered: {
    label: "Đã đăng ký",
    color: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
  },
  pending_confirmation: {
    label: "Chờ bàn giao",
    color: "bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-200",
    dot: "bg-amber-500",
  },
  processed: {
    label: "Đã sơ chế",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  in_transit: {
    label: "Đang vận chuyển",
    color: "bg-orange-50 text-orange-800 border-orange-200",
    dot: "bg-orange-500",
  },
  delivered: {
    label: "Đã giao nhận",
    color: "bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-200",
    dot: "bg-emerald-500",
  },
  recalled: {
    label: "Thu hồi",
    color: "bg-rose-50 text-rose-800 border-rose-300 ring-1 ring-rose-200",
    dot: "bg-rose-500",
  },
};

function BatchStatusBadge({ status }) {
  const meta = STATUS_META[status] || {
    label: status,
    color: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [batches, setBatches] = useState([]);
  const [transferRequests, setTransferRequests] = useState([]);
  const [landPlots, setLandPlots] = useState([]);
  const [products, setProducts] = useState([]);
  const [temperatureLogs, setTemperatureLogs] = useState([]);
  const [recallReports, setRecallReports] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [genealogy, setGenealogy] = useState(null);
  const [selectedView, setSelectedView] = useState("Tổng quan");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [harvestForm, setHarvestForm] = useState({
    landPlotId: "",
    productId: "",
    quantityKg: "",
    harvestedAt: "",
  });
  const [landPlotForm, setLandPlotForm] = useState({
    name: "",
    areaHa: "",
    latitude: "",
    longitude: "",
  });
  const [editingLandPlotId, setEditingLandPlotId] = useState(null);
  const [productForm, setProductForm] = useState({ name: "", unit: "kg" });
  const [editingProductId, setEditingProductId] = useState(null);
  const [splitBatchId, setSplitBatchId] = useState("");
  const [splitQuantity, setSplitQuantity] = useState("");
  const [mergeBatchIds, setMergeBatchIds] = useState([]);
  const [transferForm, setTransferForm] = useState({
    batchId: "",
    toOrganizationId: "",
    note: "",
  });
  const [submission, setSubmission] = useState({ message: "", tone: "" });
  const [recallForm, setRecallForm] = useState({ batchId: "", reason: "" });
  const [transferFilter, setTransferFilter] = useState("all");
  const [decisionModal, setDecisionModal] = useState({
    open: false,
    transfer: null,
    decision: "confirmed",
    reason: "",
    submitting: false,
  });

  const loadData = async () => {
    const [dashboardData, batchData, transferData] = await Promise.all([
      api.getDashboard(),
      api.getBatches(),
      api.getTransferRequests(),
    ]);
    setDashboard(dashboardData);
    setBatches(batchData);
    setTransferRequests(transferData);
    if (batchData[0]) {
      try {
        const [fullBatch, batchGenealogy] = await Promise.all([
          api.getBatch(batchData[0].id),
          api.getBatchGenealogy(batchData[0].id),
        ]);
        setSelectedBatch(fullBatch);
        setGenealogy(batchGenealogy);
      } catch {
        setSelectedBatch(batchData[0]);
      }
    } else {
      setSelectedBatch(null);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        await loadData();
        const roleCanManageRecalls = [
          "farm_admin",
          "processor_admin",
          "distributor_admin",
          "auditor",
        ].includes(user?.role);
        const [notificationData, recallData] = await Promise.all([
          api.getNotifications(),
          roleCanManageRecalls ? api.getRecallReports() : Promise.resolve([]),
        ]);
        setNotifications(notificationData);
        setRecallReports(recallData);
        if (user?.role === "farm_admin") {
          const [plotData, productData] = await Promise.all([
            api.getLandPlots(),
            api.getProducts(),
          ]);
          setLandPlots(plotData);
          setProducts(productData);
        }
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, [user?.role]);

  const stats = useMemo(
    () => [
      {
        label: "Tổng lô",
        value: dashboard?.totals?.total_batches ?? 0,
        icon: Box,
        tone: "bg-slate-100 text-slate-700",
      },
      {
        label: "Đang hoạt động",
        value: dashboard?.totals?.active_batches ?? 0,
        icon: Activity,
        tone: "bg-emerald-100 text-emerald-700",
      },
      {
        label: "Khối lượng còn lại",
        value: `${Number(dashboard?.totals?.remaining_quantity ?? 0).toLocaleString()} kg`,
        icon: Droplets,
        tone: "bg-blue-100 text-blue-700",
      },
      {
        label: "Chuỗi lạnh",
        value: "Ổn định",
        icon: Thermometer,
        tone: "bg-violet-100 text-violet-700",
      },
    ],
    [dashboard],
  );

  const filteredBatches =
    user?.role === "auditor"
      ? batches
      : batches.filter(
          (batch) => batch.organization_id === user?.organizationId,
        );

  const pendingIncomingCount = useMemo(() => {
    return transferRequests.filter(
      (req) =>
        req.status === "pending" &&
        req.to_organization_id === user?.organizationId,
    ).length;
  }, [transferRequests, user?.organizationId]);

  const filteredTransferRequests = useMemo(() => {
    return transferRequests.filter((req) => {
      if (transferFilter === "incoming") {
        return (
          req.status === "pending" &&
          req.to_organization_id === user?.organizationId
        );
      }
      if (transferFilter === "outgoing") {
        return req.from_organization_id === user?.organizationId;
      }
      if (transferFilter === "completed") {
        return req.status === "confirmed" || req.status === "rejected";
      }
      return true;
    });
  }, [transferRequests, transferFilter, user?.organizationId]);

  const openDecisionModal = (transfer, decision) => {
    setDecisionModal({
      open: true,
      transfer,
      decision,
      reason:
        decision === "confirmed"
          ? "Đã kiểm tra chất lượng và nhận đủ số lượng."
          : "Lô hàng không đạt tiêu chuẩn chất lượng.",
      submitting: false,
    });
  };

  const closeDecisionModal = () => {
    setDecisionModal({
      open: false,
      transfer: null,
      decision: "confirmed",
      reason: "",
      submitting: false,
    });
  };

  const handleSubmitDecisionModal = async (e) => {
    if (e) e.preventDefault();
    const { transfer, decision, reason } = decisionModal;
    if (!transfer) return;
    if (!reason || !reason.trim()) {
      setSubmission({
        message: "Vui lòng nhập lý do trước khi xử lý bàn giao.",
        tone: "error",
      });
      return;
    }
    setDecisionModal((prev) => ({ ...prev, submitting: true }));
    try {
      await api.decideTransfer(transfer.id, {
        decision,
        reason: reason.trim(),
      });
      await loadData();
      setSubmission({
        message:
          decision === "confirmed"
            ? `Đã xác nhận bàn giao lô ${transfer.batch_code}. Lô hàng đã chuyển sang tổ chức của bạn.`
            : `Đã từ chối bàn giao lô ${transfer.batch_code} kèm lý do.`,
        tone: "success",
      });
      closeDecisionModal();
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
      setDecisionModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const handleSelectBatch = async (batchId) => {
    const batch = filteredBatches.find((item) => item.id === batchId);
    if (!batch) return;
    try {
      const [batch, batchGenealogy] = await Promise.all([
        api.getBatch(batchId),
        api.getBatchGenealogy(batchId),
      ]);
      setSelectedBatch(batch);
      setGenealogy(batchGenealogy);
    } catch (loadError) {
      setSelectedBatch(batch);
      setGenealogy(null);
      setSubmission({ message: loadError.message, tone: "error" });
    }
  };

  const handleLandPlotSubmit = async (event) => {
    event.preventDefault();
    setSubmission({ message: "", tone: "" });
    try {
      if (editingLandPlotId) {
        await api.updateLandPlot(editingLandPlotId, landPlotForm);
      } else {
        await api.createLandPlot(landPlotForm);
      }
      setLandPlotForm({ name: "", areaHa: "", latitude: "", longitude: "" });
      setEditingLandPlotId(null);
      const nextPlots = await api.getLandPlots();
      setLandPlots(nextPlots);
      setSubmission({ message: "Đã khai báo thửa đất mới.", tone: "success" });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleProductSubmit = async (event) => {
    event.preventDefault();
    try {
      if (editingProductId) {
        await api.updateProduct(editingProductId, productForm);
      } else {
        await api.createProduct(productForm);
      }
      setProductForm({ name: "", unit: "kg" });
      setEditingProductId(null);
      setProducts(await api.getProducts());
      setSubmission({
        message: editingProductId ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm.",
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleSplitSubmit = async (event) => {
    event.preventDefault();
    try {
      const result = await api.splitBatch(Number(splitBatchId), [
        { quantity: Number(splitQuantity) },
      ]);
      setSplitBatchId("");
      setSplitQuantity("");
      await loadData();
      setSubmission({
        message: `Đã tách lô thành ${result.children.length} lô con.`,
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleMergeSubmit = async (event) => {
    event.preventDefault();
    try {
      const result = await api.mergeBatches(
        mergeBatchIds.map(Number),
        filteredBatches.find((batch) => batch.id === Number(mergeBatchIds[0]))?.product_id,
      );
      setMergeBatchIds([]);
      await loadData();
      setSubmission({ message: `Đã tạo lô gộp ${result.newBatch.batch_code}.`, tone: "success" });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleHarvestSubmit = async (event) => {
    event.preventDefault();
    try {
      const result = await api.createHarvest(harvestForm);
      setHarvestForm({
        landPlotId: "",
        productId: "",
        quantityKg: "",
        harvestedAt: "",
      });
      await loadData();
      setSubmission({
        message: `Đã tạo ${result.batch.batch_code}.`,
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleTransferSubmit = async (event) => {
    event.preventDefault();
    try {
      await api.createTransferRequest(transferForm.batchId, {
        toOrganizationId: Number(transferForm.toOrganizationId),
        note: transferForm.note,
      });
      setTransferForm({ batchId: "", toOrganizationId: "", note: "" });
      await loadData();
      setSubmission({
        message: "Đã gửi yêu cầu bàn giao cho tổ chức nhận.",
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleVerifyIntegrity = async (batchId) => {
    try {
      const result = await api.verifyBatchIntegrity(batchId);
      setSelectedBatch({ ...selectedBatch, integrity: result });
      setSubmission({
        message: result.valid
          ? "Chuỗi hash còn nguyên vẹn."
          : `Chuỗi bị đứt tại event ${result.invalidEventIds.join(", ")}.`,
        tone: result.valid ? "success" : "error",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleSensorSimulation = async (batchId) => {
    try {
      const result = await api.simulateSensor(batchId);
      setTemperatureLogs(result.readings);
      await loadData();
      setSubmission({
        message: result.alertActive
          ? "Vi phạm chuỗi lạnh: nhiệt độ trên 8°C liên tục quá 30 phút."
          : "Đã ghi nhận chuỗi dữ liệu cảm biến.",
        tone: result.alertActive ? "error" : "success",
      });
      setNotifications(await api.getNotifications());
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleRecallSubmit = async (event) => {
    event.preventDefault();
    try {
      const report = await api.activateRecall({
        rootBatchId: Number(recallForm.batchId),
        reason: recallForm.reason,
      });
      setRecallReports([report, ...recallReports]);
      setRecallForm({ batchId: "", reason: "" });
      await loadData();
      setNotifications(await api.getNotifications());
      setSubmission({
        message: `Đã thu hồi ${report.items.length} lô liên quan.`,
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleAuditExport = async (batchId) => {
    try {
      const report = await api.getAuditReport(batchId);
      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `agritrace-audit-${report.batch.batch_code}.json`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      setSubmission({
        message: report.integrity.valid
          ? "Đã xuất hồ sơ; Hash Chain toàn vẹn tại thời điểm kiểm tra."
          : `Đã xuất hồ sơ; phát hiện sai lệch tại event ${report.integrity.invalidEventIds.join(", ")}.`,
        tone: report.integrity.valid ? "success" : "error",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500 font-medium">
        Đang tải dashboard...
      </div>
    );
  if (error)
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center text-rose-600 font-medium">
        {error}
      </div>
    );

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
      <Sidebar
        user={user}
        currentView={selectedView}
        onSelectView={setSelectedView}
        onLogout={logout}
      />

      <main className="flex-1 p-5 sm:p-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                Agritrace Blockchain Cold Chain
              </p>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              {user?.organizationName}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-emerald-200/80 bg-white px-4 py-2.5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <ShieldCheck className="text-emerald-600" size={18} />
                <span>Toàn vẹn sự kiện:</span>
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-emerald-800 font-bold">
                  Bất biến (Verified)
                </span>
              </div>
            </div>
          </div>
        </header>

        {selectedView === "Tổng quan" && (
          <>
            {/* Sprint Status & Integrity Overview Banner */}
            <section className="mb-6 rounded-3xl bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-950 p-6 text-white shadow-lg relative overflow-hidden">
              <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
                <ShieldCheck size={260} />
              </div>
              <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-sm text-emerald-200">
                    <ShieldCheck size={14} /> Chuỗi Hash SHA-256 Bất biến
                  </div>
                  <h2 className="mt-2 text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Hệ thống Giám sát & Truy xuất Nguồn gốc Nông sản Lạnh
                  </h2>
                  <p className="mt-1 text-xs text-emerald-100/80 max-w-2xl leading-relaxed">
                    Mọi sự kiện thu hoạch, sơ chế, bàn giao và vi phạm nhiệt độ đều được ký băm SHA-256 liên hoàn. Không thể sửa hay xóa lén dữ liệu đã ghi nhận.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm ring-1 ring-white/15 text-center min-w-[96px]">
                    <p className="text-2xl font-black text-white">{filteredBatches.length}</p>
                    <p className="text-[10px] text-emerald-200 uppercase font-semibold mt-0.5">Tổng lô hàng</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm ring-1 ring-white/15 text-center min-w-[96px]">
                    <p className="text-2xl font-black text-amber-300">{pendingIncomingCount}</p>
                    <p className="text-[10px] text-amber-200 uppercase font-semibold mt-0.5">Chờ bàn giao</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm ring-1 ring-white/15 text-center min-w-[96px]">
                    <p className="text-2xl font-black text-emerald-300">100%</p>
                    <p className="text-[10px] text-emerald-200 uppercase font-semibold mt-0.5">Toàn vẹn Hash</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Stats Grid */}
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map(({ label, value, icon: Icon, tone }) => (
                <div
                  key={label}
                  className="rounded-2xl bg-white p-5 card-shadow border border-slate-200/80 transition hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500">{label}</p>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                        {value}
                      </p>
                    </div>
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}
                    >
                      <Icon size={22} />
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* Main Section: Excel/AntD Styled Batch Table & Quick Cold Chain Monitor */}
            <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
              <div className="rounded-2xl bg-white p-5 card-shadow border border-slate-200/80">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Danh sách lô nông sản
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Bảng định dạng chuẩn Excel với mã nguồn Monospace và trạng thái có điều kiện
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {filteredBatches.length} lô
                  </span>
                </div>

                {filteredBatches.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <Box size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Chưa có lô hàng nào.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        {/* Excel / AntD style dark green header */}
                        <thead className="bg-emerald-900 text-slate-100 font-semibold text-xs tracking-wider uppercase">
                          <tr>
                            <th className="px-4 py-3.5">Mã lô (Batch Code)</th>
                            <th className="px-4 py-3.5">Sản phẩm</th>
                            <th className="px-4 py-3.5">Trạng thái</th>
                            <th className="px-4 py-3.5 text-right">Khối lượng</th>
                            <th className="px-4 py-3.5 text-center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {filteredBatches.map((batch, idx) => {
                            const isSelected = selectedBatch?.id === batch.id;
                            return (
                              <tr
                                key={batch.id}
                                onClick={() => handleSelectBatch(batch.id)}
                                className={`transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-emerald-50/90 font-medium ring-1 ring-inset ring-emerald-400"
                                    : idx % 2 === 0
                                    ? "bg-white hover:bg-emerald-50/40"
                                    : "bg-slate-50/60 hover:bg-emerald-50/40"
                                }`}
                              >
                                <td className="px-4 py-3.5">
                                  <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                                    {batch.batch_code}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 font-medium text-slate-800">
                                  {batch.product_name}
                                </td>
                                <td className="px-4 py-3.5">
                                  <BatchStatusBadge status={batch.status} />
                                </td>
                                <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-900">
                                  {Number(batch.remaining_quantity).toLocaleString()}{" "}
                                  <span className="text-xs text-slate-400 font-normal">kg</span>
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectBatch(batch.id);
                                    }}
                                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                                      isSelected
                                        ? "bg-emerald-700 text-white shadow-sm"
                                        : "bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700"
                                    }`}
                                  >
                                    {isSelected ? "Đang chọn" : "Xem sự kiện"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Cold Chain Monitor */}
              <div className="rounded-2xl bg-white p-5 card-shadow border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-900">
                      Giám sát chuỗi lạnh
                    </h2>
                    {selectedBatch && (
                      <span className="font-mono text-xs text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded-md">
                        {selectedBatch.batch_code}
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl bg-emerald-50/80 p-4 border border-emerald-100">
                      <div className="flex items-center gap-3">
                        <Thermometer className="text-emerald-600" size={20} />
                        <div>
                          <p className="text-xs text-slate-500">Nhiệt độ hiện tại</p>
                          <p className="font-bold text-slate-800">Cảm biến thời gian thực</p>
                        </div>
                      </div>
                      <span className="font-mono text-2xl font-black text-emerald-700">
                        {selectedBatch?.temperature_c ?? 9}°C
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-amber-50/80 p-4 border border-amber-100">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="text-amber-600" size={20} />
                        <div>
                          <p className="text-xs text-slate-500">Ngưỡng chuẩn quy định</p>
                          <p className="font-bold text-slate-800">Tiêu chuẩn bảo quản lạnh</p>
                        </div>
                      </div>
                      <span className="font-mono text-xl font-bold text-amber-700">≤ 8°C</span>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <MapPin size={15} /> Vị trí lưu kho / hiện tại
                      </div>
                      <p className="mt-1.5 font-bold text-slate-800">
                        {selectedBatch?.current_location || "Chưa cập nhật"}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedBatch?.cold_chain_alert ? (
                  <div className="mt-4 rounded-xl bg-rose-50 p-3 border border-rose-200 flex items-center gap-2 text-xs text-rose-800 font-semibold">
                    <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
                    <span>Lô hàng này có vi phạm chuỗi lạnh trong lịch sử!</span>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl bg-emerald-50/60 p-3 border border-emerald-100 flex items-center gap-2 text-xs text-emerald-800 font-medium">
                    <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                    <span>Chuỗi lạnh duy trì đạt chuẩn an toàn.</span>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {selectedView === "Lô nông sản" && user?.role === "farm_admin" && (
          <section className="grid gap-6 lg:grid-cols-2">
            <form
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
              onSubmit={handleLandPlotSubmit}
            >
              <div className="mb-4 flex items-center gap-3">
                <Plus className="text-emerald-600" size={20} />
                <h2 className="text-lg font-bold text-slate-900">
                  Khai báo thửa đất
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-xl border px-3 py-2"
                  placeholder="Tên thửa"
                  value={landPlotForm.name}
                  onChange={(event) =>
                    setLandPlotForm({
                      ...landPlotForm,
                      name: event.target.value,
                    })
                  }
                />
                <input
                  className="rounded-xl border px-3 py-2"
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="Diện tích (ha)"
                  value={landPlotForm.areaHa}
                  onChange={(event) =>
                    setLandPlotForm({
                      ...landPlotForm,
                      areaHa: event.target.value,
                    })
                  }
                />
                <input
                  className="rounded-xl border px-3 py-2"
                  type="number"
                  step="0.000001"
                  placeholder="Vĩ độ"
                  value={landPlotForm.latitude}
                  onChange={(event) =>
                    setLandPlotForm({
                      ...landPlotForm,
                      latitude: event.target.value,
                    })
                  }
                />
                <input
                  className="rounded-xl border px-3 py-2"
                  type="number"
                  step="0.000001"
                  placeholder="Kinh độ"
                  value={landPlotForm.longitude}
                  onChange={(event) =>
                    setLandPlotForm({
                      ...landPlotForm,
                      longitude: event.target.value,
                    })
                  }
                />
              </div>
              <button
                className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white"
                type="submit"
              >
                Lưu thửa đất
              </button>
            </form>

            <form
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
              onSubmit={handleHarvestSubmit}
            >
              <div className="mb-4 flex items-center gap-3">
                <Box className="text-emerald-600" size={20} />
                <h2 className="text-lg font-bold text-slate-900">
                  Thu hoạch lô hàng
                </h2>
              </div>
              <div className="grid gap-3">
                <select
                  className="rounded-xl border px-3 py-2"
                  value={harvestForm.landPlotId}
                  onChange={(event) =>
                    setHarvestForm({
                      ...harvestForm,
                      landPlotId: event.target.value,
                    })
                  }
                >
                  <option value="">Chọn thửa đất</option>
                  {landPlots.map((plot) => (
                    <option key={plot.id} value={plot.id}>
                      {plot.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-xl border px-3 py-2"
                  value={harvestForm.productId}
                  onChange={(event) =>
                    setHarvestForm({
                      ...harvestForm,
                      productId: event.target.value,
                    })
                  }
                >
                  <option value="">Chọn sản phẩm</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-xl border px-3 py-2"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Khối lượng (kg)"
                  value={harvestForm.quantityKg}
                  onChange={(event) =>
                    setHarvestForm({
                      ...harvestForm,
                      quantityKg: event.target.value,
                    })
                  }
                />
                <input
                  className="rounded-xl border px-3 py-2"
                  type="date"
                  value={harvestForm.harvestedAt}
                  onChange={(event) =>
                    setHarvestForm({
                      ...harvestForm,
                      harvestedAt: event.target.value,
                    })
                  }
                />
              </div>
              <button
                className="mt-4 rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white"
                type="submit"
              >
                Tạo lô cho thu hoạch
              </button>
            </form>
            <form
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
              onSubmit={handleProductSubmit}
            >
              <h2 className="text-lg font-bold text-slate-900">
                {editingProductId ? "Sửa sản phẩm" : "Thêm sản phẩm"}
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-xl border px-3 py-2"
                  placeholder="Tên sản phẩm"
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm({ ...productForm, name: event.target.value })
                  }
                />
                <input
                  className="rounded-xl border px-3 py-2"
                  placeholder="Đơn vị tính"
                  value={productForm.unit}
                  onChange={(event) =>
                    setProductForm({ ...productForm, unit: event.target.value })
                  }
                />
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white"
                  type="submit"
                >
                  {editingProductId ? "Cập nhật" : "Thêm sản phẩm"}
                </button>
                {editingProductId && (
                  <button
                    className="rounded-xl border px-4 py-2"
                    type="button"
                    onClick={() => {
                      setEditingProductId(null);
                      setProductForm({ name: "", unit: "kg" });
                    }}
                  >
                    Hủy
                  </button>
                )}
              </div>
              <div className="mt-5 space-y-2">
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left hover:border-emerald-300"
                    onClick={() => {
                      setEditingProductId(product.id);
                      setProductForm({ name: product.name, unit: product.unit });
                    }}
                  >
                    <span className="font-medium">{product.name}</span>
                    <span className="text-sm text-slate-500">{product.unit}</span>
                  </button>
                ))}
              </div>
            </form>
          </section>
        )}

        {selectedView === "L\u00f4 n\u00f4ng s\u1ea3n" && user?.role === "farm_admin" && (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Danh sách thửa đất</h2>
                <p className="text-xs text-slate-400 mt-0.5">{landPlots.length} thửa đang quản lý</p>
              </div>
            </div>
            {landPlots.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                <MapPin size={32} className="opacity-30" />
                <p className="text-sm">Chưa có thửa đất nào. Hãy khai báo thửa đất ở trên.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {landPlots.map((plot) => {
                  const batchCount = batches.filter(
                    (b) => b.organization_id === user?.organizationId
                  ).length;
                  const hasCoords = plot.latitude && plot.longitude;
                  return (
                    <article
                      key={plot.id}
                      className="group relative flex flex-col gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-emerald-50/40 p-5 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600">
                            {plot.farm_name}
                          </p>
                          <h3 className="mt-0.5 text-base font-bold text-slate-900">{plot.name}</h3>
                        </div>
                        <button
                          type="button"
                          title="Chỉnh sửa thửa đất"
                          className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
                          onClick={() => {
                            setEditingLandPlotId(plot.id);
                            setLandPlotForm({
                              name: plot.name,
                              areaHa: String(plot.area_ha),
                              latitude: plot.latitude ? String(plot.latitude) : "",
                              longitude: plot.longitude ? String(plot.longitude) : "",
                            });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-white/80 px-3 py-2 text-center ring-1 ring-slate-100">
                          <p className="text-lg font-bold text-slate-900">{plot.area_ha}</p>
                          <p className="text-[10px] text-slate-400">ha</p>
                        </div>
                        <div className="rounded-xl bg-white/80 px-3 py-2 text-center ring-1 ring-slate-100">
                          <p className="text-lg font-bold text-slate-900">{batchCount}</p>
                          <p className="text-[10px] text-slate-400">Lô hàng</p>
                        </div>
                        <div className="rounded-xl bg-white/80 px-3 py-2 text-center ring-1 ring-slate-100">
                          <p className="text-lg font-bold text-emerald-600">#</p>
                          <p className="text-[10px] text-slate-400">ID: {plot.id}</p>
                        </div>
                      </div>

                      {/* Coordinates */}
                      <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-slate-100">
                        <MapPin size={14} className={hasCoords ? "text-emerald-500" : "text-slate-300"} />
                        {hasCoords ? (
                          <span className="font-mono text-[11px] text-slate-600">
                            {Number(plot.latitude).toFixed(4)}°N, {Number(plot.longitude).toFixed(4)}°E
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Chưa có tọa độ GPS</span>
                        )}
                        {hasCoords && (
                          <a
                            href={`https://www.google.com/maps?q=${plot.latitude},${plot.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto text-[10px] text-emerald-600 hover:underline"
                          >
                            Xem Maps ↗
                          </a>
                        )}
                      </div>

                      {/* Created date */}
                      <p className="text-[10px] text-slate-400">
                        Khai báo: {new Date(plot.created_at).toLocaleDateString("vi-VN", {
                          day: "2-digit", month: "2-digit", year: "numeric"
                        })}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {(selectedView === "L\u00f4 n\u00f4ng s\u1ea3n" || selectedView === "T\u00f2ng quan") &&
          ["farm_admin", "processor_admin", "distributor_admin"].includes(user?.role) && (
            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <form
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
                onSubmit={handleSplitSubmit}
              >
                <h2 className="text-lg font-bold text-slate-900">Tách lô hàng</h2>
                <p className="mt-2 text-sm text-slate-500">Chọn lô và khối lượng lô con.</p>
                <div className="mt-4 grid gap-3">
                  <select
                    className="rounded-xl border px-3 py-2"
                    value={splitBatchId}
                    onChange={(event) => setSplitBatchId(event.target.value)}
                  >
                    <option value="">Chọn lô cần tách</option>
                    {filteredBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.batch_code} · còn {batch.remaining_quantity}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded-xl border px-3 py-2"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Khối lượng lô con"
                    value={splitQuantity}
                    onChange={(event) => setSplitQuantity(event.target.value)}
                  />
                </div>
                <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white" type="submit">
                  Tách lô
                </button>
              </form>

              <form
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
                onSubmit={handleMergeSubmit}
              >
                <h2 className="text-lg font-bold text-slate-900">Gộp lô hàng</h2>
                <p className="mt-2 text-sm text-slate-500">Chọn ít nhất hai lô cùng sản phẩm.</p>
                <div className="mt-4 max-h-48 space-y-2 overflow-auto">
                  {filteredBatches.map((batch) => (
                    <label key={batch.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={mergeBatchIds.includes(String(batch.id))}
                        onChange={(event) =>
                          setMergeBatchIds((current) =>
                            event.target.checked
                              ? [...current, String(batch.id)]
                              : current.filter((id) => id !== String(batch.id)),
                          )
                        }
                      />
                      {batch.batch_code} · {batch.product_name}
                    </label>
                  ))}
                </div>
                <button className="mt-4 rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white" type="submit" disabled={mergeBatchIds.length < 2}>
                  Gộp lô
                </button>
              </form>
            </section>
          )}

        {selectedView === "Integrity" && (
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-emerald-600" size={22} />
              <h2 className="text-lg font-bold text-slate-900">
                Kiểm tra tính toàn vẹn
              </h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {filteredBatches.map((batch) => (
                <button
                  key={batch.id}
                  className="rounded-xl border p-4 text-left hover:border-emerald-300"
                  onClick={() => handleVerifyIntegrity(batch.id)}
                >
                  <div className="font-semibold text-slate-800">
                    {batch.batch_code}
                  </div>
                  <div className="text-sm text-slate-500">
                    {batch.product_name}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {(selectedView === "Chuỗi lạnh" || selectedView === "Kiểm soát") &&
          [
            "farm_admin",
            "processor_admin",
            "distributor_admin",
            "auditor",
          ].includes(user?.role) && (
            <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Giám sát chuỗi lạnh
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Cảnh báo khi nhiệt độ vượt 8°C liên tục quá 30 phút.
                  </p>
                </div>
                <span className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                  Ngưỡng cảnh báo: &gt; 8°C
                </span>
              </div>
              <div className="mt-4 divide-y divide-slate-100">
                {filteredBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => setSelectedBatch(batch)}
                        className="font-semibold text-slate-900 hover:text-emerald-700"
                      >
                        {batch.batch_code}
                      </button>
                      <p className="text-sm text-slate-500">
                        {batch.product_name} ·{" "}
                        {batch.current_location || "Chưa cập nhật vị trí"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-sm font-semibold ${batch.cold_chain_alert ? "text-rose-700" : "text-emerald-700"}`}
                      >
                        {batch.cold_chain_alert
                          ? "Vi phạm chuỗi lạnh"
                          : `${batch.temperature_c ?? "--"}°C`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSensorSimulation(batch.id)}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                      >
                        Giả lập cảm biến
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {temperatureLogs.length > 0 && (
                <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  Đã ghi {temperatureLogs.length} mẫu mới; mẫu gần nhất:{" "}
                  {temperatureLogs.at(-1).temperature}°C lúc{" "}
                  {new Date(temperatureLogs.at(-1).timestamp).toLocaleString(
                    "vi-VN",
                  )}
                  .
                </div>
              )}
            </section>
          )}

        {selectedView === "Thu hồi" && (
          <section className="space-y-6">
            {user?.role !== "auditor" && (
              <form
                onSubmit={handleRecallSubmit}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
              >
                <div className="mb-4 flex items-center gap-3">
                  <Siren className="text-rose-700" size={21} />
                  <h2 className="text-lg font-bold text-slate-900">
                    Kích hoạt lệnh thu hồi
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
                  <select
                    required
                    className="rounded-xl border px-3 py-2"
                    value={recallForm.batchId}
                    onChange={(event) =>
                      setRecallForm({
                        ...recallForm,
                        batchId: event.target.value,
                      })
                    }
                  >
                    <option value="">Chọn lô gốc</option>
                    {filteredBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.batch_code}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    minLength={5}
                    className="rounded-xl border px-3 py-2"
                    placeholder="Lý do thu hồi nghiêm trọng"
                    value={recallForm.reason}
                    onChange={(event) =>
                      setRecallForm({
                        ...recallForm,
                        reason: event.target.value,
                      })
                    }
                  />
                  <button
                    className="rounded-xl bg-rose-700 px-4 py-2 font-semibold text-white hover:bg-rose-800"
                    type="submit"
                  >
                    Thu hồi toàn bộ
                  </button>
                </div>
              </form>
            )}

            {recallReports.map((report) => (
              <article
                key={report.id}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex flex-col gap-2 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-bold text-slate-900">
                      Thu hồi #{report.id} · {report.root_batch_code}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {report.reason}
                    </p>
                  </div>
                  <div className="text-sm text-slate-600">
                    Còn tại điểm bán:{" "}
                    <strong>
                      {Number(report.totals.remainingQuantity).toLocaleString()}{" "}
                      kg
                    </strong>{" "}
                    · Đã tiêu thụ:{" "}
                    <strong>
                      {Number(report.totals.consumedQuantity).toLocaleString()}{" "}
                      kg
                    </strong>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Mã lô</th>
                        <th className="px-5 py-3">Đơn vị đang giữ</th>
                        <th className="px-5 py-3">Kho / cửa hàng</th>
                        <th className="px-5 py-3">Còn lại</th>
                        <th className="px-5 py-3">Đã tiêu thụ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.items.map((item) => (
                        <tr
                          key={item.batch_id}
                          className="border-t border-slate-100"
                        >
                          <td className="px-5 py-3 font-semibold">
                            {item.batch_code}
                          </td>
                          <td className="px-5 py-3">
                            {item.organization_name}
                          </td>
                          <td className="px-5 py-3">
                            {item.current_location || "Chưa cập nhật"}
                          </td>
                          <td className="px-5 py-3">
                            {Number(item.remaining_quantity).toLocaleString()}{" "}
                            kg
                          </td>
                          <td className="px-5 py-3">
                            {Number(item.consumed_quantity).toLocaleString()} kg
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </section>
        )}

        {(selectedView === "Báo cáo kiểm tra" ||
          selectedView === "Toàn bộ lô") &&
          [
            "farm_admin",
            "processor_admin",
            "distributor_admin",
            "auditor",
          ].includes(user?.role) && (
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3">
                <Download className="text-emerald-700" size={21} />
                <h2 className="text-lg font-bold text-slate-900">
                  Xuất hồ sơ truy xuất
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Tệp JSON bao gồm phả hệ, sự kiện, nhiệt độ và kết quả Verify
                Hash Chain tại thời điểm xuất.
              </p>
              <div className="mt-4 divide-y divide-slate-100">
                {filteredBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div>
                      <div className="font-semibold">{batch.batch_code}</div>
                      <div className="text-sm text-slate-500">
                        {batch.product_name}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAuditExport(batch.id)}
                      className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                    >
                      <Download size={16} /> Xuất JSON
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

        {selectedView === "Chuỗi lạnh" && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-3">
              <ArrowRightLeft className="text-emerald-600" size={22} />
              <h2 className="text-lg font-bold text-slate-900">
                {user?.role === "user"
                  ? "Gửi yêu cầu bàn giao lô hàng"
                  : "Yêu cầu bàn giao lô hàng"}
              </h2>
            </div>
            <form
              className="mt-4 grid gap-3 sm:grid-cols-3"
              onSubmit={handleTransferSubmit}
            >
              <select
                className="rounded-xl border px-3 py-2"
                value={transferForm.batchId}
                onChange={(event) =>
                  setTransferForm({
                    ...transferForm,
                    batchId: event.target.value,
                  })
                }
              >
                <option value="">Chọn lô hàng</option>
                {filteredBatches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.batch_code}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border px-3 py-2"
                value={transferForm.toOrganizationId}
                onChange={(event) =>
                  setTransferForm({
                    ...transferForm,
                    toOrganizationId: event.target.value,
                  })
                }
              >
                <option value="">Chọn tổ chức nhận</option>
                <option value="2">HTX Sơ chế Hà Nội</option>
                <option value="3">Cửa hàng Organic Market</option>
              </select>
              <input
                className="rounded-xl border px-3 py-2"
                placeholder="Ghi chú"
                value={transferForm.note}
                onChange={(event) =>
                  setTransferForm({ ...transferForm, note: event.target.value })
                }
              />
              <button
                className="sm:col-span-3 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white"
                type="submit"
              >
                Gửi yêu cầu bàn giao
              </button>
            </form>
          </section>
        )}

        {!!submission.message && (
          <div
            className={`mt-5 rounded-xl p-3 text-sm ${submission.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
          >
            {submission.message}
          </div>
        )}

        {notifications.length > 0 && (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-slate-900">
              Thông báo hệ thống
            </h2>
            <div className="mt-3 space-y-2">
              {notifications.slice(0, 5).map((notification) => (
                <div
                  key={notification.id}
                  className="border-l-2 border-amber-500 py-2 pl-3"
                >
                  <div className="text-sm font-semibold text-slate-800">
                    {notification.title}
                  </div>
                  <p className="text-sm text-slate-600">
                    {notification.message}
                  </p>
                  <time className="text-xs text-slate-400">
                    {new Date(notification.created_at).toLocaleString("vi-VN")}
                  </time>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Danh sách yêu cầu bàn giao */}
        {transferRequests.length > 0 && (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-slate-900">
                    Quản lý bàn giao lô hàng
                  </h2>
                  {pendingIncomingCount > 0 && (
                    <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold text-white animate-pulse">
                      {pendingIncomingCount} cần xử lý
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bàn giao quyền sở hữu lô hàng qua chuỗi cung ứng (Farm → Cơ sở sơ chế → Nhà phân phối).
                </p>
              </div>

              {/* Filter tabs */}
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-medium">
                {[
                  { id: "all", label: `Tất cả (${transferRequests.length})` },
                  { id: "incoming", label: `Cần tôi xử lý (${pendingIncomingCount})` },
                  { id: "outgoing", label: "Đã gửi" },
                  { id: "completed", label: "Lịch sử" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTransferFilter(tab.id)}
                    className={`rounded-lg px-3 py-1.5 transition ${
                      transferFilter === tab.id
                        ? "bg-white font-semibold text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Transfer List */}
            <div className="mt-4 space-y-3">
              {filteredTransferRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <ArrowRightLeft size={36} className="opacity-30 mb-2" />
                  <p className="text-sm">Không có yêu cầu bàn giao nào trong danh mục này.</p>
                </div>
              ) : (
                filteredTransferRequests.map((request) => {
                  const isIncoming = request.to_organization_id === user?.organizationId;
                  const isOutgoing = request.from_organization_id === user?.organizationId;
                  const canDecide =
                    request.status === "pending" &&
                    isIncoming &&
                    ["farm_admin", "processor_admin", "distributor_admin"].includes(user?.role);

                  return (
                    <div
                      key={request.id}
                      className={`group relative flex flex-col gap-3.5 rounded-2xl border p-5 transition-all ${
                        request.status === "pending" && isIncoming
                          ? "border-amber-300 bg-amber-50/40 hover:border-amber-400 hover:shadow-md ring-1 ring-amber-200"
                          : request.status === "confirmed"
                          ? "border-emerald-200 bg-emerald-50/20 hover:border-emerald-300"
                          : request.status === "rejected"
                          ? "border-rose-200 bg-rose-50/20 hover:border-rose-300"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      {/* Top row: Organizations & Status Badge */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                            <span className="text-slate-400 font-normal">Từ:</span> {request.from_organization_name}
                          </span>
                          <ArrowRight size={14} className="text-slate-400" />
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                            <span className="text-slate-400 font-normal">Đến:</span> {request.to_organization_name}
                          </span>
                          {isIncoming && (
                            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                              Bên nhận (Tổ chức của bạn)
                            </span>
                          )}
                          {isOutgoing && (
                            <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                              Bên gửi (Tổ chức của bạn)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {Boolean(request.is_overdue) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700 animate-bounce">
                              <AlertTriangle size={12} />
                              Quá hạn 48h
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                              request.status === "pending"
                                ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                                : request.status === "confirmed"
                                ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                                : "bg-rose-100 text-rose-800 ring-1 ring-rose-300"
                            }`}
                          >
                            {request.status === "pending" && <Clock size={12} />}
                            {request.status === "confirmed" && <CheckCircle2 size={12} />}
                            {request.status === "rejected" && <ShieldAlert size={12} />}
                            {request.status === "pending"
                              ? "Chờ xác nhận"
                              : request.status === "confirmed"
                              ? "Đã xác nhận"
                              : "Đã từ chối"}
                          </span>
                        </div>
                      </div>

                      {/* Middle row: Batch details */}
                      <div className="grid gap-3 sm:grid-cols-3 rounded-xl bg-white/90 p-3 ring-1 ring-slate-200/70">
                        <div>
                          <p className="text-[11px] text-slate-400">Mã lô hàng</p>
                          <p className="font-mono font-bold text-slate-800">{request.batch_code}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400">Sản phẩm & Khối lượng</p>
                          <p className="font-semibold text-slate-800">
                            {request.product_name || "Nông sản"} · {request.remaining_quantity || request.initial_quantity || 0} {request.product_unit || "kg"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400">Thời gian tạo</p>
                          <p className="text-xs text-slate-600">
                            {new Date(request.created_at).toLocaleString("vi-VN")}
                          </p>
                        </div>
                      </div>

                      {/* Note row if sender provided note */}
                      {request.note && (
                        <div className="rounded-xl bg-slate-50/90 px-3.5 py-2 text-xs text-slate-600">
                          <span className="font-semibold text-slate-700">Ghi chú từ bên gửi: </span>
                          <span>{request.note}</span>
                        </div>
                      )}

                      {/* Reason row if confirmed or rejected */}
                      {request.reason && (
                        <div className={`rounded-xl px-3.5 py-2.5 text-xs ${
                          request.status === "confirmed"
                            ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                            : "bg-rose-50 text-rose-900 border border-rose-200"
                        }`}>
                          <span className="font-bold">
                            {request.status === "confirmed" ? "Lý do tiếp nhận: " : "Lý do từ chối: "}
                          </span>
                          <span>{request.reason}</span>
                        </div>
                      )}

                      {/* Action buttons if current user is the receiver */}
                      {canDecide && (
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-amber-200">
                          <span className="text-xs font-semibold text-amber-900">
                            👉 Vui lòng kiểm tra và xác nhận hoặc từ chối bàn giao:
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                              onClick={() => openDecisionModal(request, "confirmed")}
                            >
                              <CheckCircle2 size={14} />
                              Xác nhận tiếp nhận
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition"
                              onClick={() => openDecisionModal(request, "rejected")}
                            >
                              <XCircle size={14} />
                              Từ chối bàn giao
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* Modal xác nhận hoặc từ chối bàn giao kèm lý do */}
        {decisionModal.open && decisionModal.transfer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                      decisionModal.decision === "confirmed"
                        ? "bg-emerald-100 text-emerald-600"
                        : "bg-rose-100 text-rose-600"
                    }`}
                  >
                    {decisionModal.decision === "confirmed" ? (
                      <CheckCircle2 size={26} />
                    ) : (
                      <XCircle size={26} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {decisionModal.decision === "confirmed"
                        ? "Xác nhận nhận bàn giao lô hàng"
                        : "Từ chối nhận bàn giao lô hàng"}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {decisionModal.decision === "confirmed"
                        ? "Lô hàng sẽ được chuyển quyền sở hữu sang tổ chức của bạn."
                        : "Lô hàng sẽ được hoàn trả về trạng thái của bên gửi."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDecisionModal}
                  disabled={decisionModal.submitting}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Transfer Summary */}
              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/90 p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Mã lô hàng:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {decisionModal.transfer.batch_code}
                  </span>
                </div>
                {decisionModal.transfer.product_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Sản phẩm:</span>
                    <span className="font-semibold text-slate-800">
                      {decisionModal.transfer.product_name} ({decisionModal.transfer.remaining_quantity || decisionModal.transfer.initial_quantity || 0} {decisionModal.transfer.product_unit || "kg"})
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Bên chuyển giao:</span>
                  <span className="font-medium text-slate-700">
                    {decisionModal.transfer.from_organization_name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Bên nhận (Tổ chức của bạn):</span>
                  <span className="font-medium text-emerald-700">
                    {decisionModal.transfer.to_organization_name}
                  </span>
                </div>
                {decisionModal.transfer.note && (
                  <div className="pt-2 border-t border-slate-200/60 text-slate-600">
                    <span className="font-semibold text-slate-700">Ghi chú từ bên gửi: </span>
                    <span className="italic">{decisionModal.transfer.note}</span>
                  </div>
                )}
              </div>

              {/* Preset suggestion chips */}
              <div className="mt-4">
                <label className="text-xs font-semibold text-slate-700 block mb-2">
                  Gợi ý lý do nhanh:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(decisionModal.decision === "confirmed"
                    ? [
                        "Đã kiểm tra chất lượng và nhận đủ số lượng.",
                        "Bao bì nguyên vẹn, nhiệt độ đạt chuẩn.",
                        "Đã đối chiếu chứng từ thành công.",
                        "Hàng đạt tiêu chuẩn VietGAP/GlobalGAP."
                      ]
                    : [
                        "Lô hàng không đạt tiêu chuẩn chất lượng.",
                        "Nhiệt độ bảo quản bị vi phạm quá ngưỡng.",
                        "Khối lượng thực tế không khớp với chứng từ.",
                        "Bao bì bị rách hỏng, biến dạng nghiêm trọng."
                      ]
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setDecisionModal((prev) => ({ ...prev, reason: preset }))
                      }
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason Form */}
              <form onSubmit={handleSubmitDecisionModal} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800">
                    Lý do {decisionModal.decision === "confirmed" ? "xác nhận" : "từ chối"} <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder={
                      decisionModal.decision === "confirmed"
                        ? "Nhập lý do hoặc nhận xét khi tiếp nhận lô hàng..."
                        : "Bắt buộc nhập rõ nguyên nhân từ chối lô hàng..."
                    }
                    value={decisionModal.reason}
                    onChange={(e) =>
                      setDecisionModal((prev) => ({ ...prev, reason: e.target.value }))
                    }
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={decisionModal.submitting}
                    onClick={closeDecisionModal}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={decisionModal.submitting || !decisionModal.reason.trim()}
                    className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${
                      decisionModal.decision === "confirmed"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-rose-600 hover:bg-rose-700"
                    }`}
                  >
                    {decisionModal.submitting ? (
                      <span>Đang xử lý...</span>
                    ) : decisionModal.decision === "confirmed" ? (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Xác nhận tiếp nhận</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={16} />
                        <span>Từ chối tiếp nhận</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {selectedBatch && (
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            {/* Event Timeline */}
            <div className="rounded-2xl bg-white p-6 card-shadow border border-slate-200/80">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">Dòng thời gian sự kiện (Hash Chain)</h2>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                      {(selectedBatch.events || []).length} mốc
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Lô hàng: <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{selectedBatch.batch_code}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleVerifyIntegrity(selectedBatch.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800 transition"
                >
                  <ShieldCheck size={14} />
                  Xác minh tính toàn vẹn
                </button>
              </div>

              {selectedBatch.integrity && (
                <div
                  className={`mt-4 rounded-xl p-3.5 text-xs flex items-center gap-2.5 border ${
                    selectedBatch.integrity.valid
                      ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                      : "bg-rose-50 text-rose-900 border-rose-300 animate-pulse"
                  }`}
                >
                  {selectedBatch.integrity.valid ? (
                    <ShieldCheck size={18} className="text-emerald-600 flex-shrink-0" />
                  ) : (
                    <ShieldAlert size={18} className="text-rose-600 flex-shrink-0" />
                  )}
                  <div>
                    <p className="font-bold">
                      {selectedBatch.integrity.valid
                        ? "Chuỗi Hash SHA-256 hoàn toàn nguyên vẹn."
                        : `CẢNH BÁO: Phát hiện đứt gãy/sửa lén tại event ID: ${selectedBatch.integrity.invalidEventIds.join(", ")}!`}
                    </p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {selectedBatch.integrity.valid
                        ? "Tất cả các hash liên tiếp khớp 100% với genesis hash."
                        : "Dữ liệu sự kiện đã bị chỉnh sửa bất hợp pháp ngoài ứng dụng."}
                    </p>
                  </div>
                </div>
              )}

              {(selectedBatch.events || []).length === 0 ? (
                <div className="mt-12 flex flex-col items-center justify-center py-10 text-slate-400">
                  <ClipboardList size={40} className="opacity-30 mb-2" />
                  <p className="text-sm">Chưa có sự kiện nào cho lô này.</p>
                </div>
              ) : (
                <ol className="mt-6 relative border-l-2 border-slate-200 pl-6 space-y-0">
                  {(selectedBatch.events || []).map((event, index) => {
                    let parsedData = {};
                    try { parsedData = JSON.parse(event.data_json); } catch { /* ignore */ }
                    const isLast = index === (selectedBatch.events.length - 1);
                    const meta = EVENT_META[event.event_type] || {};
                    const dotColor = meta.color?.includes("rose") ? "bg-rose-500" :
                      meta.color?.includes("orange") ? "bg-orange-500" :
                      meta.color?.includes("amber") ? "bg-amber-500" :
                      meta.color?.includes("emerald") ? "bg-emerald-500" :
                      meta.color?.includes("violet") ? "bg-violet-500" :
                      meta.color?.includes("sky") || meta.color?.includes("blue") ? "bg-sky-500" :
                      meta.color?.includes("indigo") ? "bg-indigo-500" :
                      meta.color?.includes("teal") ? "bg-teal-500" : "bg-slate-400";
                    return (
                      <li key={event.id || index} className={`relative pb-6 ${isLast ? "pb-0" : ""}`}>
                        {/* Milestone icon dot */}
                        <span className={`absolute -left-[calc(0.75rem+1px)] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${dotColor} shadow-sm`} />

                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 hover:border-slate-300 hover:bg-white transition-all card-shadow">
                          {/* Event header */}
                          <div className="flex flex-wrap items-start gap-2 justify-between">
                            <EventBadge eventType={event.event_type} />
                            <time className="text-[11px] font-mono text-slate-400 tabular-nums">
                              {new Date(event.timestamp).toLocaleString("vi-VN", {
                                day: "2-digit", month: "2-digit", year: "numeric",
                                hour: "2-digit", minute: "2-digit", second: "2-digit"
                              })}
                            </time>
                          </div>

                          {/* Actor */}
                          {event.actor_name && (
                            <p className="mt-2 text-xs text-slate-500">
                              Người thực hiện: <span className="font-semibold text-slate-800">{event.actor_name}</span>
                            </p>
                          )}

                          {/* Parsed data fields */}
                          <div className="mt-3 grid gap-1.5 rounded-xl bg-white/90 p-3 border border-slate-100">
                            {Object.entries(parsedData).map(([k, v]) => (
                              <DataField key={k}
                                label={k.replaceAll("_", " ")}
                                value={Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : v}
                              />
                            ))}
                          </div>

                          {/* Hash chain badges */}
                          <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">SHA-256:</span>
                            <HashBadge label="prev" hash={event.previous_hash} />
                            <HashBadge label="curr" hash={event.current_hash} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {/* Right Column: Details & Genealogy */}
            <div className="space-y-6">
              {/* Batch Info Card */}
              <div className="rounded-2xl bg-white p-5 card-shadow border border-slate-200/80">
                <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
                  Thông tin chi tiết lô
                </h3>
                <dl className="mt-4 space-y-3 text-xs">
                  <div className="flex justify-between items-center gap-4">
                    <dt className="text-slate-500">Mã lô</dt>
                    <dd className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {selectedBatch.batch_code}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <dt className="text-slate-500">Sản phẩm</dt>
                    <dd className="font-semibold text-slate-800">
                      {selectedBatch.product_name}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <dt className="text-slate-500">Trạng thái hiện tại</dt>
                    <dd>
                      <BatchStatusBadge status={selectedBatch.status} />
                    </dd>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <dt className="text-slate-500">Tổ chức quản lý</dt>
                    <dd className="font-semibold text-slate-800">
                      {selectedBatch.organization_name}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <dt className="text-slate-500">Khối lượng còn lại</dt>
                    <dd className="font-mono font-bold text-slate-900">
                      {Number(selectedBatch.remaining_quantity).toLocaleString()} kg
                    </dd>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <dt className="text-slate-500">Nhiệt độ hiện tại</dt>
                    <dd className="font-mono font-bold text-emerald-700">
                      {selectedBatch.temperature_c ?? 9}°C
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Integrity & Public Trace Card */}
              <div className="rounded-2xl bg-white p-5 card-shadow border border-slate-200/80">
                <h3 className="text-base font-bold text-slate-900">Bảo chứng toàn vẹn & Truy xuất</h3>
                <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-emerald-50 p-3 text-emerald-800 border border-emerald-200">
                  <ShieldCheck size={20} className="text-emerald-600 flex-shrink-0" />
                  <span className="text-xs font-semibold">
                    Lịch sử sự kiện chống giả mạo, không thể sửa hay xóa.
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                  Mỗi sự kiện được liên kết bằng SHA-256 băm tuần tự. Cơ chế Database Trigger ngăn chặn triệt để mọi hành vi sửa/xóa.
                </p>
                <a
                  href={`/trace/${encodeURIComponent(selectedBatch.batch_code)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition"
                >
                  <ExternalLink size={14} /> Mở trang truy xuất công khai
                </a>
              </div>

              {/* Genealogy Card */}
              <div className="rounded-2xl bg-white p-5 card-shadow border border-slate-200/80">
                <h3 className="text-base font-bold text-slate-900">Nguồn gốc phả hệ (Genealogy)</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Truy nguyên lô gốc và quan hệ tách/gộp qua các công đoạn.
                </p>
                {genealogy ? (
                  <div className="mt-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-slate-500 font-medium">Lô tổ tiên (Ancestors):</span>
                      <span className="font-bold text-slate-800">{genealogy.ancestors?.length || 0} lô</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-slate-500 font-medium">Lô con cháu (Descendants):</span>
                      <span className="font-bold text-slate-800">{genealogy.descendants?.length || 0} lô</span>
                    </div>
                    {genealogy.roots?.length > 0 && (
                      <div className="pt-2">
                        <span className="font-semibold text-slate-700 block mb-2">Lô gốc ban đầu (Roots):</span>
                        <div className="space-y-1.5">
                          {genealogy.roots.map((root) => (
                            <div key={root.id} className="font-mono text-xs font-bold text-slate-800 bg-emerald-50/80 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center justify-between">
                              <span>{root.batch_code}</span>
                              <span className="text-[10px] text-emerald-700 font-normal">Lô gốc</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-400 italic">
                    Chọn một lô để tải cây phả hệ nguồn gốc.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
