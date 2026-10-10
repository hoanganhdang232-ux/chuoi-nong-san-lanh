import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Box,
  CheckCircle2,
  Download,
  ExternalLink,
  MapPin,
  Plus,
  ShieldCheck,
  Siren,
  Thermometer,
  Search,
  Sprout,
  Truck,
  Building2,
  Calendar,
  LogOut,
  ChevronDown,
  ChevronUp,
  FileCheck,
  RefreshCw,
  Eye,
  Trash2,
  Bell,
} from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { SkeletonCard, SkeletonRow } from "../components/ui/Skeleton.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";

const statusColors = {
  registered: "bg-slate-100 text-slate-800 border-slate-200",
  pending_confirmation: "bg-amber-50 text-amber-800 border-amber-200",
  processed: "bg-blue-50 text-blue-800 border-blue-200",
  in_transit: "bg-amber-50 text-amber-800 border-amber-200",
  delivered: "bg-emerald-50 text-emerald-800 border-emerald-200",
  recalled: "bg-rose-50 text-rose-800 border-rose-200",
};

const statusLabels = {
  registered: "Đã đăng ký",
  pending_confirmation: "Chờ xác nhận",
  processed: "Đã sơ chế",
  in_transit: "Đang vận chuyển",
  delivered: "Đã giao nhận",
  recalled: "Đang thu hồi",
};

const eventLabels = {
  batch_registered: "Đăng ký lô hàng mới",
  batch_harvested: "Thu hoạch nông sản",
  batch_transferred: "Yêu cầu bàn giao vận chuyển",
  batch_in_transit: "Đang vận chuyển trên đường",
  batch_delivered: "Đã giao nhận tại cơ sở",
  batch_processed: "Sơ chế & Đóng gói hoàn tất",
  batch_recalled: "Kích hoạt lệnh thu hồi",
  cold_chain_violation: "Cảnh báo vi phạm chuỗi lạnh (> 8°C)",
  temperature_series_recorded: "Ghi nhận chuỗi nhiệt độ IoT",
};

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [batches, setBatches] = useState([]);
  const [transferRequests, setTransferRequests] = useState([]);
  const [landPlots, setLandPlots] = useState([]);
  const [products, setProducts] = useState([]);
  const [farms, setFarms] = useState([]);
  const [temperatureLogs, setTemperatureLogs] = useState([]);
  const [recallReports, setRecallReports] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [activeTab, setActiveTab] = useState("overview"); // overview, batches, harvest, coldchain, transfer, integrity, recall
  const [batchSearch, setBatchSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Forms
  const todayDate = new Date().toISOString().split("T")[0];
  const [harvestForm, setHarvestForm] = useState({
    landPlotId: "",
    productId: "",
    quantityKg: "500",
    harvestedAt: todayDate,
  });
  const [landPlotForm, setLandPlotForm] = useState({
    name: "",
    areaHa: "1.5",
    latitude: "12.71",
    longitude: "108.12",
  });
  const [productForm, setProductForm] = useState({ name: "", unit: "kg" });
  const [farmForm, setFarmForm] = useState({ name: "", address: "", latitude: "", longitude: "" });
  const [transferForm, setTransferForm] = useState({
    batchId: "",
    toOrganizationId: "",
    note: "",
  });
  const [submission, setSubmission] = useState({ message: "", tone: "" });
  const [harvestError, setHarvestError] = useState(null);
  const [isSubmittingHarvest, setIsSubmittingHarvest] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [recallForm, setRecallForm] = useState({ batchId: "", reason: "" });
  const [splitForm, setSplitForm] = useState({ batchId: "", parts: [{ quantity: "" }, { quantity: "" }] });
  const [mergeForm, setMergeForm] = useState({ parentBatchIds: [], note: "" });

  const handleSplitSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.splitBatch(splitForm.batchId, { allocations: splitForm.parts });
      await loadData();
      setSplitForm({ batchId: "", parts: [{ quantity: "" }, { quantity: "" }] });
      setSubmission({ message: "Đã tách lô thành công.", tone: "success" });
    } catch (err) {
      setSubmission({ message: err.message, tone: "error" });
    }
  };

  const handleMergeSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.mergeBatches({ batchIds: mergeForm.parentBatchIds, note: mergeForm.note });
      await loadData();
      setMergeForm({ parentBatchIds: [], note: "" });
      setSubmission({ message: "Đã gộp lô thành công.", tone: "success" });
    } catch (err) {
      setSubmission({ message: err.message, tone: "error" });
    }
  };

  const loadData = async () => {
    const [dashboardData, batchData, transferData] = await Promise.all([
      api.getDashboard(),
      api.getBatches(),
      api.getTransferRequests(),
    ]);
    setDashboard(dashboardData);
    setBatches(batchData);
    setTransferRequests(transferData);
    if (!selectedBatch && batchData.length > 0) {
      handleSelectBatch(batchData[0].id);
    }
  };

  const handleSelectBatch = async (batchId) => {
    try {
      const detail = await api.getBatch(batchId);
      setSelectedBatch(detail);
    } catch {
      // fallback
      const found = batches.find((b) => b.id === batchId);
      if (found) setSelectedBatch(found);
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
        if (["farm_admin", "processor_admin", "distributor_admin"].includes(user?.role)) {
          const productData = await api.getProducts();
          setProducts(productData);

          if (user?.role === "farm_admin") {
            const [plotData, farmData] = await Promise.all([
              api.getLandPlots(),
              api.getFarms(),
            ]);
            setLandPlots(plotData);
            setFarms(farmData);
            if (plotData.length > 0 && !harvestForm.landPlotId) {
              setHarvestForm((prev) => ({ ...prev, landPlotId: String(plotData[0].id) }));
            }
            if (productData.length > 0 && !harvestForm.productId) {
              setHarvestForm((prev) => ({ ...prev, productId: String(productData[0].id) }));
            }
          }
        }
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, [user?.role]);

  const handleLandPlotSubmit = async (event) => {
    event.preventDefault();
    try {
      await api.createLandPlot({
        name: landPlotForm.name,
        areaHa: Number(landPlotForm.areaHa),
        latitude: Number(landPlotForm.latitude),
        longitude: Number(landPlotForm.longitude),
      });
      const plotData = await api.getLandPlots();
      setLandPlots(plotData);
      setLandPlotForm({
        name: "",
        areaHa: "1.5",
        latitude: "12.71",
        longitude: "108.12",
      });
      setSubmission({
        message: "Đã lưu thông tin thửa đất thành công.",
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleDeleteLandPlot = async (plotId, plotName) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa thửa đất "${plotName}" không?`)) return;
    try {
      await api.deleteLandPlot(plotId);
      const plotData = await api.getLandPlots();
      setLandPlots(plotData);
      setSubmission({
        message: "Đã xóa thửa đất thành công.",
        tone: "success",
      });
      // Optionally reset harvestForm landPlotId if it was the deleted one
      if (harvestForm.landPlotId === String(plotId)) {
        setHarvestForm((prev) => ({ ...prev, landPlotId: plotData.length > 0 ? String(plotData[0].id) : "" }));
      }
    } catch (error) {
      setSubmission({ message: error.message, tone: "error" });
    }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.createProduct(productForm);
      const data = await api.getProducts();
      setProducts(data);
      setProductForm({ name: "", unit: "kg" });
      setSubmission({ message: "Thêm sản phẩm thành công.", tone: "success" });
    } catch (err) {
      setSubmission({ message: err.message, tone: "error" });
    }
  };

  const handleDeleteProduct = async (id, name) => {
    if (!window.confirm(`Xóa sản phẩm "${name}"?`)) return;
    try {
      await api.deleteProduct(id);
      const data = await api.getProducts();
      setProducts(data);
      setSubmission({ message: "Đã xóa sản phẩm.", tone: "success" });
    } catch (err) {
      setSubmission({ message: err.message, tone: "error" });
    }
  };

  const handleFarmSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.createFarm(farmForm);
      const data = await api.getFarms();
      setFarms(data);
      setFarmForm({ name: "", address: "", latitude: "", longitude: "" });
      setSubmission({ message: "Thêm trang trại thành công.", tone: "success" });
    } catch (err) {
      setSubmission({ message: err.message, tone: "error" });
    }
  };

  const handleDeleteFarm = async (id, name) => {
    if (!window.confirm(`Xóa trang trại "${name}"?`)) return;
    try {
      await api.deleteFarm(id);
      const data = await api.getFarms();
      setFarms(data);
      setSubmission({ message: "Đã xóa trang trại.", tone: "success" });
    } catch (err) {
      setSubmission({ message: err.message, tone: "error" });
    }
  };

  const handleHarvestSubmit = async (event) => {
    event.preventDefault();
    setHarvestError(null);
    setIsSubmittingHarvest(true);
    try {
      const result = await api.createHarvest({
        landPlotId: Number(harvestForm.landPlotId),
        productId: Number(harvestForm.productId),
        quantityKg: Number(harvestForm.quantityKg),
        harvestedAt: harvestForm.harvestedAt,
      });
      await loadData();
      if (result.batch?.id) {
        handleSelectBatch(result.batch.id);
      }
      setSubmission({
        message: `Đã tạo thành công lô thu hoạch ${result.batch.batch_code}. Dữ liệu đã được ký số Blockchain.`,
        tone: "success",
      });
    } catch (submitError) {
      setHarvestError({ field: submitError.field, message: submitError.message });
      setSubmission({ message: submitError.message, tone: "error" });
    } finally {
      setIsSubmittingHarvest(false);
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
        message: "Đã gửi yêu cầu bàn giao cho đơn vị tiếp nhận.",
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleTransferDecision = async (transferId, decision) => {
    const defaultReason =
      decision === "confirmed"
        ? "Đã kiểm tra và nhận đủ lô hàng đúng nhiệt độ chuỗi lạnh."
        : "Lô hàng không đạt tiêu chuẩn nhiệt độ bảo quản.";
    const reason = window.prompt(
      decision === "confirmed"
        ? "Nhập lý do xác nhận bàn giao:"
        : "Nhập lý do từ chối bàn giao:",
      defaultReason,
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setSubmission({
        message: "Vui lòng nhập lý do trước khi xử lý bàn giao.",
        tone: "error",
      });
      return;
    }

    try {
      await api.decideTransfer(transferId, {
        decision,
        reason: reason.trim(),
      });
      await loadData();
      setSubmission({
        message:
          decision === "confirmed"
            ? "Đã xác nhận tiếp nhận lô hàng thành công."
            : "Đã từ chối tiếp nhận lô hàng.",
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleVerifyIntegrity = async (batch) => {
    try {
      const result = await api.verifyBatchIntegrity(batch.id);
      setSelectedBatch({ ...batch, integrity: result });
      setSubmission({
        message: result.is_valid
          ? `Lô ${result.batch_id || batch.id}: Toàn vẹn 100% qua ${result.total_events} sự kiện mã hóa SHA-256.`
          : `CẢNH BÁO: Phát hiện sai lệch tại sự kiện #${result.first_broken_event_id} (${result.error_type}).`,
        tone: result.is_valid ? "success" : "error",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleSensorSimulation = async (batchId) => {
    try {
      const result = await api.simulateSensor(batchId, { count: 3 });
      const logs = await api.getTemperatureLogs(batchId);
      setTemperatureLogs(logs);
      await loadData();
      if (selectedBatch?.id === batchId) {
        handleSelectBatch(batchId);
      }
      setSubmission({
        message: result.hasAlert
          ? `CẢNH BÁO: Đã ghi nhận nhiệt độ vượt ngưỡng (${result.series.map((s) => s.temperature + "°C").join(", ")})! Lô hàng đã kích hoạt cờ vi phạm chuỗi lạnh.`
          : `Cảm biến IoT cập nhật thành công: ${result.series.map((s) => s.temperature + "°C").join(", ")} (Nhiệt độ an toàn).`,
        tone: result.hasAlert ? "error" : "success",
      });
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
      setRecallForm({ batchId: "", reason: "" });
      const updatedReports = await api.getRecallReports();
      setRecallReports(updatedReports);
      await loadData();
      setSubmission({
        message: `Đã kích hoạt lệnh thu hồi thành công đối với ${report.items.length} lô liên quan.`,
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  const handleDownloadAuditReport = async (batchId, batchCode) => {
    try {
      const report = await api.getAuditReport(batchId);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-report-${batchCode}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSubmission({ message: "Đã tải xuống hồ sơ kiểm tra thành công.", tone: "success" });
    } catch (err) {
      setSubmission({ message: err.message || "Lỗi tải hồ sơ", tone: "error" });
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
      link.download = `kiem-toan-xac-thuc-${report.batch.batch_code}.json`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      setSubmission({
        message: report.integrity.valid
          ? "Đã xuất báo cáo kiểm toán điện tử JSON (Hash Chain hợp lệ)."
          : "Đã xuất báo cáo kiểm toán điện tử JSON (Có cảnh báo).",
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
    }
  };

  // Filtered batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const matchSearch =
        batchSearch === "" ||
        b.batch_code?.toLowerCase().includes(batchSearch.toLowerCase()) ||
        b.product_name?.toLowerCase().includes(batchSearch.toLowerCase());
      const matchStatus =
        statusFilter === "all" || b.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [batches, batchSearch, statusFilter]);

  const roleTitleMap = {
    farm_admin: "Quản trị Nông trại / HTX",
    processor_admin: "Cơ sở Sơ chế & Đóng gói",
    distributor_admin: "Đơn vị Vận chuyển & Phân phối",
    auditor: "Cán bộ Kiểm tra / Thanh tra",
    user: "Nông dân / Xã viên",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <div className="bg-brand-900 text-white p-4">Đang tải bàn làm việc quản lý...</div>
        <div className="p-8 max-w-6xl mx-auto w-full grid grid-cols-4 gap-4">
          <SkeletonCard count={4} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-rose-700 bg-slate-50">
        <div>
          <p className="font-bold text-lg mb-2">Đã xảy ra lỗi khi tải dữ liệu</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* Top Bar Quản Trị Chuẩn Cơ Quan */}
      <header className="bg-brand-900 text-white border-b border-brand-800 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left Brand */}
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2 text-white hover:text-emerald-200 transition-colors">
                <span className="flex h-7 w-7 items-center justify-center rounded bg-emerald-700 font-bold text-xs">
                  VN
                </span>
                <span className="font-bold text-sm tracking-wide uppercase hidden sm:inline">
                  Cổng Truy Xuất Quốc Gia
                </span>
              </Link>
              <span className="text-brand-500">|</span>
              <div className="text-xs text-brand-100 truncate max-w-[200px] sm:max-w-none">
                {user?.organizationName} ({roleTitleMap[user?.role] || user?.role})
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-3">
              <Link
                to="/"
                target="_blank"
                rel="noreferrer"
                className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-xs text-emerald-200 font-medium transition-colors"
              >
                <ExternalLink size={13} />
                <span>Xem Cổng Tra Cứu</span>
              </Link>
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-1.5 rounded-full hover:bg-brand-800 transition-colors text-brand-100 hover:text-white"
                >
                  <Bell size={18} />
                  {notifications.filter(n => !n.read_at).length > 0 && (
                    <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-rose-500 border border-brand-900"></span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-50">
                    <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                      <h4 className="font-bold text-slate-800 text-sm">Thông báo ({notifications.length})</h4>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">Không có thông báo mới</div>
                      ) : (
                        notifications.map((n) => (
                          <div key={n.id} className={`p-3 border-b border-slate-50 text-xs ${n.read_at ? "bg-white" : "bg-brand-50/30"}`}>
                            <div className="font-bold text-slate-800 mb-0.5">{n.title}</div>
                            <div className="text-slate-600 line-clamp-2">{n.message}</div>
                            <div className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString("vi-VN")}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-xs font-semibold text-white px-2 py-1 bg-brand-800 rounded">
                {user?.name}
              </div>
              <button
                onClick={logout}
                title="Đăng xuất"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-xs text-rose-100 font-medium transition-colors"
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">Thoát</span>
              </button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <nav className="flex space-x-1 overflow-x-auto pb-2 scrollbar-none text-xs sm:text-sm font-medium">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === "overview"
                  ? "bg-white text-brand-900 font-bold shadow-sm"
                  : "text-brand-100 hover:bg-brand-800 hover:text-white"
              }`}
            >
              Tổng quan
            </button>

            {["farm_admin", "processor_admin", "distributor_admin"].includes(user?.role) && (
              <button
                onClick={() => setActiveTab("catalog")}
                className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                  activeTab === "catalog"
                    ? "bg-white text-brand-900 font-bold shadow-sm"
                    : "text-brand-100 hover:bg-brand-800 hover:text-white"
                }`}
              >
                📚 Danh mục
              </button>
            )}

            <button
              onClick={() => setActiveTab("batches")}
              className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === "batches"
                  ? "bg-white text-brand-900 font-bold shadow-sm"
                  : "text-brand-100 hover:bg-brand-800 hover:text-white"
              }`}
            >
              Quản lý Lô nông sản ({batches.length})
            </button>

            {user?.role === "farm_admin" && (
              <button
                onClick={() => setActiveTab("harvest")}
                className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                  activeTab === "harvest"
                    ? "bg-white text-brand-900 font-bold shadow-sm"
                    : "text-brand-100 hover:bg-brand-800 hover:text-white"
                }`}
              >
                🌾 Thu hoạch & Thửa đất
              </button>
            )}

            {["processor_admin", "farm_admin"].includes(user?.role) && (
              <button
                onClick={() => setActiveTab("split_merge")}
                className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                  activeTab === "split_merge"
                    ? "bg-white text-brand-900 font-bold shadow-sm"
                    : "text-brand-100 hover:bg-brand-800 hover:text-white"
                }`}
              >
                ✂️ Tách / Gộp lô
              </button>
            )}

            <button
              onClick={() => setActiveTab("coldchain")}
              className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === "coldchain"
                  ? "bg-white text-brand-900 font-bold shadow-sm"
                  : "text-brand-100 hover:bg-brand-800 hover:text-white"
              }`}
            >
              ❄️ Giám sát Chuỗi lạnh
            </button>

            <button
              onClick={() => setActiveTab("transfer")}
              className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === "transfer"
                  ? "bg-white text-brand-900 font-bold shadow-sm"
                  : "text-brand-100 hover:bg-brand-800 hover:text-white"
              }`}
            >
              🚚 Bàn giao vận chuyển ({transferRequests.length})
            </button>

            <button
              onClick={() => setActiveTab("integrity")}
              className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === "integrity"
                  ? "bg-white text-brand-900 font-bold shadow-sm"
                  : "text-brand-100 hover:bg-brand-800 hover:text-white"
              }`}
            >
              🔒 Kiểm toán Blockchain SHA-256
            </button>

            {[
              "farm_admin",
              "processor_admin",
              "distributor_admin",
              "auditor",
            ].includes(user?.role) && (
              <button
                onClick={() => setActiveTab("recall")}
                className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                  activeTab === "recall"
                    ? "bg-white text-brand-900 font-bold shadow-sm"
                    : "text-brand-100 hover:bg-brand-800 hover:text-white"
                }`}
              >
                🚨 Lệnh Thu hồi ({recallReports.length})
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex-1">
        {/* Global Alert Notification */}
        {!!submission.message && (
          <div
            className={`mb-6 p-4 rounded-lg text-sm font-semibold flex items-center justify-between gap-2 shadow-sm ${
              submission.tone === "error"
                ? "bg-rose-50 border border-rose-200 text-rose-800"
                : "bg-emerald-50 border border-emerald-200 text-emerald-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {submission.tone === "error" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
              <span>{submission.message}</span>
            </div>
            <button
              onClick={() => setSubmission({ message: "", tone: "" })}
              className="text-xs opacity-70 hover:opacity-100 px-2 py-0.5 rounded border"
            >
              Đóng
            </button>
          </div>
        )}

        {/* ----------------- TAB: CATALOG ----------------- */}
        {activeTab === "catalog" && ["farm_admin", "processor_admin", "distributor_admin"].includes(user?.role) && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="text-brand-600" /> Quản lý Danh mục cốt lõi
            </h2>

            <div className={`grid grid-cols-1 ${user?.role === "farm_admin" ? "md:grid-cols-2" : ""} gap-6`}>
              {/* Product Form & List */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Box className="text-brand-600" size={20} /> Sản phẩm ({products.length})
                  </h3>
                </div>
                
                {/* Form Section */}
                <div className="p-5 bg-slate-50/30 border-b border-slate-100">
                  <form onSubmit={handleProductSubmit} className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Tên sản phẩm <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        placeholder="VD: Dưa hấu đỏ..."
                        className="w-full text-sm border-slate-300 rounded-lg focus:border-brand-500 focus:ring-brand-500 shadow-sm"
                        value={productForm.name}
                        onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="w-full sm:w-32">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Đơn vị <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        placeholder="kg, hộp, tấn..."
                        className="w-full text-sm border-slate-300 rounded-lg focus:border-brand-500 focus:ring-brand-500 shadow-sm"
                        value={productForm.unit}
                        onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                        required
                      />
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className="w-full sm:w-auto bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors h-[38px]">
                        <Plus size={16} /> Thêm
                      </button>
                    </div>
                  </form>
                </div>

                {/* List Section */}
                <div className="flex-1 overflow-y-auto max-h-96 p-5">
                  {products.length === 0 ? (
                    <EmptyState icon={<Box />} message="Chưa có sản phẩm nào. Hãy thêm sản phẩm đầu tiên của bạn." />
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {products.map((p) => (
                        <div key={p.id} className="group flex justify-between items-center p-3 sm:p-4 border border-slate-200 rounded-xl hover:border-brand-300 hover:shadow-md transition-all bg-white">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-800">{p.name}</div>
                              <div className="text-xs text-slate-500 mt-0.5">Đơn vị tính: <span className="font-medium text-slate-700">{p.unit}</span></div>
                            </div>
                          </div>
                          <button onClick={() => handleDeleteProduct(p.id, p.name)} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-lg transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100" title="Xóa">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Farm Form & List */}
              {user?.role === "farm_admin" && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <MapPin className="text-brand-600" size={20} /> Trang trại ({farms.length})
                    </h3>
                  </div>
                  
                  {/* Form Section */}
                  <div className="p-5 bg-slate-50/30 border-b border-slate-100">
                    <form onSubmit={handleFarmSubmit} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Tên trang trại <span className="text-rose-500">*</span></label>
                        <input
                          type="text"
                          placeholder="VD: Nông trại Hạnh Phúc..."
                          className="w-full text-sm border-slate-300 rounded-lg focus:border-brand-500 focus:ring-brand-500 shadow-sm"
                          value={farmForm.name}
                          onChange={(e) => setFarmForm({ ...farmForm, name: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Địa chỉ chi tiết</label>
                        <input
                          type="text"
                          placeholder="Số nhà, đường, xã/phường..."
                          className="w-full text-sm border-slate-300 rounded-lg focus:border-brand-500 focus:ring-brand-500 shadow-sm"
                          value={farmForm.address}
                          onChange={(e) => setFarmForm({ ...farmForm, address: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Vĩ độ (Latitude)</label>
                          <input
                            type="number" step="any"
                            placeholder="VD: 12.710"
                            className="w-full text-sm border-slate-300 rounded-lg focus:border-brand-500 focus:ring-brand-500 shadow-sm"
                            value={farmForm.latitude}
                            onChange={(e) => setFarmForm({ ...farmForm, latitude: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Kinh độ (Longitude)</label>
                          <input
                            type="number" step="any"
                            placeholder="VD: 108.120"
                            className="w-full text-sm border-slate-300 rounded-lg focus:border-brand-500 focus:ring-brand-500 shadow-sm"
                            value={farmForm.longitude}
                            onChange={(e) => setFarmForm({ ...farmForm, longitude: e.target.value })}
                          />
                        </div>
                      </div>
                      <button type="submit" className="w-full bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors mt-2">
                        <Plus size={16} /> Đăng ký Trang trại
                      </button>
                    </form>
                  </div>

                  {/* List Section */}
                  <div className="flex-1 overflow-y-auto max-h-96 p-5">
                    {farms.length === 0 ? (
                      <EmptyState icon={<MapPin />} message="Bạn chưa đăng ký trang trại nào." />
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {farms.map((f) => (
                          <div key={f.id} className="group flex justify-between items-start p-4 border border-slate-200 rounded-xl hover:border-brand-300 hover:shadow-md transition-all bg-white relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-brand-500"></div>
                            <div className="pl-2">
                              <div className="font-bold text-slate-800">{f.name}</div>
                              <div className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                                <MapPin size={12} className="mt-0.5 shrink-0" />
                                <span>{f.address || "Chưa cập nhật địa chỉ"}</span>
                              </div>
                              {(f.latitude || f.longitude) && (
                                <div className="text-[10px] text-brand-600 mt-2 font-mono bg-brand-50 inline-block px-2 py-0.5 rounded border border-brand-100">
                                  {f.latitude}, {f.longitude}
                                </div>
                              )}
                            </div>
                            <button onClick={() => handleDeleteFarm(f.id, f.name)} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-lg transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100" title="Xóa">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------- TAB 1: OVERVIEW ----------------- */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Quick Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">Tổng số lô hàng</div>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
                  {dashboard?.totals?.total_batches ?? batches.length}
                </div>
                <div className="text-xs text-slate-500 mt-1">Đã cấp mã TCVN/GS1</div>
              </div>

              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">Chuỗi lạnh đạt chuẩn</div>
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 mt-2">
                  {batches.filter((b) => !b.cold_chain_alert).length}
                </div>
                <div className="text-xs text-emerald-700 mt-1">Nhiệt độ an toàn ≤ 8°C</div>
              </div>

              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">Cảnh báo nhiệt độ</div>
                <div className="text-2xl sm:text-3xl font-extrabold text-rose-700 mt-2">
                  {batches.filter((b) => b.cold_chain_alert).length}
                </div>
                <div className="text-xs text-rose-700 mt-1">Vi phạm ngưỡng chuỗi lạnh</div>
              </div>

              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">Yêu cầu bàn giao</div>
                <div className="text-2xl sm:text-3xl font-extrabold text-blue-700 mt-2">
                  {transferRequests.length}
                </div>
                <div className="text-xs text-blue-700 mt-1">Phiếu vận chuyển liên kết</div>
              </div>
            </div>

            {/* Recent Batches & Quick Status Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 5 Recent Batches Table */}
              <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-sm sm:text-base">Lô nông sản mới cập nhật</h2>
                  <button
                    onClick={() => setActiveTab("batches")}
                    className="text-xs font-semibold text-brand-800 hover:underline"
                  >
                    Xem tất cả ({batches.length}) →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-3 font-semibold">Mã lô</th>
                        <th className="p-3 font-semibold">Sản phẩm</th>
                        <th className="p-3 font-semibold">Khối lượng</th>
                        <th className="p-3 font-semibold">Trạng thái</th>
                        <th className="p-3 font-semibold">Chuỗi lạnh</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {batches.slice(0, 5).map((batch) => (
                        <tr
                          key={batch.id}
                          onClick={() => handleSelectBatch(batch.id)}
                          className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                            selectedBatch?.id === batch.id ? "bg-emerald-50/50" : ""
                          }`}
                        >
                          <td className="p-3 font-bold text-brand-800">{batch.batch_code}</td>
                          <td className="p-3 text-slate-800 font-medium">{batch.product_name}</td>
                          <td className="p-3 text-slate-600">
                            {Number(batch.remaining_quantity).toLocaleString()} kg
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                statusColors[batch.status] || "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {statusLabels[batch.status] || batch.status}
                            </span>
                          </td>
                          <td className="p-3">
                            {batch.cold_chain_alert ? (
                              <span className="text-rose-700 font-bold text-xs flex items-center gap-1">
                                <AlertTriangle size={14} /> Vi phạm
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                                <Thermometer size={14} /> {batch.temperature_c ?? 5}°C
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Active Cold Chain Monitor Card */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base mb-1">
                    Trạng thái Lô đang chọn
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Bấm vào một lô bất kỳ trong bảng để xem chi tiết giám sát.
                  </p>

                  {selectedBatch ? (
                    <div className="space-y-3 text-xs sm:text-sm">
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-xs text-slate-500">Mã lô được chọn:</div>
                        <div className="text-base font-bold text-brand-900 mt-0.5">
                          {selectedBatch.batch_code}
                        </div>
                        <div className="text-slate-700 mt-1 font-medium">
                          {selectedBatch.product_name} · {Number(selectedBatch.remaining_quantity).toLocaleString()} kg
                        </div>
                      </div>

                      <div className="p-3 rounded-lg border flex items-center justify-between">
                        <div>
                          <div className="text-xs text-slate-500">Nhiệt độ hiện tại:</div>
                          <div
                            className={`text-xl font-extrabold mt-0.5 ${
                              selectedBatch.cold_chain_alert ? "text-rose-700" : "text-emerald-700"
                            }`}
                          >
                            {selectedBatch.temperature_c ?? "--"}°C
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded text-xs font-bold ${
                            selectedBatch.cold_chain_alert
                              ? "bg-rose-100 text-rose-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {selectedBatch.cold_chain_alert ? "Cảnh báo vi phạm" : "Đạt chuẩn an toàn"}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 border text-xs text-slate-600">
                        <div className="flex items-center gap-1 font-medium text-slate-700">
                          <MapPin size={14} className="text-brand-700" />
                          <span>Vị trí hiện tại:</span>
                        </div>
                        <div className="mt-1 font-semibold text-slate-900">
                          {selectedBatch.current_location || "Vùng trồng Tây Nguyên"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Chưa chọn lô hàng nào.
                    </div>
                  )}
                </div>

                {selectedBatch && (
                  <div className="pt-4 border-t border-slate-100 mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleSensorSimulation(selectedBatch.id)}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold transition-colors"
                    >
                      ⚡ Giả lập cảm biến nhiệt độ IoT
                    </button>
                    <Link
                      to={`/trace/${encodeURIComponent(selectedBatch.batch_code)}`}
                      target="_blank"
                      className="w-full py-2 bg-brand-800 hover:bg-brand-900 text-white rounded text-xs font-semibold text-center transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink size={14} /> Mở trang truy xuất công khai
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDownloadAuditReport(selectedBatch.id, selectedBatch.batch_code)}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Download size={14} /> Tải hồ sơ kiểm tra (JSON)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ----------------- TAB 2: QUẢN LÝ LÔ HÀNG ----------------- */}
        {activeTab === "batches" && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Danh mục Lô nông sản</h2>
                <p className="text-xs text-slate-500">
                  Tra cứu, xem mã định danh và hành trình chuỗi lạnh của toàn bộ lô hàng.
                </p>
              </div>

              {user?.role === "farm_admin" && (
                <button
                  type="button"
                  onClick={() => setActiveTab("harvest")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-800 hover:bg-brand-900 text-white text-xs font-semibold rounded-md shadow-sm transition-all"
                >
                  <Plus size={16} /> Tạo lô thu hoạch mới
                </button>
              )}
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                  placeholder="Tìm theo mã lô hoặc tên sản phẩm..."
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded border border-slate-300 outline-none focus:border-brand-700"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs sm:text-sm rounded border border-slate-300 outline-none focus:border-brand-700"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="registered">Đã đăng ký</option>
                <option value="in_transit">Đang vận chuyển</option>
                <option value="processed">Đã sơ chế</option>
                <option value="delivered">Đã giao nhận</option>
                <option value="recalled">Đang thu hồi</option>
              </select>
            </div>

            {/* Batches Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="p-3">Mã lô hàng</th>
                    <th className="p-3">Sản phẩm</th>
                    <th className="p-3">Khối lượng</th>
                    <th className="p-3">Vị trí hiện tại</th>
                    <th className="p-3">Nhiệt độ IoT</th>
                    <th className="p-3">Trạng thái</th>
                    <th className="p-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBatches.map((batch) => (
                    <tr
                      key={batch.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        selectedBatch?.id === batch.id ? "bg-emerald-50/40" : ""
                      }`}
                    >
                      <td className="p-3 font-bold text-brand-800">{batch.batch_code}</td>
                      <td className="p-3 font-semibold text-slate-800">{batch.product_name}</td>
                      <td className="p-3 text-slate-600">
                        {Number(batch.remaining_quantity).toLocaleString()} kg
                      </td>
                      <td className="p-3 text-slate-600">{batch.current_location || "Tây Nguyên"}</td>
                      <td className="p-3">
                        <span
                          className={`font-bold inline-flex items-center gap-1 ${
                            batch.cold_chain_alert ? "text-rose-700" : "text-emerald-700"
                          }`}
                        >
                          <Thermometer size={14} /> {batch.temperature_c ?? "--"}°C
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            statusColors[batch.status] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {statusLabels[batch.status] || batch.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSelectBatch(batch.id)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
                          >
                            Chi tiết
                          </button>
                          <Link
                            to={`/trace/${encodeURIComponent(batch.batch_code)}`}
                            target="_blank"
                            className="px-2 py-1 bg-brand-50 hover:bg-brand-100 text-brand-800 rounded text-xs font-medium transition-colors"
                          >
                            Tra cứu
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ----------------- TAB 3: THU HOẠCH & THỬA ĐẤT (FARM ADMIN) ----------------- */}
        {activeTab === "harvest" && user?.role === "farm_admin" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form Thu hoạch Lô Hàng */}
            <div className="lg:col-span-7 bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                <span className="flex h-8 w-8 items-center justify-center rounded bg-emerald-100 text-emerald-800">
                  <Sprout size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">Tạo Lô Thu Hoạch Nông Sản</h2>
                  <p className="text-xs text-slate-500">
                    Nhập nhanh sản lượng thu hoạch tại ruộng. Dữ liệu sẽ được gắn mã băm Blockchain.
                  </p>
                </div>
              </div>

              {harvestError && (
                <div className="mb-4 p-3 rounded bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  {harvestError.message}
                </div>
              )}

              <form onSubmit={handleHarvestSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Thửa đất thu hoạch
                    </label>
                    <select
                      value={harvestForm.landPlotId}
                      onChange={(e) => setHarvestForm({ ...harvestForm, landPlotId: e.target.value })}
                      required
                      className="w-full p-2.5 rounded border border-slate-300 text-sm outline-none focus:border-brand-700"
                    >
                      <option value="">-- Chọn thửa đất --</option>
                      {landPlots.map((plot) => (
                        <option key={plot.id} value={plot.id}>
                          {plot.name} ({plot.area_ha || 1} ha)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Loại nông sản
                    </label>
                    <select
                      value={harvestForm.productId}
                      onChange={(e) => setHarvestForm({ ...harvestForm, productId: e.target.value })}
                      required
                      className="w-full p-2.5 rounded border border-slate-300 text-sm outline-none focus:border-brand-700"
                    >
                      <option value="">-- Chọn nông sản --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">
                      Khối lượng thu hoạch (kg)
                    </label>
                    {/* Quick quantity presets */}
                    <div className="flex gap-1">
                      {[200, 500, 1000, 2000].map((kg) => (
                        <button
                          key={kg}
                          type="button"
                          onClick={() => setHarvestForm({ ...harvestForm, quantityKg: String(kg) })}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 transition-colors"
                        >
                          {kg} kg
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={harvestForm.quantityKg}
                    onChange={(e) => setHarvestForm({ ...harvestForm, quantityKg: e.target.value })}
                    required
                    className="w-full p-2.5 rounded border border-slate-300 text-sm outline-none focus:border-brand-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Ngày thu hoạch
                  </label>
                  <input
                    type="date"
                    value={harvestForm.harvestedAt}
                    onChange={(e) => setHarvestForm({ ...harvestForm, harvestedAt: e.target.value })}
                    required
                    className="w-full p-2.5 rounded border border-slate-300 text-sm outline-none focus:border-brand-700"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingHarvest}
                  className="w-full py-3 bg-brand-800 hover:bg-brand-900 text-white font-bold text-sm rounded shadow transition-all disabled:opacity-50"
                >
                  {isSubmittingHarvest ? "Đang tạo mã lô & ký số..." : "Xác nhận tạo lô thu hoạch"}
                </button>
              </form>
            </div>

            {/* Form Khai báo Thửa đất */}
            <div className="lg:col-span-5 bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">Khai Báo Thửa Đất Mới</h3>
                <p className="text-xs text-slate-500">
                  Đăng ký mã vùng trồng & toạ độ GPS theo chuẩn TCVN.
                </p>
              </div>

              <form onSubmit={handleLandPlotSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tên thửa</label>
                  <input
                    type="text"
                    required
                    value={landPlotForm.name}
                    onChange={(e) => setLandPlotForm({ ...landPlotForm, name: e.target.value })}
                    placeholder="VD: Thửa B1 - Vườn Đắk Lắk"
                    className="w-full p-2 rounded border border-slate-300 text-xs sm:text-sm outline-none focus:border-brand-700"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Diện tích (ha)</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={landPlotForm.areaHa}
                      onChange={(e) => setLandPlotForm({ ...landPlotForm, areaHa: e.target.value })}
                      className="w-full p-2 rounded border border-slate-300 text-xs sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Vĩ độ</label>
                    <input
                      type="number"
                      step="0.0001"
                      required
                      value={landPlotForm.latitude}
                      onChange={(e) => setLandPlotForm({ ...landPlotForm, latitude: e.target.value })}
                      className="w-full p-2 rounded border border-slate-300 text-xs sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Kinh độ</label>
                    <input
                      type="number"
                      step="0.0001"
                      required
                      value={landPlotForm.longitude}
                      onChange={(e) => setLandPlotForm({ ...landPlotForm, longitude: e.target.value })}
                      className="w-full p-2 rounded border border-slate-300 text-xs sm:text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded transition-colors"
                >
                  Lưu thông tin thửa đất
                </button>
              </form>

              {/* Danh sách thửa đất hiện có */}
              <div className="pt-3 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-700 mb-2">Thửa đất đã đăng ký ({landPlots.length}):</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {landPlots.map((plot) => (
                    <div key={plot.id} className="p-2 rounded bg-slate-50 border border-slate-200 text-xs flex items-center justify-between group">
                      <div>
                        <div className="font-semibold text-slate-800">{plot.name}</div>
                        <div className="text-slate-500">{plot.area_ha || 1} ha</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteLandPlot(plot.id, plot.name)}
                        className="p-1.5 text-rose-400 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                        title="Xóa thửa đất"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- TAB 4: GIÁM SÁT CHUỖI LẠNH ----------------- */}
        {activeTab === "coldchain" && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Giám sát Nhiệt độ Chuỗi Lạnh</h2>
                <p className="text-xs text-slate-500">
                  Quy chuẩn nhiệt độ bảo quản lạnh: <strong>2°C đến 8°C</strong>. Hệ thống tự động kích hoạt cờ cảnh báo nếu vượt ngưỡng.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-xs font-bold">
                  An toàn: ≤ 8°C
                </span>
                <span className="px-3 py-1 bg-rose-50 text-rose-800 border border-rose-200 rounded text-xs font-bold">
                  Cảnh báo: &gt; 8°C
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {batches.map((batch) => {
                const isViolated = Boolean(batch.cold_chain_alert);
                return (
                  <div
                    key={batch.id}
                    className={`p-4 rounded-lg border bg-white shadow-sm flex flex-col justify-between transition-all ${
                      isViolated ? "border-rose-300 ring-1 ring-rose-200" : "border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-brand-900 text-sm">{batch.batch_code}</div>
                          <div className="text-xs font-semibold text-slate-700">{batch.product_name}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isViolated ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {isViolated ? "Vi phạm" : "Đạt chuẩn"}
                        </span>
                      </div>

                      <div className="my-3 flex items-baseline gap-2">
                        <span className={`text-2xl font-extrabold ${isViolated ? "text-rose-700" : "text-emerald-700"}`}>
                          {batch.temperature_c ?? 5}°C
                        </span>
                        <span className="text-xs text-slate-400">cảm biến gần nhất</span>
                      </div>

                      <div className="text-xs text-slate-500 space-y-1">
                        <div>Vị trí: <strong>{batch.current_location || "Vùng trồng Tây Nguyên"}</strong></div>
                        <div>Khối lượng: <strong>{Number(batch.remaining_quantity).toLocaleString()} kg</strong></div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSensorSimulation(batch.id)}
                        className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold transition-colors"
                      >
                        ⚡ Giả lập cảm biến
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectBatch(batch.id)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition-colors"
                      >
                        Xem vết
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ----------------- TAB 5: BÀN GIAO VẬN CHUYỂN ----------------- */}
        {activeTab === "transfer" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form Gửi Yêu Cầu Bàn Giao */}
            <div className="lg:col-span-5 bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h2 className="font-bold text-slate-900 text-base">Tạo Phiếu Bàn Giao Lô Hàng</h2>
                <p className="text-xs text-slate-500">
                  Chuyển quyền quản lý lô hàng giữa Nông trại → Cơ sở sơ chế → Điểm phân phối.
                </p>
              </div>

              <form onSubmit={handleTransferSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Lô hàng chuyển</label>
                  <select
                    required
                    value={transferForm.batchId}
                    onChange={(e) => setTransferForm({ ...transferForm, batchId: e.target.value })}
                    className="w-full p-2.5 rounded border border-slate-300 text-xs sm:text-sm outline-none focus:border-brand-700"
                  >
                    <option value="">-- Chọn lô hàng --</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_code} ({b.product_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Đơn vị nhận</label>
                  <select
                    required
                    value={transferForm.toOrganizationId}
                    onChange={(e) => setTransferForm({ ...transferForm, toOrganizationId: e.target.value })}
                    className="w-full p-2.5 rounded border border-slate-300 text-xs sm:text-sm outline-none focus:border-brand-700"
                  >
                    <option value="">-- Chọn đơn vị nhận --</option>
                    <option value="2">HTX Sơ chế Hà Nội (Cơ sở chế biến)</option>
                    <option value="3">Cửa hàng Organic Market (Điểm phân phối)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Ghi chú vận chuyển</label>
                  <input
                    type="text"
                    value={transferForm.note}
                    onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })}
                    placeholder="VD: Xe tải lạnh 29C-12345, nhiệt độ cài đặt 4°C"
                    className="w-full p-2.5 rounded border border-slate-300 text-xs sm:text-sm outline-none focus:border-brand-700"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-brand-800 hover:bg-brand-900 text-white font-bold text-xs sm:text-sm rounded shadow transition-colors"
                >
                  Gửi yêu cầu bàn giao
                </button>
              </form>
            </div>

            {/* Danh Sách Phiếu Bàn Giao */}
            <div className="lg:col-span-7 bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
              <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-base">Lịch Sử & Tiếp Nhận Bàn Giao</h3>
                <span className="text-xs text-slate-500">{transferRequests.length} phiếu</span>
              </div>

              {transferRequests.length === 0 ? (
                <EmptyState title="Chưa có yêu cầu bàn giao" description="Chưa có phiếu chuyển giao nào được tạo." />
              ) : (
                <div className="space-y-3">
                  {transferRequests.map((request) => {
                    const isIncoming = request.to_organization_id === user?.organizationId;
                    const canDecide = request.status === "pending" && isIncoming;
                    return (
                      <div
                        key={request.id}
                        className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{request.batch_code}</div>
                          <div className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                            <span>{request.from_organization_name}</span>
                            <ArrowRightLeft size={12} className="text-slate-400" />
                            <span className="font-semibold text-slate-900">{request.to_organization_name}</span>
                          </div>
                          {request.note && (
                            <div className="text-[11px] text-slate-500 mt-1 italic">
                              "{request.note}"
                            </div>
                          )}
                          <div className="mt-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                request.status === "confirmed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : request.status === "rejected"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {request.status}
                            </span>
                          </div>
                        </div>

                        {canDecide && (
                          <div className="flex sm:flex-col gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleTransferDecision(request.id, "confirmed")}
                              className="px-3 py-1.5 bg-brand-800 hover:bg-brand-900 text-white rounded text-xs font-semibold transition-colors"
                            >
                              Xác nhận nhận lô
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTransferDecision(request.id, "rejected")}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-semibold transition-colors"
                            >
                              Từ chối
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------- TAB 6: KIỂM TOÁN BLOCKCHAIN (INTEGRITY) ----------------- */}
        {/* ----------------- TAB 6: KIỂM TOÁN BLOCKCHAIN (INTEGRITY) ----------------- */}
        {activeTab === "integrity" && (
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Kiểm Toán Tính Toàn Vẹn Blockchain (SHA-256)</h2>
                <p className="text-xs text-slate-500">
                  Phát hiện giả mạo dữ liệu. Xác minh liên kết chuỗi băm để chứng minh dữ liệu đáng tin cậy.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 space-y-3 max-h-[70vh] overflow-y-auto pr-2">
                {batches.map((batch) => (
                  <div key={batch.id} className={`p-4 rounded-lg border flex flex-col justify-between transition-colors ${selectedBatch?.id === batch.id ? "border-brand-500 bg-brand-50/30" : "border-slate-200 bg-slate-50/50"}`}>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{batch.batch_code}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{batch.product_name}</div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Tổ chức: <strong>{batch.organization_name}</strong>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-200 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleVerifyIntegrity(batch)}
                        className={`flex-1 py-1.5 rounded text-xs font-semibold transition-colors ${selectedBatch?.id === batch.id ? "bg-brand-900 text-white" : "bg-brand-800 hover:bg-brand-900 text-white"}`}
                      >
                        Kiểm tra Hash Chain
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAuditExport(batch.id)}
                        className="px-2.5 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded text-xs font-semibold transition-colors"
                        title="Xuất file JSON kiểm toán"
                      >
                        <Download size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="lg:col-span-8 bg-slate-50 rounded-lg border border-slate-200 p-5">
                {selectedBatch && selectedBatch.integrity ? (
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                      <div>
                        <h3 className="font-bold text-slate-900">Chi tiết chuỗi sự kiện lô: {selectedBatch.batch_code}</h3>
                        <p className="text-xs text-slate-500 mt-1">Tổng cộng {selectedBatch.integrity.total_events} sự kiện mã hóa</p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${selectedBatch.integrity.is_valid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                        {selectedBatch.integrity.is_valid ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
                        {selectedBatch.integrity.is_valid ? "Toàn vẹn 100%" : "Phát hiện giả mạo"}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {selectedBatch.integrity.events?.map((ev, index) => (
                        <div key={ev.event_id || index} className={`relative p-4 rounded-lg border flex flex-col gap-2 shadow-sm ${ev.status === "VALID" ? "bg-white border-slate-200" : ev.status === "TAMPERED" ? "bg-rose-50 border-rose-300" : "bg-amber-50 border-amber-300"}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sự kiện #{index + 1}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${ev.status === "VALID" ? "bg-emerald-100 text-emerald-800" : ev.status === "TAMPERED" ? "bg-rose-600 text-white" : "bg-amber-100 text-amber-800"}`}>
                              {ev.status === "VALID" ? "Khớp Hash" : ev.status === "TAMPERED" ? "Bị sửa lén" : "Mất liên kết"}
                            </span>
                          </div>
                          
                          <div className="text-sm font-semibold text-slate-900">ID: {ev.event_id}</div>
                          
                          {ev.status === "TAMPERED" && (
                            <div className="text-xs text-rose-700 bg-rose-100/50 p-2 rounded mt-1 border border-rose-200">
                              <strong>Phân tích:</strong> Nội dung (data_json) đã bị thay đổi trái phép. Mã Hash hiện tại không khớp với nội dung thực tế.
                            </div>
                          )}
                          {ev.status === "SUSPECT" && (
                            <div className="text-xs text-amber-800 bg-amber-100/50 p-2 rounded mt-1 border border-amber-200">
                              <strong>Phân tích:</strong> Sự kiện này đáng ngờ vì liên kết `previous_hash` bị đứt gãy từ sự kiện trước đó.
                            </div>
                          )}
                        </div>
                      ))}
                      {selectedBatch.integrity.total_events === 0 && (
                        <div className="text-center py-8 text-sm text-slate-500">
                          Chưa có sự kiện nào được ghi nhận cho lô hàng này.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                    <ShieldCheck size={48} className="mb-4 opacity-50" />
                    <p className="text-sm font-medium">Bấm "Kiểm tra Hash Chain" để phân tích</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ----------------- TAB 7: LỆNH THU HỒI (RECALL) ----------------- */}
        {activeTab === "recall" && (
          <div className="space-y-6">
            {user?.role !== "auditor" && (
              <div className="bg-white p-6 rounded-lg border border-rose-200 shadow-sm space-y-4">
                <div className="pb-3 border-b border-rose-100">
                  <h2 className="font-bold text-rose-800 text-base flex items-center gap-2">
                    <Siren size={18} /> Kích Hoạt Lệnh Thu Hồi Khẩn Cấp
                  </h2>
                  <p className="text-xs text-slate-500">
                    Sử dụng khi phát hiện nguy cơ an toàn thực phẩm hoặc vi phạm nghiêm trọng chuỗi lạnh.
                  </p>
                </div>

                <form onSubmit={handleRecallSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <select
                      required
                      value={recallForm.batchId}
                      onChange={(e) => setRecallForm({ ...recallForm, batchId: e.target.value })}
                      className="w-full p-2.5 rounded border border-slate-300 text-xs sm:text-sm outline-none focus:border-rose-600"
                    >
                      <option value="">-- Chọn lô thu hồi --</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batch_code} ({b.product_name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-6">
                    <input
                      type="text"
                      required
                      minLength={5}
                      value={recallForm.reason}
                      onChange={(e) => setRecallForm({ ...recallForm, reason: e.target.value })}
                      placeholder="Lý do thu hồi (VD: Phát hiện vi phạm nhiệt độ bảo quản lạnh)"
                      className="w-full p-2.5 rounded border border-slate-300 text-xs sm:text-sm outline-none focus:border-rose-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs sm:text-sm rounded transition-colors"
                    >
                      Thu hồi
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Danh sách báo cáo thu hồi */}
            <div className="space-y-4">
              {recallReports.map((report) => (
                <div key={report.id} className="bg-white rounded-lg border border-rose-200 shadow-sm p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-100 pb-3">
                    <div>
                      <div className="text-sm font-bold text-rose-900">
                        Lệnh thu hồi #{report.id} · <span className="font-mono">{report.root_batch_code}</span>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">Lý do: {report.reason}</div>
                    </div>
                    <div className="text-xs font-semibold text-slate-700">
                      Còn tại điểm bán: <span className="text-rose-700 font-bold">{Number(report.totals?.remainingQuantity || 0).toLocaleString()} kg</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-rose-50/50 text-rose-900 border-b border-rose-100">
                        <tr>
                          <th className="p-2 font-semibold">Mã lô</th>
                          <th className="p-2 font-semibold">Đơn vị giữ</th>
                          <th className="p-2 font-semibold">Vị trí</th>
                          <th className="p-2 font-semibold">Còn tồn</th>
                          <th className="p-2 font-semibold">Đã tiêu thụ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.items?.map((item) => (
                          <tr key={item.batch_id}>
                            <td className="p-2 font-bold text-slate-900">{item.batch_code}</td>
                            <td className="p-2 text-slate-700">{item.organization_name}</td>
                            <td className="p-2 text-slate-600">{item.current_location || "Kho"}</td>
                            <td className="p-2 font-bold text-rose-700">{Number(item.remaining_quantity).toLocaleString()} kg</td>
                            <td className="p-2 text-slate-600">{Number(item.consumed_quantity).toLocaleString()} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ----------------- KHỐI CHI TIẾT SỰ KIỆN LÔ ĐANG CHỌN (GỌN GÀNG, KHÔNG RƯỜM RÀ) ----------------- */}
        {selectedBatch && (
          <div className="mt-8 bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-brand-800">
                  Hồ sơ chi tiết lô hàng
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                  {selectedBatch.batch_code} — {selectedBatch.product_name}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
                >
                  <ShieldCheck size={14} className="text-brand-700" />
                  <span>{showTechnicalDetails ? "Ẩn mã băm SHA-256" : "Xem mã băm SHA-256"}</span>
                  {showTechnicalDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <Link
                  to={`/trace/${encodeURIComponent(selectedBatch.batch_code)}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-brand-800 hover:bg-brand-900 text-xs font-semibold text-white shadow-sm transition-colors"
                >
                  <ExternalLink size={14} /> Xem trang công khai
                </Link>
              </div>
            </div>

            {/* Event Timeline (Thân thiện, Dễ hiểu cho người mới) */}
            <div>
              <div className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Activity size={16} className="text-brand-700" />
                Chuỗi sự kiện lịch sử ({selectedBatch.events?.length || 0} sự kiện)
              </div>

              <div className="space-y-3">
                {selectedBatch.events?.map((ev, index) => {
                  let parsedData = {};
                  try {
                    parsedData = JSON.parse(ev.data_json);
                  } catch {
                    // skip
                  }

                  return (
                    <div
                      key={ev.id || index}
                      className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-800 text-white font-bold text-[10px]">
                            {index + 1}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">
                            {eventLabels[ev.event_type] || ev.event_type}
                          </span>
                        </div>
                        <span className="text-slate-500 font-mono text-[11px]">
                          {new Date(ev.timestamp).toLocaleString("vi-VN")}
                        </span>
                      </div>

                      <div className="text-slate-600 pl-7 flex flex-wrap gap-x-4 gap-y-1">
                        {ev.actor_name && (
                          <span>Người thực hiện: <strong>{ev.actor_name}</strong></span>
                        )}
                        {parsedData.source_farm && (
                          <span>Vườn: <strong>{parsedData.source_farm}</strong></span>
                        )}
                        {parsedData.initial_quantity && (
                          <span>Khối lượng: <strong>{parsedData.initial_quantity} kg</strong></span>
                        )}
                        {parsedData.temperature !== undefined && (
                          <span>Nhiệt độ: <strong>{parsedData.temperature}°C</strong></span>
                        )}
                      </div>

                      {/* Technical Blockchain Hashes (Chỉ hiện khi người dùng bấm xem) */}
                      {showTechnicalDetails && (
                        <div className="mt-2 pl-7 pt-2 border-t border-slate-200 font-mono text-[10px] text-slate-500 space-y-1 bg-white p-2 rounded">
                          <div className="truncate">
                            <span className="font-semibold text-slate-600">Previous Hash:</span> {ev.previous_hash}
                          </div>
                          <div className="truncate">
                            <span className="font-semibold text-slate-600">Current Hash:</span> {ev.current_hash}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {/* ----------------- TAB: TÁCH VÀ GỘP LÔ (SPRINT 3) ----------------- */}
        {activeTab === "split_merge" && ["processor_admin", "farm_admin"].includes(user?.role) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form Tách Lô */}
            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-base">Tách Lô Nông Sản (Split)</h3>
                <p className="text-xs text-slate-500">
                  Chia một lô lớn thành các lô nhỏ để phân phối. Lịch sử nguồn gốc sẽ được kế thừa.
                </p>
              </div>

              <form onSubmit={handleSplitSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Chọn lô để tách</label>
                  <select
                    required
                    value={splitForm.batchId}
                    onChange={(e) => setSplitForm({ ...splitForm, batchId: e.target.value })}
                    className="w-full p-2.5 rounded border border-slate-300 text-sm outline-none focus:border-brand-700"
                  >
                    <option value="">-- Chọn lô hàng gốc --</option>
                    {batches.filter(b => b.remaining_quantity > 0).map(b => (
                      <option key={b.id} value={b.id}>{b.batch_code} ({b.product_name}) - Còn {b.remaining_quantity}kg</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-3">
                  {splitForm.parts.map((part, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <div className="flex-1">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Khối lượng lô con {idx + 1} (kg)</label>
                        <input
                          type="number"
                          required
                          value={part.quantity}
                          onChange={(e) => {
                            const newParts = [...splitForm.parts];
                            newParts[idx].quantity = e.target.value;
                            setSplitForm({ ...splitForm, parts: newParts });
                          }}
                          className="w-full p-2 rounded border border-slate-300 text-sm"
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSplitForm({ ...splitForm, parts: [...splitForm.parts, { quantity: "" }] })}
                    className="text-xs text-brand-700 font-semibold hover:underline"
                  >
                    + Thêm lô con
                  </button>
                </div>

                <button type="submit" className="w-full py-2 bg-brand-800 hover:bg-brand-900 text-white font-semibold text-sm rounded shadow transition-colors">
                  Xác nhận tách lô
                </button>
              </form>
            </div>

            {/* Form Gộp Lô */}
            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-base">Gộp Lô Nông Sản (Merge)</h3>
                <p className="text-xs text-slate-500">
                  Gộp nhiều lô cùng loại thành một lô lớn để xuất khẩu/chế biến.
                </p>
              </div>

              <form onSubmit={handleMergeSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Chọn các lô để gộp (Chọn nhiều)</label>
                  <select
                    multiple
                    required
                    value={mergeForm.parentBatchIds}
                    onChange={(e) => {
                      const options = Array.from(e.target.options);
                      const selected = options.filter(opt => opt.selected).map(opt => opt.value);
                      setMergeForm({ ...mergeForm, parentBatchIds: selected });
                    }}
                    className="w-full p-2 rounded border border-slate-300 text-sm outline-none focus:border-brand-700 min-h-[120px]"
                  >
                    {batches.filter(b => b.remaining_quantity > 0).map(b => (
                      <option key={b.id} value={b.id}>{b.batch_code} ({b.product_name}) - {b.remaining_quantity}kg</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">Giữ Ctrl hoặc Command để chọn nhiều lô.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú (Tùy chọn)</label>
                  <input
                    type="text"
                    value={mergeForm.note}
                    onChange={(e) => setMergeForm({ ...mergeForm, note: e.target.value })}
                    placeholder="VD: Gộp lô xuất khẩu thị trường EU"
                    className="w-full p-2.5 rounded border border-slate-300 text-sm outline-none focus:border-brand-700"
                  />
                </div>

                <button type="submit" className="w-full py-2 bg-brand-800 hover:bg-brand-900 text-white font-semibold text-sm rounded shadow transition-colors">
                  Xác nhận gộp lô
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
