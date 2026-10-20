import { useEffect, useMemo, useState, useRef } from "react";
import {
  Activity,
  AlertCircle,
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
  ShoppingCart,
  Network,
  Boxes,
  X,
  XCircle,
  Upload,
  FileSpreadsheet,
  GitBranch,
  Layers,
  ArrowDown,
  Search,
} from "lucide-react";
import Sidebar from "../components/Sidebar.jsx";
import LineageGraphView from "../components/LineageGraphView.jsx";
import LocationsView from "../components/LocationsView.jsx";
import AuditLogsView from "../components/AuditLogsView.jsx";
import CsvImportView from "../components/CsvImportView.jsx";
import ConsumeModal from "../components/ConsumeModal.jsx";
import ConfirmSaveModal from "../components/ConfirmSaveModal.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import RecallManagementView from "../components/RecallManagementView.jsx";
import ColdChainView from "../components/ColdChainView.jsx";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { scrollToElement } from "../utils/scrollHelper.js";
import * as XLSX from "xlsx";

const EVENT_META = {
  batch_harvested:           { label: "Thu hoạch",           color: "bg-emerald-100 text-emerald-700",  icon: Tractor },
  batch_imported:            { label: "Nhập lô từ CSV",       color: "bg-cyan-100 text-cyan-700",        icon: ClipboardList },
  batch_processed:           { label: "Đã sơ chế",           color: "bg-blue-100 text-blue-700",       icon: ClipboardList },
  batch_in_transit:          { label: "Đang vận chuyển",     color: "bg-amber-100 text-amber-700",    icon: Truck },
  batch_delivered:           { label: "Đã giao",             color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  batch_transfer_requested:  { label: "Yêu cầu bàn giao",  color: "bg-violet-100 text-violet-700",   icon: ArrowRightLeft },
  batch_transferred:         { label: "Xác nhận bàn giao", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  batch_transfer_rejected:   { label: "Từ chối bàn giao",  color: "bg-rose-100 text-rose-700",      icon: ShieldAlert },
  batch_recalled:            { label: "Thu hồi",             color: "bg-rose-100 text-rose-700",      icon: Siren },
  cold_chain_violation:      { label: "Vi phạm chuỗi lạnh",color: "bg-rose-100 text-rose-700 ring-1 ring-rose-300 font-bold",  icon: AlertTriangle },
  COLD_CHAIN_VIOLATION:      { label: "Vi phạm chuỗi lạnh (IoT)", color: "bg-rose-100 text-rose-700 ring-1 ring-rose-300 font-bold", icon: AlertTriangle },
  temperature_series_recorded:{ label: "Ghi cảm biến",      color: "bg-sky-100 text-sky-700",        icon: Thermometer },
  temperature_check:         { label: "Kiểm tra nhiệt độ", color: "bg-sky-100 text-sky-700",        icon: Thermometer },
  temperature_violation:     { label: "Vi phạm nhiệt độ",  color: "bg-orange-100 text-orange-700",  icon: AlertTriangle },
  batch_split:               { label: "Tách lô",             color: "bg-indigo-100 text-indigo-700",  icon: ArrowRightLeft },
  batch_split_child:         { label: "Lô con (tách)",       color: "bg-indigo-100 text-indigo-700",  icon: ArrowRightLeft },
  batch_split_parent:        { label: "Lô cha (tách)",       color: "bg-indigo-100 text-indigo-700",  icon: ArrowRightLeft },
  batch_merge:               { label: "Gộp lô",              color: "bg-teal-100 text-teal-700",      icon: ArrowRightLeft },
  SPLIT:                     { label: "Tách lô (SPLIT)",     color: "bg-indigo-100 text-indigo-700",  icon: ArrowRightLeft },
  SPLIT_CHILD:               { label: "Lô con (SPLIT_CHILD)",color: "bg-indigo-100 text-indigo-700",  icon: ArrowRightLeft },
  MERGE:                     { label: "Gộp lô (MERGE)",      color: "bg-teal-100 text-teal-700",      icon: ArrowRightLeft },
  MERGE_CHILD:               { label: "Lô gộp (MERGE_CHILD)",color: "bg-teal-100 text-teal-700",      icon: ArrowRightLeft },
  batch_consumed:            { label: "Đã tiêu thụ",         color: "bg-slate-100 text-slate-700",    icon: ShoppingCart },
  location_assigned:         { label: "Gán địa điểm nội bộ", color: "bg-cyan-100 text-cyan-700",      icon: MapPin },
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
      className="inline-flex items-center gap-1 rounded-md border border-slate-200/90 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-600 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 transition-all duration-150 cursor-pointer shadow-2xs"
    >
      <span className="text-slate-400 font-sans">{label}:</span> <span className="font-semibold text-slate-800">{short}</span>
      <span className={`ml-1 text-[9px] ${copied ? "font-bold text-emerald-600" : "text-slate-400"}`}>{copied ? "✓" : "⎘"}</span>
    </button>
  );
}

const STATUS_META = {
  registered: {
    label: "Đã đăng ký",
    color: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
  },
  pending_confirmation: {
    label: "Chờ bàn giao",
    color: "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 ring-1 ring-amber-200 dark:ring-amber-900/40",
    dot: "bg-amber-500",
  },
  processed: {
    label: "Đã sơ chế",
    color: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    dot: "bg-blue-500",
  },
  in_transit: {
    label: "Đang vận chuyển",
    color: "bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    dot: "bg-orange-500",
  },
  delivered: {
    label: "Đã giao nhận",
    color: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 ring-1 ring-emerald-200 dark:ring-emerald-900/40",
    dot: "bg-emerald-500",
  },
  recalled: {
    label: "Thu hồi khẩn cấp",
    color: "bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800 ring-1 ring-rose-200 dark:ring-rose-900/40",
    dot: "bg-rose-500",
  },
  quarantined: {
    label: "Đã niêm phong / Cách ly",
    color: "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-600",
  },
  active: {
    label: "Đang hoạt động",
    color: "bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-700",
    dot: "bg-teal-500",
  },
  consumed: {
    label: "Đã tiêu thụ",
    color: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
  },
};

function BatchStatusBadge({ status }) {
  const norm = String(status || "").toLowerCase();
  const meta = STATUS_META[norm] || {
    label: status,
    color: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
  };
  const isPulsing = ["pending_confirmation", "in_transit", "recalled"].includes(norm);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-2xs ${meta.color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${isPulsing ? "animate-pulse" : ""}`} />
      {meta.label}
    </span>
  );
}

const HARVEST_PREVIEW_SCHEMA = [
  { key: "productName", label: "Tên nông sản", icon: Box },
  { key: "landPlotName", label: "Thửa đất trồng", icon: MapPin },
  {
    key: "quantityKg",
    label: "Sản lượng thu hoạch",
    icon: Tractor,
    format: (val) => `${Number(val).toLocaleString()} kg`,
  },
  {
    key: "harvestedAt",
    label: "Thời gian thu hoạch",
    icon: Clock,
    format: (val) => (val ? new Date(val).toLocaleString("vi-VN") : "Thời điểm hiện tại"),
  },
];

const PLOT_PREVIEW_SCHEMA = [
  { key: "name", label: "Tên thửa đất", icon: MapPin },
  { key: "areaHa", label: "Diện tích canh tác", format: (val) => `${val} ha` },
  { key: "coordinates", label: "Tọa độ GPS" },
  {
    key: "createdAt",
    label: "Ngày khai báo",
    format: (val) => (val ? new Date(val).toLocaleDateString("vi-VN") : "Thời điểm hiện tại"),
  },
];

const PRODUCT_PREVIEW_SCHEMA = [
  { key: "name", label: "Tên nông sản", icon: Box },
  { key: "unit", label: "Đơn vị tính", format: (val) => val || "kg" },
];

const TRANSFER_PREVIEW_SCHEMA = [
  { key: "batchCode", label: "Mã lô hàng bàn giao", icon: Box },
  { key: "targetOrgName", label: "Đơn vị tiếp nhận", icon: Truck },
  { key: "note", label: "Ghi chú bàn giao", format: (val) => val || "Không có ghi chú" },
];

const SPLIT_PREVIEW_SCHEMA = [
  { key: "parentBatchCode", label: "Lô nguồn phân tách", icon: Box },
  { key: "childCount", label: "Số lượng lô con dự kiến", icon: ArrowRightLeft },
  { key: "totalQuantity", label: "Tổng khối lượng tách", format: (val) => `${Number(val).toLocaleString()} kg` },
];

const MERGE_PREVIEW_SCHEMA = [
  { key: "batchCodes", label: "Các lô nông sản được gộp", icon: Box },
  { key: "productName", label: "Loại sản phẩm nông sản", icon: Box },
  { key: "batchCount", label: "Tổng số lô gộp", icon: ArrowRightLeft },
];

export function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function validateStandardDateString(dateStr) {
  if (!dateStr || typeof dateStr !== "string" || !dateStr.trim()) {
    return { valid: true };
  }
  const trimmed = dateStr.trim();
  let year, month, day;

  // Case 1: YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  // Case 2: DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s].*)?$/);

  if (ymdMatch) {
    year = parseInt(ymdMatch[1], 10);
    month = parseInt(ymdMatch[2], 10);
    day = parseInt(ymdMatch[3], 10);
  } else if (dmyMatch) {
    day = parseInt(dmyMatch[1], 10);
    month = parseInt(dmyMatch[2], 10);
    year = parseInt(dmyMatch[3], 10);
  } else {
    return {
      valid: false,
      message: "Định dạng ngày tháng không đúng chuẩn (phải là YYYY-MM-DD hoặc DD/MM/YYYY).",
    };
  }

  if (year < 1970 || year > 2100) {
    return { valid: false, message: `Năm khai báo (${year}) không hợp lệ (hợp lệ từ 1970 đến 2100).` };
  }
  if (month < 1 || month > 12) {
    return { valid: false, message: `Tháng khai báo (${month}) không hợp lệ (phải từ 01 đến 12).` };
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    return {
      valid: false,
      message: `Ngày ${day} không hợp lệ trong tháng ${month}/${year} (tháng này chỉ có tối đa ${daysInMonth} ngày).`,
    };
  }

  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  const todayStr = `${todayYear}-${String(todayMonth).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`;
  const inputDateOnly = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  if (inputDateOnly > todayStr) {
    return {
      valid: false,
      message: `Ngày khai báo không thể là ngày trong tương lai (hôm nay là ${todayDay}/${todayMonth}/${todayYear}). Vui lòng nhập lại phần ngày này.`,
    };
  }

  return { valid: true, dateOnly: inputDateOnly };
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [dashboard, setDashboard] = useState(null);
  const [batches, setBatches] = useState([]);
  const [transferRequests, setTransferRequests] = useState([]);
  const [landPlots, setLandPlots] = useState([]);
  const [products, setProducts] = useState([]);
  const [, setRecallReports] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [, setActivity] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [genealogy, setGenealogy] = useState(null);
  const [batchSummary, setBatchSummary] = useState(null);
  const [genealogyTab, setGenealogyTab] = useState("family"); // 'family' (Lô Mẹ - Lô Con) | 'lineage' (Toàn chuỗi)
  const [splitMergeResultModal, setSplitMergeResultModal] = useState({
    open: false,
    type: "", // 'split' | 'merge'
    title: "",
    parent: null,
    children: [],
    newBatch: null,
    sourceBatches: [],
  });
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
    createdAt: "",
  });
  const [editingLandPlotId, setEditingLandPlotId] = useState(null);
  const [landPlotErrors, setLandPlotErrors] = useState({});
  const [productForm, setProductForm] = useState({
    name: "",
    unit: "kg",
    min_temp: 2.0,
    max_temp: 8.0,
    max_allowed_delay_minutes: 30,
  });
  const [editingProductId, setEditingProductId] = useState(null);
  const [splitBatchId, setSplitBatchId] = useState("");
  const [splitAllocations, setSplitAllocations] = useState([
    { quantity: "", location: "" },
    { quantity: "", location: "" },
  ]);
  const [mergeBatchIds, setMergeBatchIds] = useState([]);
  const [batchCsvFile, setBatchCsvFile] = useState(null);
  const [isDraggingBatchCsv, setIsDraggingBatchCsv] = useState(false);
  const [isImportingBatchCsv, setIsImportingBatchCsv] = useState(false);
  const batchCsvInputRef = useRef(null);
  const [transferForm, setTransferForm] = useState({
    batchId: "",
    toOrganizationId: "",
    note: "",
  });
  const [submission, setSubmissionState] = useState({ message: "", tone: "" });
  const setSubmission = ({ message, tone = "success" }) => {
    setSubmissionState({ message, tone });
    if (!message) return;
    if (tone === "error") {
      toast.error(message);
    } else if (tone === "warning") {
      toast.warning(message);
    } else {
      toast.success(message);
    }
  };
  const [transferFilter, setTransferFilter] = useState("all");
  const [decisionModal, setDecisionModal] = useState({
    open: false,
    transfer: null,
    decision: "confirmed",
    reason: "",
    submitting: false,
  });
  const [consumeModalBatch, setConsumeModalBatch] = useState(null);
  const [distributeBatchId, setDistributeBatchId] = useState(null);
  const [lineageModalBatch, setLineageModalBatch] = useState(null);
  const [batchSearchTerm, setBatchSearchTerm] = useState("");
  const [batchStockFilter, setBatchStockFilter] = useState("all"); // 'all' | 'in_stock' | 'exhausted'
  const [confirmHarvestModal, setConfirmHarvestModal] = useState({
    open: false,
    data: null,
    submitting: false,
  });
  const [confirmPlotModal, setConfirmPlotModal] = useState({
    open: false,
    data: null,
    submitting: false,
  });
  const [confirmProductModal, setConfirmProductModal] = useState({
    open: false,
    data: null,
    submitting: false,
  });
  const [confirmTransferModal, setConfirmTransferModal] = useState({
    open: false,
    data: null,
    submitting: false,
  });
  const [confirmSplitModal, setConfirmSplitModal] = useState({
    open: false,
    data: null,
    allocations: null,
    submitting: false,
  });
  const [confirmMergeModal, setConfirmMergeModal] = useState({
    open: false,
    data: null,
    submitting: false,
  });
  const [recentlyCreatedBatchId, setRecentlyCreatedBatchId] = useState(null);

  const loadData = async () => {
    const [dashboardData, batchData, transferData, activityData] = await Promise.all([
      api.getDashboard(),
      api.getBatches(),
      api.getTransferRequests(),
      api.getActivity(),
    ]);
    setDashboard(dashboardData);
    setBatches(batchData);
    setTransferRequests(transferData);
    setActivity(activityData);
    if (batchData[0]) {
      try {
        const [fullBatch, batchGenealogy, summary] = await Promise.all([
          api.getBatch(batchData[0].id),
          api.getBatchGenealogy(batchData[0].id),
          api.getBatchSummary(batchData[0].id),
        ]);
        setSelectedBatch(fullBatch);
        setGenealogy(batchGenealogy);
        setBatchSummary(summary);
      } catch {
        setSelectedBatch(batchData[0]);
        setBatchSummary(null);
      }
    } else {
      setSelectedBatch(null);
      setGenealogy(null);
      setBatchSummary(null);
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

  const inStockCount = useMemo(
    () => filteredBatches.filter((b) => Number(b.remaining_quantity) > 0).length,
    [filteredBatches],
  );
  const exhaustedCount = useMemo(
    () => filteredBatches.filter((b) => Number(b.remaining_quantity) === 0).length,
    [filteredBatches],
  );

  const displayedBatches = useMemo(() => {
    let list = filteredBatches;
    if (batchStockFilter === "in_stock") {
      list = list.filter((b) => Number(b.remaining_quantity) > 0);
    } else if (batchStockFilter === "exhausted") {
      list = list.filter((b) => Number(b.remaining_quantity) === 0);
    }
    if (batchSearchTerm.trim()) {
      const term = batchSearchTerm.trim().toLowerCase();
      list = list.filter(
        (b) =>
          (b.batch_code && b.batch_code.toLowerCase().includes(term)) ||
          (b.product_name && b.product_name.toLowerCase().includes(term)) ||
          (b.current_location && b.current_location.toLowerCase().includes(term)),
      );
    }
    return list;
  }, [filteredBatches, batchStockFilter, batchSearchTerm]);

  const timelineEvents = useMemo(() => {
    const currentEvents = (selectedBatch?.events || []).map((event) => ({
      ...event,
      batch_code: selectedBatch.batch_code,
      isAncestorEvent: false,
    }));
    const ancestorEvents = (genealogy?.ancestorEvents || []).map((event) => ({
      ...event,
      isAncestorEvent: true,
    }));
    return [...ancestorEvents, ...currentEvents].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp) || a.id - b.id,
    );
  }, [genealogy, selectedBatch]);

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
      reason: decision === "confirmed" ? "" : "Lô hàng không đạt tiêu chuẩn chất lượng.",
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
    if (decision === "rejected") {
      if (!reason || !reason.trim() || reason.trim().length < 10) {
        setSubmission({
          message: "Lý do từ chối bắt buộc và phải có tối thiểu 10 ký tự.",
          tone: "error",
        });
        return;
      }
    }
    setDecisionModal((prev) => ({ ...prev, submitting: true }));
    try {
      await api.decideTransfer(transfer.id, {
        decision,
        reason: reason?.trim() || null,
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
      const [batch, batchGenealogy, summary] = await Promise.all([
        api.getBatch(batchId),
        api.getBatchGenealogy(batchId),
        api.getBatchSummary(batchId),
      ]);
      setSelectedBatch(batch);
      setGenealogy(batchGenealogy);
      setBatchSummary(summary);
    } catch (loadError) {
      setSelectedBatch(batch);
      setGenealogy(null);
      setBatchSummary(null);
      setSubmission({ message: loadError.message, tone: "error" });
    }
  };

  const handleLandPlotSubmit = (event) => {
    event.preventDefault();
    const errors = {};

    if (!landPlotForm.name?.trim()) {
      errors.name = "Tên thửa đất không được để trống. Vui lòng nhập tên thửa.";
    }

    const area = Number(landPlotForm.areaHa);
    if (!landPlotForm.areaHa || Number.isNaN(area) || area <= 0) {
      errors.areaHa = "Diện tích thửa đất phải là số dương lớn hơn 0 (ha). Vui lòng nhập lại diện tích.";
    }

    if (landPlotForm.latitude && String(landPlotForm.latitude).trim()) {
      const lat = Number(landPlotForm.latitude);
      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        errors.latitude = "Vĩ độ không hợp lệ (phải từ -90 đến 90). Vui lòng nhập lại vĩ độ.";
      }
    }

    if (landPlotForm.longitude && String(landPlotForm.longitude).trim()) {
      const lng = Number(landPlotForm.longitude);
      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        errors.longitude = "Kinh độ không hợp lệ (phải từ -180 đến 180). Vui lòng nhập lại kinh độ.";
      }
    }

    if (landPlotForm.createdAt && String(landPlotForm.createdAt).trim()) {
      const dateCheck = validateStandardDateString(landPlotForm.createdAt);
      if (!dateCheck.valid) {
        errors.createdAt = dateCheck.message;
      }
    }

    setLandPlotErrors(errors);

    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      const firstKey = errorKeys[0];
      toast.error(errors[firstKey]);
      const el = document.getElementById(`plot-input-${firstKey}`);
      if (el) el.focus();
      return;
    }

    setConfirmPlotModal({
      open: true,
      data: {
        ...landPlotForm,
        coordinates:
          landPlotForm.latitude && landPlotForm.longitude
            ? `${landPlotForm.latitude}, ${landPlotForm.longitude}`
            : "Chưa cấu hình tọa độ GPS",
      },
      submitting: false,
    });
  };

  const handleConfirmPlotSave = async () => {
    if (!confirmPlotModal.data) return;
    setConfirmPlotModal((prev) => ({ ...prev, submitting: true }));
    setSubmission({ message: "", tone: "" });
    try {
      if (editingLandPlotId) {
        await api.updateLandPlot(editingLandPlotId, landPlotForm);
      } else {
        await api.createLandPlot(landPlotForm);
      }
      setLandPlotForm({ name: "", areaHa: "", latitude: "", longitude: "", createdAt: "" });
      setLandPlotErrors({});
      setEditingLandPlotId(null);
      const nextPlots = await api.getLandPlots();
      setLandPlots(nextPlots);
      setConfirmPlotModal({ open: false, data: null, submitting: false });
      setSubmission({
        message: editingLandPlotId ? "Đã cập nhật thửa đất." : "Đã khai báo thửa đất mới.",
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
      setConfirmPlotModal((prev) => ({ ...prev, submitting: false, open: false }));
      if (submitError.field) {
        setLandPlotErrors((prev) => ({
          ...prev,
          [submitError.field]: submitError.message,
        }));
        const el = document.getElementById(`plot-input-${submitError.field}`);
        if (el) el.focus();
      }
    }
  };

  const handleProductSubmit = (event) => {
    event.preventDefault();
    if (!productForm.name?.trim()) {
      toast.error("Vui lòng nhập tên sản phẩm.");
      return;
    }
    setConfirmProductModal({
      open: true,
      data: { ...productForm },
      submitting: false,
    });
  };

  const handleConfirmProductSave = async () => {
    if (!confirmProductModal.data) return;
    setConfirmProductModal((prev) => ({ ...prev, submitting: true }));
    try {
      if (editingProductId) {
        await api.updateProduct(editingProductId, productForm);
        await api.updateProductColdChainConfig(editingProductId, {
          min_temp: productForm.min_temp,
          max_temp: productForm.max_temp,
          max_allowed_delay_minutes: productForm.max_allowed_delay_minutes,
        });
      } else {
        const created = await api.createProduct(productForm);
        if (created?.id) {
          await api.updateProductColdChainConfig(created.id, {
            min_temp: productForm.min_temp,
            max_temp: productForm.max_temp,
            max_allowed_delay_minutes: productForm.max_allowed_delay_minutes,
          });
        }
      }
      setProductForm({ name: "", unit: "kg", min_temp: 2.0, max_temp: 8.0, max_allowed_delay_minutes: 30 });
      setEditingProductId(null);
      setProducts(await api.getProducts());
      setConfirmProductModal({ open: false, data: null, submitting: false });
      setSubmission({
        message: editingProductId ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm mới.",
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
      setConfirmProductModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const handleSplitSubmit = (event) => {
    event.preventDefault();
    if (!splitBatchId) {
      toast.error("Vui lòng chọn lô cần tách.");
      return;
    }
    const sourceBatch = filteredBatches.find((b) => b.id === Number(splitBatchId));
    const validAllocations = splitAllocations.filter((a) => Number(a.quantity) > 0);
    if (validAllocations.length < 2) {
      toast.error("Cần ít nhất 2 lô con hợp lệ với số lượng lớn hơn 0.");
      return;
    }
    const totalAllocated = validAllocations.reduce((sum, a) => sum + Number(a.quantity), 0);
    setConfirmSplitModal({
      open: true,
      data: {
        parentBatchCode: sourceBatch?.batch_code || sourceBatch?.code || `Lô #${splitBatchId}`,
        childCount: `${validAllocations.length} lô con`,
        totalQuantity: totalAllocated,
      },
      allocations: validAllocations.map((allocation) => ({
        quantity: Number(allocation.quantity),
        ...(allocation.location.trim() ? { location: allocation.location.trim() } : {}),
      })),
      submitting: false,
    });
  };

  const handleConfirmSplitSave = async () => {
    if (!confirmSplitModal.allocations) return;
    setConfirmSplitModal((prev) => ({ ...prev, submitting: true }));
    try {
      const sourceId = Number(splitBatchId);
      const result = await api.splitBatch(sourceId, confirmSplitModal.allocations);
      setSplitBatchId("");
      setSplitAllocations([{ quantity: "", location: "" }, { quantity: "", location: "" }]);
      setConfirmSplitModal({ open: false, data: null, allocations: null, submitting: false });
      await loadData();
      
      // Mở modal kết quả chi tiết hiển thị các lô con vừa chia
      setSplitMergeResultModal({
        open: true,
        type: "split",
        title: "Tách lô nông sản thành công!",
        parent: result.parent || filteredBatches.find((b) => b.id === sourceId),
        children: result.children || [],
        newBatch: null,
        sourceBatches: [],
      });

      // Tự động chọn lô mẹ để cập nhật bảng phả hệ các lô con
      if (result.parent?.id) {
        handleSelectBatch(result.parent.id);
      }

      setSubmission({
        message: `Đã tách lô thành công thành ${result.children?.length || 0} lô con mới.`,
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
      setConfirmSplitModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const handleBatchFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    const nameLower = selectedFile.name.toLowerCase();
    const isExcelOrCsv =
      nameLower.endsWith(".csv") ||
      nameLower.endsWith(".xlsx") ||
      nameLower.endsWith(".xls") ||
      selectedFile.type === "text/csv" ||
      selectedFile.type === "application/vnd.ms-excel" ||
      selectedFile.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      selectedFile.type === "application/csv" ||
      selectedFile.type === "";
    if (!isExcelOrCsv) {
      toast.error("Định dạng tệp không hợp lệ! Vui lòng chọn tệp Excel (.xlsx, .xls) hoặc CSV (.csv).");
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast.error("Kích thước tệp vượt quá giới hạn 5 MB.");
      return;
    }
    setBatchCsvFile(selectedFile);
    toast.success(`Đã chọn tệp: ${selectedFile.name}`);
  };

  const handleBatchDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingBatchCsv(true);
  };

  const handleBatchDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingBatchCsv(false);
  };

  const handleBatchDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingBatchCsv(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleBatchFileSelect(files[0]);
    }
  };

  const handleBatchCsvImport = async (event) => {
    event.preventDefault();
    if (!batchCsvFile) {
      toast.warning("Vui lòng chọn hoặc kéo thả tệp Excel/CSV trước khi nhấn Nhập lô.");
      setSubmission({
        message: "Vui lòng chọn hoặc kéo thả tệp Excel/CSV trước khi nhập dữ liệu.",
        tone: "error",
      });
      return;
    }
    setIsImportingBatchCsv(true);
    setSubmission({ message: "", tone: "" });
    try {
      let content = "";
      const isXlsx =
        batchCsvFile.name.toLowerCase().endsWith(".xlsx") ||
        batchCsvFile.name.toLowerCase().endsWith(".xls") ||
        batchCsvFile.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        batchCsvFile.type === "application/vnd.ms-excel";

      if (isXlsx) {
        const buffer = await batchCsvFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error("File Excel không chứa bảng tính (sheet) nào.");
        }
        const worksheet = workbook.Sheets[firstSheetName];
        content = XLSX.utils.sheet_to_csv(worksheet);
      } else {
        content = await batchCsvFile.text();
      }

      const result = await api.importBatchesCsv(content);
      setBatchCsvFile(null);
      if (batchCsvInputRef.current) batchCsvInputRef.current.value = "";
      await loadData();
      toast.success(`Nhập dữ liệu thành công! Đã tạo ${result.createdCount} lô nông sản từ file.`);
      setSubmission({
        message: `Đã nhập ${result.createdCount} lô nông sản vào chuỗi hash an toàn.`,
        tone: "success",
      });
      const firstCreatedId = result.batches?.[0]?.id;
      if (firstCreatedId) {
        scrollToElement(`batch-row-${firstCreatedId}`, { block: "center", highlight: true });
      }
    } catch (submitError) {
      toast.error(submitError.message || "Không thể nhập lô từ file.");
      setSubmission({ message: submitError.message, tone: "error" });
    } finally {
      setIsImportingBatchCsv(false);
    }
  };

  const downloadBatchExcelTemplate = () => {
    // Xuất file .xlsx chuẩn Microsoft Excel: Tự căn lề độ rộng cột, tiếng Việt 100% chuẩn, ngày tháng không bao giờ bị dấu #######
    const wb = XLSX.utils.book_new();
    const wsData = [
      ["productId", "quantityKg", "currentLocation", "harvestedAt", "batchCode"],
      [1, 100, "Kho tiếp nhận", "2026-10-20", "BATCH-2026-001"],
      [2, 250, "Kho lạnh trung tâm", "2026-10-19", "BATCH-2026-002"],
      [1, 80, "Khu sơ chế đóng gói", "2026-10-18", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 14 }, // productId
      { wch: 16 }, // quantityKg
      { wch: 28 }, // currentLocation
      { wch: 18 }, // harvestedAt (đủ rộng cho YYYY-MM-DD, tuyệt đối không bị ########)
      { wch: 22 }, // batchCode
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Mau_Nhap_Lo");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agritrace-batch-import-template.xlsx";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Đã tải xuống file mẫu Excel (.xlsx) chuẩn căn cột và tiếng Việt.");
  };

  const handleMergeSubmit = (event) => {
    event.preventDefault();
    if (mergeBatchIds.length < 2) {
      toast.error("Cần chọn ít nhất 2 lô cùng sản phẩm để gộp.");
      return;
    }
    const selectedBatchObjects = filteredBatches.filter((b) => mergeBatchIds.map(Number).includes(b.id));
    const firstProduct = selectedBatchObjects[0];
    const batchCodes = selectedBatchObjects.map((b) => b.batch_code || b.code).join(", ");
    setConfirmMergeModal({
      open: true,
      data: {
        batchCodes,
        productName: firstProduct?.product_name || "Nông sản",
        batchCount: `${selectedBatchObjects.length} lô`,
      },
      submitting: false,
    });
  };

  const handleConfirmMergeSave = async () => {
    setConfirmMergeModal((prev) => ({ ...prev, submitting: true }));
    try {
      const sourceIds = mergeBatchIds.map(Number);
      const sources = filteredBatches.filter((b) => sourceIds.includes(b.id));
      const result = await api.mergeBatches(
        sourceIds,
        filteredBatches.find((batch) => batch.id === Number(mergeBatchIds[0]))?.product_id,
      );
      setMergeBatchIds([]);
      setConfirmMergeModal({ open: false, data: null, submitting: false });
      await loadData();

      // Mở modal kết quả chi tiết hiển thị lô gộp mới và các lô thành phần
      setSplitMergeResultModal({
        open: true,
        type: "merge",
        title: "Gộp lô nông sản thành công!",
        parent: null,
        children: [],
        newBatch: result.newBatch,
        sourceBatches: sources,
      });

      // Tự động chọn lô gộp mới vừa tạo để xem phả hệ
      if (result.newBatch?.id) {
        handleSelectBatch(result.newBatch.id);
      }

      setSubmission({ message: `Đã tạo thành công lô gộp mới: ${result.newBatch.batch_code}.`, tone: "success" });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
      setConfirmMergeModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const handleHarvestSubmit = (event) => {
    event.preventDefault();
    if (!harvestForm.landPlotId || !harvestForm.productId || !harvestForm.quantityKg) {
      setSubmission({
        message: "Vui lòng chọn thửa đất, sản phẩm và nhập sản lượng thu hoạch.",
        tone: "error",
      });
      return;
    }

    // Kiểm tra và ngăn chặn chọn ngày giờ thu hoạch trong tương lai
    if (harvestForm.harvestedAt) {
      const todayStr = new Date().toISOString().split("T")[0];
      const selectedDate = new Date(harvestForm.harvestedAt);
      const now = new Date();
      if (harvestForm.harvestedAt > todayStr || selectedDate > now) {
        toast.error("Ngày thu hoạch không được đặt trong tương lai. Vui lòng chọn ngày hôm nay hoặc trước đó.");
        setSubmission({
          message: "Ngày thu hoạch không hợp lệ: Không được chọn ngày trong tương lai.",
          tone: "error",
        });
        return;
      }
    }

    const selectedPlot = landPlots.find((p) => String(p.id) === String(harvestForm.landPlotId));
    const selectedProduct = products.find((p) => String(p.id) === String(harvestForm.productId));
    setConfirmHarvestModal({
      open: true,
      data: {
        ...harvestForm,
        landPlotName: selectedPlot ? selectedPlot.name : harvestForm.landPlotId,
        productName: selectedProduct ? selectedProduct.name : harvestForm.productId,
      },
      submitting: false,
    });
  };

  const handleConfirmHarvestSave = async () => {
    if (!confirmHarvestModal.data) return;
    setConfirmHarvestModal((prev) => ({ ...prev, submitting: true }));
    try {
      const result = await api.createHarvest(harvestForm);
      setHarvestForm({
        landPlotId: "",
        productId: "",
        quantityKg: "",
        harvestedAt: "",
      });
      setConfirmHarvestModal({ open: false, data: null, submitting: false });
      setRecentlyCreatedBatchId(result.batch.id);
      setTimeout(() => setRecentlyCreatedBatchId(null), 3500);
      await loadData();
      setSubmission({
        message: `Đã lưu thành công lô nông sản ${result.batch.batch_code}!`,
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
      setConfirmHarvestModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const handleTransferSubmit = (event) => {
    event.preventDefault();
    if (!transferForm.batchId || !transferForm.toOrganizationId) {
      toast.error("Vui lòng chọn lô hàng và tổ chức tiếp nhận.");
      return;
    }
    const selectedBatchItem = batches.find((b) => String(b.id) === String(transferForm.batchId));
    const targetOrgName =
      transferForm.toOrganizationId === "2"
        ? "HTX Sơ chế Hà Nội"
        : transferForm.toOrganizationId === "3"
        ? "Cửa hàng Organic Market"
        : `Tổ chức #${transferForm.toOrganizationId}`;

    setConfirmTransferModal({
      open: true,
      data: {
        batchCode: selectedBatchItem?.batch_code || selectedBatchItem?.code || `Lô #${transferForm.batchId}`,
        targetOrgName,
        note: transferForm.note || "",
      },
      submitting: false,
    });
  };

  const handleConfirmTransferSave = async () => {
    setConfirmTransferModal((prev) => ({ ...prev, submitting: true }));
    try {
      await api.createTransferRequest(transferForm.batchId, {
        toOrganizationId: Number(transferForm.toOrganizationId),
        note: transferForm.note,
      });
      setTransferForm({ batchId: "", toOrganizationId: "", note: "" });
      setConfirmTransferModal({ open: false, data: null, submitting: false });
      await loadData();
      setSubmission({
        message: "Đã gửi yêu cầu bàn giao cho tổ chức nhận.",
        tone: "success",
      });
    } catch (submitError) {
      setSubmission({ message: submitError.message, tone: "error" });
      setConfirmTransferModal((prev) => ({ ...prev, submitting: false }));
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
    <div className="flex min-h-screen flex-col bg-slate-50/70 dark:bg-slate-950 bg-dot-pattern text-slate-800 dark:text-slate-100 lg:flex-row antialiased">
      <Sidebar
        user={user}
        currentView={selectedView}
        onSelectView={setSelectedView}
        onLogout={logout}
      />

      <main className="flex-1 p-4 sm:p-7 lg:p-8 overflow-x-hidden">
        {/* Header */}
        <header className="relative z-40 mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-4 sm:p-5 card-shadow backdrop-blur-md">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                Hệ thống giám sát chuỗi nông sản lạnh IoT & Blockchain
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {user?.organizationName}
              </h1>
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {user?.role === "farm_admin"
                  ? "Quản trị Nông trại"
                  : user?.role === "processor_admin"
                  ? "Cơ sở chế biến"
                  : user?.role === "distributor_admin"
                  ? "Nhà phân phối"
                  : user?.role === "auditor"
                  ? "Kiểm toán viên"
                  : "Người dùng"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="rounded-xl border border-cyan-200/80 dark:border-cyan-800 bg-cyan-50/70 dark:bg-cyan-950/40 px-3 py-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-800 dark:text-cyan-300">
                <Thermometer size={15} className="text-cyan-600 dark:text-cyan-400" />
                <span>Chuỗi lạnh:</span>
                <span className="font-bold text-cyan-900 dark:text-cyan-100">2 - 8°C Chuẩn hóa</span>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200/90 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 px-3 py-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                <ShieldCheck className="text-emerald-600 dark:text-emerald-400" size={16} />
                <span>Toàn vẹn sự kiện:</span>
                <span className="rounded-md bg-emerald-200/80 dark:bg-emerald-900/60 px-1.5 py-0.5 text-emerald-900 dark:text-emerald-200 font-extrabold text-[11px]">
                  Bất biến (Verified)
                </span>
              </div>
            </div>
            {/* T-86: Chuông thông báo in-app */}
            <NotificationBell user={user} />
          </div>
        </header>

        {selectedView === "Tổng quan" && (
          <>
            {/* Sprint Status & Integrity Overview Banner */}
            <section className="mb-6 rounded-3xl bg-gradient-to-r from-slate-950 via-emerald-950 to-teal-950 p-6 sm:p-7 text-white shadow-xl border border-emerald-500/20 relative overflow-hidden">
              <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none text-emerald-400">
                <ShieldCheck size={280} />
              </div>
              <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3.5 py-1 text-xs font-semibold backdrop-blur-sm text-emerald-300">
                    <ShieldCheck size={14} className="text-emerald-400" /> Chuỗi Hash SHA-256 Bất biến
                  </div>
                  <h2 className="mt-3 text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-snug">
                    Hệ thống Giám sát & Truy xuất Nguồn gốc Nông sản Lạnh
                  </h2>
                  <p className="mt-2 text-xs sm:text-sm text-emerald-100/80 max-w-2xl leading-relaxed">
                    Mọi sự kiện thu hoạch, sơ chế, bàn giao và vi phạm nhiệt độ đều được ký băm SHA-256 liên hoàn. Không thể sửa hay xóa lén dữ liệu đã ghi nhận.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-3.5 sm:p-4 backdrop-blur-sm ring-1 ring-white/15 text-center min-w-[100px] shadow-sm">
                    <p className="text-2xl sm:text-3xl font-black text-white">{filteredBatches.length}</p>
                    <p className="text-[10px] text-emerald-300 uppercase font-bold tracking-wider mt-0.5">Tổng lô hàng</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3.5 sm:p-4 backdrop-blur-sm ring-1 ring-white/15 text-center min-w-[100px] shadow-sm">
                    <p className="text-2xl sm:text-3xl font-black text-amber-300">{pendingIncomingCount}</p>
                    <p className="text-[10px] text-amber-200 uppercase font-bold tracking-wider mt-0.5">Chờ bàn giao</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3.5 sm:p-4 backdrop-blur-sm ring-1 ring-white/15 text-center min-w-[100px] shadow-sm">
                    <p className="text-2xl sm:text-3xl font-black text-emerald-300">100%</p>
                    <p className="text-[10px] text-emerald-200 uppercase font-bold tracking-wider mt-0.5">Toàn vẹn Hash</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Stats Grid */}
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map(({ label, value, icon: Icon, tone }) => (
                <div
                  key={label}
                  className="rounded-2xl bg-white p-5 card-shadow card-shadow-hover border border-slate-200/90 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                      <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 font-mono">
                        {value}
                      </p>
                    </div>
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-xs ${tone}`}
                    >
                      <Icon size={22} />
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* Main Section: Modern Batch Table & Quick Cold Chain Monitor */}
            <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 sm:p-6 card-shadow border border-slate-200/90 dark:border-slate-800 transition-all">
                {/* Header & Subtitle */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        Danh sách lô nông sản
                      </h2>
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        {filteredBatches.length} lô
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      Theo dõi mã lô, trạng thái chuỗi cung ứng và khối lượng thực tế
                    </p>
                  </div>
                </div>

                {/* Search & Stock Filter Toolbar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={batchSearchTerm}
                      onChange={(e) => setBatchSearchTerm(e.target.value)}
                      placeholder="Tìm theo mã lô, sản phẩm..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
                    />
                    {batchSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setBatchSearchTerm("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Stock Filter Pills */}
                  <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1">
                    <button
                      type="button"
                      onClick={() => setBatchStockFilter("all")}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        batchStockFilter === "all"
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Tất cả ({filteredBatches.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchStockFilter("in_stock")}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        batchStockFilter === "in_stock"
                          ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-xs"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Còn hàng ({inStockCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchStockFilter("exhausted")}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        batchStockFilter === "exhausted"
                          ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 shadow-xs"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Đã hết ({exhaustedCount})
                    </button>
                  </div>
                </div>

                {filteredBatches.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <Box size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Chưa có lô hàng nào.</p>
                  </div>
                ) : displayedBatches.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    <p className="text-xs">Không tìm thấy lô nông sản nào khớp với bộ lọc.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setBatchSearchTerm("");
                        setBatchStockFilter("all");
                      }}
                      className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Xóa bộ lọc
                    </button>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                          <tr>
                            <th className="px-4 py-3">Mã lô</th>
                            <th className="px-4 py-3">Sản phẩm</th>
                            <th className="px-4 py-3">Khai báo / Thu hoạch</th>
                            <th className="px-4 py-3">Trạng thái</th>
                            <th className="px-4 py-3 text-right">Khối lượng</th>
                            <th className="px-4 py-3 text-center">Chi tiết</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                          {displayedBatches.map((batch) => {
                            const isSelected = selectedBatch?.id === batch.id;
                            const isRecentlyAdded = recentlyCreatedBatchId === batch.id;
                            const hasStock = Number(batch.remaining_quantity) > 0;
                            return (
                              <tr
                                key={batch.id}
                                onClick={() => handleSelectBatch(batch.id)}
                                className={`group transition-all cursor-pointer ${
                                  isRecentlyAdded
                                    ? "animate-highlight-row font-semibold ring-2 ring-emerald-500/80"
                                    : isSelected
                                    ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-l-4 border-l-emerald-600 dark:border-l-emerald-400"
                                    : "border-l-4 border-l-transparent hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
                                }`}
                              >
                                <td className="px-4 py-3.5">
                                  <span
                                    className={`font-mono text-xs font-bold transition-colors ${
                                      isSelected
                                        ? "text-emerald-900 dark:text-emerald-300"
                                        : "text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                                    }`}
                                  >
                                    {batch.batch_code}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                                  {batch.product_name}
                                </td>
                                <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                                  {batch.harvested_at || batch.created_at
                                    ? new Date(batch.harvested_at || batch.created_at).toLocaleDateString("vi-VN", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                      })
                                    : "--"}
                                </td>
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-1.5">
                                    <BatchStatusBadge status={batch.status} />
                                    {batch.cold_chain_alert ? (
                                      <span
                                        className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800 px-2 py-0.5 text-[10px] font-black animate-pulse"
                                        title="Vi phạm chuỗi lạnh: Nhiệt độ vượt ngưỡng liên tục quá 30 phút"
                                      >
                                        <AlertTriangle size={10} />
                                        <span>Vi phạm lạnh</span>
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-right font-mono">
                                  {hasStock ? (
                                    <span className="font-bold text-slate-900 dark:text-white">
                                      {Number(batch.remaining_quantity).toLocaleString()}{" "}
                                      <span className="text-[11px] font-normal text-slate-400">kg</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                                      <span>0 kg</span>
                                      <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                        Hết
                                      </span>
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  {isSelected ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs">
                                      📍 Đang xem
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                      Xem <ArrowRight size={12} />
                                    </span>
                                  )}
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
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Giám sát chuỗi lạnh
                    </h2>
                    {selectedBatch && (
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-300 font-semibold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                        {selectedBatch.batch_code}
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 p-4 border border-emerald-200/80 dark:border-emerald-800/60 shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                          <Thermometer size={20} />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Nhiệt độ hiện tại</p>
                          <p className="font-bold text-slate-800 dark:text-slate-100">Cảm biến thời gian thực</p>
                        </div>
                      </div>
                      <span className="font-mono text-2xl font-black text-emerald-700 dark:text-emerald-400">
                        {selectedBatch?.temperature_c ?? 9}°C
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 p-4 border border-amber-200/80 dark:border-amber-800/60 shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                          <AlertTriangle size={20} />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Ngưỡng chuẩn quy định</p>
                          <p className="font-bold text-slate-800 dark:text-slate-100">Tiêu chuẩn bảo quản lạnh</p>
                        </div>
                      </div>
                      <span className="font-mono text-xl font-bold text-amber-700 dark:text-amber-400">≤ 8°C</span>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <MapPin size={15} className="text-emerald-600 dark:text-emerald-400" /> Vị trí lưu kho / hiện tại
                      </div>
                      <p className="mt-1.5 font-bold text-slate-800 dark:text-slate-100">
                        {selectedBatch?.current_location || "Chưa cập nhật"}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedBatch?.cold_chain_alert ? (
                  <div className="mt-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 p-3.5 border border-rose-200 dark:border-rose-800/60 flex items-center gap-2.5 text-xs text-rose-800 dark:text-rose-300 font-semibold">
                    <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
                    <span>Lô hàng này có vi phạm chuỗi lạnh trong lịch sử!</span>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                    <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
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
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                    Tên thửa đất <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    id="plot-input-name"
                    className={`w-full rounded-xl border px-3 py-2 text-sm transition-colors ${
                      landPlotErrors.name
                        ? "border-rose-500 bg-rose-50/70 text-rose-900 ring-2 ring-rose-400/40"
                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    }`}
                    placeholder="Tên thửa đất (vd: Vùng trồng xoài A1)"
                    value={landPlotForm.name}
                    onChange={(event) => {
                      const val = event.target.value;
                      setLandPlotForm((prev) => ({ ...prev, name: val }));
                      if (landPlotErrors.name) {
                        setLandPlotErrors((prev) => ({
                          ...prev,
                          name: val.trim() ? "" : "Tên thửa đất không được để trống. Vui lòng nhập tên thửa.",
                        }));
                      }
                    }}
                  />
                  {landPlotErrors.name && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                      <AlertCircle size={13} className="flex-shrink-0" />
                      {landPlotErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                    Diện tích (ha) <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    id="plot-input-areaHa"
                    className={`w-full rounded-xl border px-3 py-2 text-sm transition-colors ${
                      landPlotErrors.areaHa
                        ? "border-rose-500 bg-rose-50/70 text-rose-900 ring-2 ring-rose-400/40"
                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    }`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Diện tích (ha)"
                    value={landPlotForm.areaHa}
                    onChange={(event) => {
                      const val = event.target.value;
                      setLandPlotForm((prev) => ({ ...prev, areaHa: val }));
                      if (landPlotErrors.areaHa) {
                        const area = Number(val);
                        setLandPlotErrors((prev) => ({
                          ...prev,
                          areaHa: !val || Number.isNaN(area) || area <= 0
                            ? "Diện tích thửa đất phải là số dương lớn hơn 0 (ha). Vui lòng nhập lại diện tích."
                            : "",
                        }));
                      }
                    }}
                  />
                  {landPlotErrors.areaHa && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                      <AlertCircle size={13} className="flex-shrink-0" />
                      {landPlotErrors.areaHa}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                    Vĩ độ GPS (tùy chọn):
                  </label>
                  <input
                    id="plot-input-latitude"
                    className={`w-full rounded-xl border px-3 py-2 text-sm transition-colors ${
                      landPlotErrors.latitude
                        ? "border-rose-500 bg-rose-50/70 text-rose-900 ring-2 ring-rose-400/40"
                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    }`}
                    type="number"
                    step="0.000001"
                    placeholder="Vĩ độ (vd: 10.8231)"
                    value={landPlotForm.latitude}
                    onChange={(event) => {
                      const val = event.target.value;
                      setLandPlotForm((prev) => ({ ...prev, latitude: val }));
                      if (landPlotErrors.latitude) {
                        const lat = Number(val);
                        setLandPlotErrors((prev) => ({
                          ...prev,
                          latitude: val.trim() && (Number.isNaN(lat) || lat < -90 || lat > 90)
                            ? "Vĩ độ không hợp lệ (phải từ -90 đến 90). Vui lòng nhập lại vĩ độ."
                            : "",
                        }));
                      }
                    }}
                  />
                  {landPlotErrors.latitude && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                      <AlertCircle size={13} className="flex-shrink-0" />
                      {landPlotErrors.latitude}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                    Kinh độ GPS (tùy chọn):
                  </label>
                  <input
                    id="plot-input-longitude"
                    className={`w-full rounded-xl border px-3 py-2 text-sm transition-colors ${
                      landPlotErrors.longitude
                        ? "border-rose-500 bg-rose-50/70 text-rose-900 ring-2 ring-rose-400/40"
                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    }`}
                    type="number"
                    step="0.000001"
                    placeholder="Kinh độ (vd: 106.6297)"
                    value={landPlotForm.longitude}
                    onChange={(event) => {
                      const val = event.target.value;
                      setLandPlotForm((prev) => ({ ...prev, longitude: val }));
                      if (landPlotErrors.longitude) {
                        const lng = Number(val);
                        setLandPlotErrors((prev) => ({
                          ...prev,
                          longitude: val.trim() && (Number.isNaN(lng) || lng < -180 || lng > 180)
                            ? "Kinh độ không hợp lệ (phải từ -180 đến 180). Vui lòng nhập lại kinh độ."
                            : "",
                        }));
                      }
                    }}
                  />
                  {landPlotErrors.longitude && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                      <AlertCircle size={13} className="flex-shrink-0" />
                      {landPlotErrors.longitude}
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Ngày khai báo thửa đất <span className="font-normal text-slate-400">(để trống nếu là thời điểm hiện tại):</span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Hôm nay: {new Date().toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                  <input
                    id="plot-input-createdAt"
                    className={`w-full rounded-xl border px-3 py-2 text-xs transition-colors ${
                      landPlotErrors.createdAt
                        ? "border-rose-500 bg-rose-50/80 text-rose-900 ring-2 ring-rose-400/40"
                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    }`}
                    type="date"
                    max={getTodayDateString()}
                    value={landPlotForm.createdAt || ""}
                    onChange={(event) => {
                      const val = event.target.value;
                      setLandPlotForm((prev) => ({ ...prev, createdAt: val }));
                      if (val) {
                        const check = validateStandardDateString(val);
                        setLandPlotErrors((prev) => ({
                          ...prev,
                          createdAt: check.valid ? "" : check.message,
                        }));
                      } else {
                        setLandPlotErrors((prev) => ({ ...prev, createdAt: "" }));
                      }
                    }}
                    placeholder="Ngày khai báo"
                  />
                  {landPlotErrors.createdAt ? (
                    <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs font-medium text-rose-700">
                      <AlertCircle size={15} className="flex-shrink-0 mt-0.5 text-rose-600" />
                      <div>
                        <p>{landPlotErrors.createdAt}</p>
                        <p className="text-[11px] text-rose-500 mt-0.5 font-normal">
                          Lưu ý: Không thể chọn ngày trong tương lai. Vui lòng nhập hoặc chọn lại phần ngày này.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Định dạng chuẩn: ngày/tháng/năm. Không thể khai báo ngày trong tương lai so với thời điểm hiện tại.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
                  type="submit"
                >
                  {editingLandPlotId ? "Cập nhật thửa đất" : "Lưu thửa đất"}
                </button>
                {editingLandPlotId && (
                  <button
                    type="button"
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    onClick={() => {
                      setEditingLandPlotId(null);
                      setLandPlotForm({ name: "", areaHa: "", latitude: "", longitude: "", createdAt: "" });
                      setLandPlotErrors({});
                    }}
                  >
                    Hủy sửa
                  </button>
                )}
              </div>
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
                <div className="flex flex-col">
                  <input
                    className={`rounded-xl border px-3 py-2 ${
                      harvestForm.harvestedAt && harvestForm.harvestedAt > new Date().toISOString().split("T")[0]
                        ? "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200"
                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    }`}
                    type="date"
                    max={new Date().toISOString().split("T")[0]}
                    value={harvestForm.harvestedAt}
                    onChange={(event) =>
                      setHarvestForm({
                        ...harvestForm,
                        harvestedAt: event.target.value,
                      })
                    }
                  />
                  {harvestForm.harvestedAt && harvestForm.harvestedAt > new Date().toISOString().split("T")[0] && (
                    <span className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                      ⚠️ Không được đặt ngày trong tương lai.
                    </span>
                  )}
                </div>
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
                  className="rounded-xl border px-3 py-2 text-xs"
                  placeholder="Tên sản phẩm"
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm({ ...productForm, name: event.target.value })
                  }
                />
                <input
                  className="rounded-xl border px-3 py-2 text-xs"
                  placeholder="Đơn vị tính"
                  value={productForm.unit}
                  onChange={(event) =>
                    setProductForm({ ...productForm, unit: event.target.value })
                  }
                />
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Nhiệt độ tối thiểu (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full rounded-xl border px-3 py-2 text-xs font-mono"
                    placeholder="VD: 2.0"
                    value={productForm.min_temp ?? 2.0}
                    onChange={(event) =>
                      setProductForm({ ...productForm, min_temp: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Nhiệt độ tối đa (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full rounded-xl border px-3 py-2 text-xs font-mono"
                    placeholder="VD: 8.0"
                    value={productForm.max_temp ?? 8.0}
                    onChange={(event) =>
                      setProductForm({ ...productForm, max_temp: event.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Thời gian cho phép vượt ngưỡng liên tục (phút)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="w-full rounded-xl border px-3 py-2 text-xs font-mono"
                    placeholder="Mặc định: 30 phút"
                    value={productForm.max_allowed_delay_minutes ?? 30}
                    onChange={(event) =>
                      setProductForm({ ...productForm, max_allowed_delay_minutes: event.target.value })
                    }
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white text-xs"
                  type="submit"
                >
                  {editingProductId ? "Cập nhật sản phẩm & Chuỗi lạnh" : "Thêm sản phẩm"}
                </button>
                {editingProductId && (
                  <button
                    className="rounded-xl border px-4 py-2 text-xs"
                    type="button"
                    onClick={() => {
                      setEditingProductId(null);
                      setProductForm({ name: "", unit: "kg", min_temp: 2.0, max_temp: 8.0, max_allowed_delay_minutes: 30 });
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
                      setProductForm({
                        name: product.name,
                        unit: product.unit,
                        min_temp: product.min_temp ?? 2.0,
                        max_temp: product.max_temp ?? 8.0,
                        max_allowed_delay_minutes: product.max_allowed_delay_minutes ?? 30,
                      });
                    }}
                  >
                    <div>
                      <span className="font-medium text-xs text-slate-800">{product.name}</span>
                      <span className="ml-2 text-[11px] text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded font-mono">
                        [{product.min_temp ?? 2}°C - {product.max_temp ?? 8}°C, max {product.max_allowed_delay_minutes ?? 30}m]
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">{product.unit}</span>
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
                  const plotBatches = batches.filter(
                    (b) => b.land_plot_id === plot.id || b.current_location === `Thửa ${plot.name}`
                  );
                  const batchCount = plotBatches.length;
                  const hasCoords = plot.latitude && plot.longitude;
                  const latestBatch = plotBatches[0];
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
                              createdAt: plot.created_at ? plot.created_at.split("T")[0].split(" ")[0] : "",
                            });
                            setLandPlotErrors({});
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

                      {/* Created / Harvest date */}
                      <p className="text-[10px] text-slate-400 flex items-center justify-between">
                        <span>
                          {latestBatch && (latestBatch.harvested_at || latestBatch.created_at) ? (
                            <>
                              Thu hoạch: {new Date(latestBatch.harvested_at || latestBatch.created_at).toLocaleDateString("vi-VN", {
                                day: "2-digit", month: "2-digit", year: "numeric"
                              })}
                            </>
                          ) : (
                            <>
                              Khai báo: {new Date(plot.created_at).toLocaleDateString("vi-VN", {
                                day: "2-digit", month: "2-digit", year: "numeric"
                              })}
                            </>
                          )}
                        </span>
                        {latestBatch && (
                          <span className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                            {latestBatch.batch_code}
                          </span>
                        )}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {["L\u00f4 n\u00f4ng s\u1ea3n", "L\u00f4 ph\u00e2n ph\u1ed1i", "L\u00f4 x\u1eed l\u00fd", "Tổng quan"].includes(selectedView) &&
          ["farm_admin", "processor_admin", "distributor_admin"].includes(user?.role) && (
            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <form
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
                onSubmit={handleSplitSubmit}
              >
                <h2 className="text-lg font-bold text-slate-900">Tách lô hàng</h2>
                <p className="mt-2 text-sm text-slate-500">Chọn lô mẹ, sau đó khai báo khối lượng và nơi giữ cho từng lô con.</p>
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
                  {splitAllocations.map((allocation, index) => (
                    <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Lô con {index + 1} · khối lượng
                        <input
                          className="rounded-lg border px-3 py-2 text-sm"
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          required
                          placeholder="Ví dụ: 25"
                          value={allocation.quantity}
                          onChange={(event) => setSplitAllocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))}
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Nơi giữ lô con
                        <input
                          className="rounded-lg border px-3 py-2 text-sm"
                          placeholder="Mặc định theo lô mẹ"
                          value={allocation.location}
                          onChange={(event) => setSplitAllocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, location: event.target.value } : item))}
                        />
                      </label>
                      <button
                        className="self-end rounded-lg border px-3 py-2 text-sm text-slate-600 disabled:opacity-40"
                        type="button"
                        aria-label={`Xóa lô con ${index + 1}`}
                        disabled={splitAllocations.length <= 2}
                        onClick={() => setSplitAllocations((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        Xóa
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Tổng phân bổ: {splitAllocations.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0).toLocaleString()} kg</span>
                    <button
                      className="rounded-lg border border-emerald-200 px-3 py-2 font-semibold text-emerald-700 hover:bg-emerald-50"
                      type="button"
                      onClick={() => setSplitAllocations((current) => [...current, { quantity: "", location: "" }])}
                    >
                      + Thêm lô con
                    </button>
                  </div>
                </div>
                <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white" type="submit" disabled={!splitBatchId || splitAllocations.length < 2 || splitAllocations.some((item) => !(Number(item.quantity) > 0))}>
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

              <form
                className="rounded-3xl bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 lg:col-span-2 border border-slate-100 dark:border-slate-800/80 transition-all"
                onSubmit={handleBatchCsvImport}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 shrink-0 shadow-2xs">
                      <FileSpreadsheet size={22} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Nhập lô từ File (Excel / CSV)</h2>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Mỗi dòng tạo một lô thuộc tổ chức đang đăng nhập và ghi sự kiện nhập vào hash chain.
                      </p>
                    </div>
                  </div>
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs font-bold transition cursor-pointer shadow-sm hover:shadow active:scale-95"
                    type="button"
                    onClick={downloadBatchExcelTemplate}
                    title="Mở trực tiếp trên Microsoft Excel: Tự căn lề độ rộng từng cột, tiếng Việt 100% chuẩn, không bị dấu #######"
                  >
                    <FileSpreadsheet size={16} />
                    <span>Tải file mẫu Excel (.xlsx)</span>
                  </button>
                </div>

                {/* Hướng dẫn các cột tương thích Microsoft Excel & CSV */}
                <div className="mt-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 p-4 border border-slate-200/80 dark:border-slate-700 text-xs">
                  <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100 mb-2">
                    <FileSpreadsheet size={16} className="text-emerald-600" />
                    <span>Quy cách 5 cột dữ liệu tương thích Microsoft Excel & CSV:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
                    <div className="rounded-xl bg-white dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-800 shadow-2xs">
                      <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400">Cột A: productId</div>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">ID sản phẩm (Bắt buộc, số nguyên dương, vd: 1, 2)</p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-800 shadow-2xs">
                      <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400">Cột B: quantityKg</div>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">Khối lượng (Bắt buộc, số &gt; 0, vd: 100 hoặc 250.5)</p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-800 shadow-2xs">
                      <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400">Cột C: currentLocation</div>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">Vị trí lưu kho (Tùy chọn, vd: Kho tiếp nhận)</p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-800 shadow-2xs">
                      <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400">Cột D: harvestedAt</div>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">Ngày thu hoạch (YYYY-MM-DD hoặc DD/MM/YYYY)</p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-800 shadow-2xs">
                      <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400">Cột E: batchCode</div>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">Mã lô (Tùy chọn, để trống sẽ tự sinh BATCH-xxx)</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 italic">
                    💡 File mẫu Excel (.xlsx) đã được căn sẵn độ rộng từng cột, hiển thị tiếng Việt trọn vẹn và không bao giờ bị lỗi ký tự <code className="font-mono text-amber-700 dark:text-amber-400">########</code> ở cột ngày tháng. Hệ thống hỗ trợ nạp tệp <code className="font-mono">.xlsx</code>, <code className="font-mono">.xls</code> và <code className="font-mono">.csv</code>.
                  </p>
                </div>

                {/* Vùng Dropzone Kéo & Thả file Excel / CSV chuyên nghiệp */}
                <div className="mt-4">
                  <input
                    ref={batchCsvInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    className="hidden"
                    onChange={(e) => handleBatchFileSelect(e.target.files?.[0])}
                  />

                  {!batchCsvFile ? (
                    <div
                      onDragOver={handleBatchDragOver}
                      onDragLeave={handleBatchDragLeave}
                      onDrop={handleBatchDrop}
                      onClick={() => batchCsvInputRef.current?.click()}
                      className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition-all duration-200 cursor-pointer ${
                        isDraggingBatchCsv
                          ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 scale-[1.01] shadow-md shadow-emerald-500/10"
                          : "border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/40 hover:border-emerald-400 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20"
                      }`}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 shadow-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:scale-110 transition-all">
                        <Upload size={24} />
                      </div>
                      <div className="mt-3 text-center">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {isDraggingBatchCsv ? (
                            <span className="text-emerald-600 dark:text-emerald-400">Thả tệp Excel / CSV vào đây ngay...</span>
                          ) : (
                            <>
                              Kéo thả tệp Excel (.xlsx) hoặc CSV (.csv) vào đây hoặc{" "}
                              <span className="text-emerald-600 dark:text-emerald-400 underline font-extrabold">duyệt chọn từ máy tính</span>
                            </>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                          Hỗ trợ định dạng .xlsx, .xls, .csv (tối đa 500 lô, kích thước không quá 5 MB)
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-2xl border border-emerald-300/80 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-200/80 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                          <FileSpreadsheet size={22} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-emerald-950 dark:text-emerald-100 font-mono">
                              {batchCsvFile.name}
                            </p>
                            <span className="rounded-full bg-emerald-200/90 dark:bg-emerald-900/80 px-2 py-0.5 text-[10px] font-extrabold text-emerald-900 dark:text-emerald-200 uppercase">
                              {batchCsvFile.name.toLowerCase().endsWith(".xlsx") || batchCsvFile.name.toLowerCase().endsWith(".xls")
                                ? "Excel (.xlsx)"
                                : "CSV (.csv)"}
                            </span>
                          </div>
                          <p className="text-xs text-emerald-700/80 dark:text-emerald-400 mt-0.5">
                            Dung lượng: {(batchCsvFile.size / 1024).toFixed(1)} KB · Sẵn sàng nhập
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => batchCsvInputRef.current?.click()}
                          className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-700 transition cursor-pointer"
                        >
                          Đổi tệp khác
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBatchCsvFile(null);
                            if (batchCsvInputRef.current) batchCsvInputRef.current.value = "";
                          }}
                          className="rounded-xl p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/60 transition cursor-pointer"
                          title="Hủy tệp này"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] text-slate-400 leading-relaxed max-w-xl">
                    Cột bắt buộc: <code className="font-mono text-emerald-700 dark:text-emerald-400">productId, quantityKg</code>. Cột tùy chọn: <code className="font-mono text-slate-600 dark:text-slate-400">currentLocation, harvestedAt, batchCode</code>.
                  </p>
                  <button
                    className="min-w-[150px] inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-700/25 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition-all cursor-pointer active:scale-95"
                    type="submit"
                    disabled={isImportingBatchCsv}
                  >
                    {isImportingBatchCsv ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Đang nhập lô...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={16} />
                        <span>Nhập dữ liệu lô</span>
                      </>
                    )}
                  </button>
                </div>
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

        {(selectedView === "Chuỗi lạnh" || selectedView === "Kiểm soát") && (
          <ColdChainView user={user} batches={batches} onBatchUpdated={loadData} />
        )}

        {selectedView === "Thu hồi" && (
          <RecallManagementView user={user} batches={batches} onBatchUpdated={loadData} />
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

        {/* Modal xác nhận hoặc từ chối bàn giao kèm lý do (Mở rộng max-w-3xl) */}
        {decisionModal.open && decisionModal.transfer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 gaussian-backdrop animate-fade-in">
            <div className="animate-modal-in modal-card-glow w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 shadow-2xl">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                      decisionModal.decision === "confirmed"
                        ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {decisionModal.decision === "confirmed" ? (
                      <CheckCircle2 size={26} />
                    ) : (
                      <XCircle size={26} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      {decisionModal.decision === "confirmed"
                        ? "Xác nhận nhận bàn giao lô hàng"
                        : "Từ chối nhận bàn giao lô hàng"}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
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
                  className="rounded-xl p-2.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Transfer Summary */}
              <div className="mt-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Mã lô hàng:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                    {decisionModal.transfer.batch_code}
                  </span>
                </div>
                {decisionModal.transfer.product_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Sản phẩm:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {decisionModal.transfer.product_name} ({decisionModal.transfer.remaining_quantity || decisionModal.transfer.initial_quantity || 0} {decisionModal.transfer.product_unit || "kg"})
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Bên chuyển giao:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {decisionModal.transfer.from_organization_name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Bên nhận (Tổ chức của bạn):</span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {decisionModal.transfer.to_organization_name}
                  </span>
                </div>
                {decisionModal.transfer.note && (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Ghi chú từ bên gửi: </span>
                    <span className="italic">{decisionModal.transfer.note}</span>
                  </div>
                )}
              </div>

              {/* Preset suggestion chips */}
              <div className="mt-4">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
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
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason Form */}
              <form onSubmit={handleSubmitDecisionModal} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {decisionModal.decision === "confirmed" ? (
                      <>
                        Ghi chú / Nhận xét tiếp nhận <span className="text-slate-400 font-normal">(Không bắt buộc)</span>
                      </>
                    ) : (
                      <>
                        Lý do từ chối <span className="text-rose-500">* (Bắt buộc tối thiểu 10 ký tự)</span>
                      </>
                    )}
                  </label>
                  <textarea
                    rows={3}
                    required={decisionModal.decision === "rejected"}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder={
                      decisionModal.decision === "confirmed"
                        ? "Có thể để trống hoặc ghi chú thêm nếu muốn..."
                        : "Bắt buộc nhập rõ nguyên nhân từ chối lô hàng (tối thiểu 10 ký tự)..."
                    }
                    value={decisionModal.reason}
                    onChange={(e) =>
                      setDecisionModal((prev) => ({ ...prev, reason: e.target.value }))
                    }
                  />
                </div>

                <div className="flex items-center justify-end gap-4 pt-3">
                  <button
                    type="button"
                    disabled={decisionModal.submitting}
                    onClick={closeDecisionModal}
                    className="min-w-[120px] rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3.5 text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={
                      decisionModal.submitting ||
                      (decisionModal.decision === "rejected" &&
                        decisionModal.reason.trim().length < 10)
                    }
                    className={`min-w-[210px] flex items-center justify-center gap-2.5 rounded-2xl px-8 py-3.5 text-sm sm:text-base font-bold text-white shadow-lg transition disabled:opacity-50 cursor-pointer ${
                      decisionModal.decision === "confirmed"
                        ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-700/30"
                        : "bg-rose-600 hover:bg-rose-700 shadow-rose-700/30"
                    }`}
                  >
                    {decisionModal.submitting ? (
                      <span>Đang xử lý...</span>
                    ) : decisionModal.decision === "confirmed" ? (
                      <>
                        <CheckCircle2 size={18} />
                        <span>Xác nhận tiếp nhận</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={18} />
                        <span>Từ chối tiếp nhận</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {selectedView === "Địa điểm & Cửa hàng" && (
          <LocationsView
            user={user}
            batches={batches}
            onBatchUpdated={loadData}
            activeBatchId={distributeBatchId}
          />
        )}

        {selectedView === "Nhập CSV" && (
          <CsvImportView onImportSuccess={loadData} />
        )}

        {selectedView === "Nhật ký thao tác" && (
          <AuditLogsView />
        )}

        {selectedBatch && selectedView !== "Nhật ký thao tác" && (
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            {/* Event Timeline */}
            <div className="rounded-2xl bg-white p-6 card-shadow border border-slate-200/80">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">Dòng thời gian sự kiện (Hash Chain)</h2>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                      {timelineEvents.length} mốc
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Lô hàng: <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{selectedBatch.batch_code}</span>
                  </p>
                  {(selectedBatch.events || []).some((event) => event.event_type === "batch_transferred") && (
                    <p className="mt-2 inline-flex items-center rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200">
                      Nhật ký bao gồm các sự kiện trước và sau khi bàn giao lô.
                    </p>
                  )}
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

              {timelineEvents.length === 0 ? (
                <div className="mt-12 flex flex-col items-center justify-center py-10 text-slate-400">
                  <ClipboardList size={40} className="opacity-30 mb-2" />
                  <p className="text-sm">Chưa có sự kiện nào cho lô này.</p>
                </div>
              ) : (
                <ol className="mt-6 relative border-l-2 border-slate-200 pl-6 space-y-0">
                  {timelineEvents.map((event, index) => {
                    let parsedData = {};
                    try { parsedData = JSON.parse(event.data_json); } catch { /* ignore */ }
                    const isLast = index === (timelineEvents.length - 1);
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
                            <div className="flex flex-wrap items-center gap-2">
                              <EventBadge eventType={event.event_type} />
                              {event.isAncestorEvent && (
                                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200">
                                  Lịch sử tổ tiên · {event.batch_code}
                                </span>
                              )}
                            </div>
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
                    <dt className="text-slate-500">Nơi giữ hiện tại</dt>
                    <dd className="font-semibold text-right text-slate-800">
                      {selectedBatch.current_location || "Chưa cập nhật"}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <dt className="text-slate-500">Khối lượng còn lại</dt>
                    <dd className="font-mono font-bold text-slate-900">
                      {Number(selectedBatch.remaining_quantity).toLocaleString()} {selectedBatch.product_unit || "kg"}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <dt className="text-slate-500">Nhiệt độ hiện tại</dt>
                    <dd className="font-mono font-bold text-emerald-700">
                      {selectedBatch.temperature_c ?? 9}°C
                    </dd>
                  </div>
                </dl>

                {/* S-29: Tiêu thụ / Bán hết Button & S-30: Chia lô về cửa hàng */}
                {selectedBatch.status !== "consumed" && Number(selectedBatch.remaining_quantity) > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
                    {user?.role === "distributor_admin" && (
                      <button
                        type="button"
                        onClick={() => {
                          setDistributeBatchId(selectedBatch.id);
                          setSelectedView("Địa điểm & Cửa hàng");
                        }}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 transition cursor-pointer"
                      >
                        <Boxes size={14} /> Chia lô về các cửa hàng (S-30)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConsumeModalBatch(selectedBatch)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition cursor-pointer"
                    >
                      <ShoppingCart size={14} /> Ghi nhận bán hết / Tiêu thụ (S-29)
                    </button>
                  </div>
                )}
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
              <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 card-shadow border border-slate-200/80 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">Nguồn gốc phả hệ & Phân cấp Lô</h3>
                      <span className="rounded-md bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                        Mẹ ➔ Con
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Chi tiết quan hệ phân cấp: Lô Mẹ sinh ra lô này và các Lô Con được phân chia.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLineageModalBatch(selectedBatch)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 transition"
                  >
                    <Network size={14} /> Sơ đồ cây phả hệ (S-28)
                  </button>
                </div>

                {/* Tab Switcher: Lô Mẹ/Con trực tiếp vs Toàn bộ dòng họ */}
                <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1">
                  <button
                    type="button"
                    onClick={() => setGenealogyTab("family")}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${
                      genealogyTab === "family"
                        ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <GitBranch size={13} />
                    <span>Lô Mẹ & Các Lô Con (Chi tiết)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenealogyTab("lineage")}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${
                      genealogyTab === "lineage"
                        ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <Layers size={13} />
                    <span>Toàn chuỗi & Lịch sử dòng họ</span>
                  </button>
                </div>

                {genealogy ? (
                  genealogyTab === "family" ? (
                    /* TAB 1: 3-TIER HIERARCHY: MOTHER -> CURRENT -> CHILDREN */
                    <div className="mt-4 space-y-3 text-xs">
                      {/* TẦNG 1: LÔ MẸ (PARENT BATCH) */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            🌱 Tầng 1: Lô Mẹ (Nguồn gốc trực tiếp)
                          </span>
                          {batchSummary?.parentRelations?.length > 0 && (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                              {batchSummary.parentRelations.length} lô mẹ
                            </span>
                          )}
                        </div>

                        {batchSummary?.parentRelations?.length > 0 ? (
                          <div className="space-y-2">
                            {batchSummary.parentRelations.map((rel) => {
                              const pBatch = filteredBatches.find((b) => b.id === rel.parent_batch_id) || batches.find((b) => b.id === rel.parent_batch_id);
                              return (
                                <div
                                  key={`${rel.parent_batch_id}-${rel.child_batch_id}`}
                                  className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 transition hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-xs"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                                        🌱 Lô Mẹ
                                      </span>
                                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                        {rel.parent_batch_code}
                                      </span>
                                      {pBatch?.status && <BatchStatusBadge status={pBatch.status} />}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleSelectBatch(rel.parent_batch_id)}
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition"
                                    >
                                      Xem Lô Mẹ <ArrowRight size={12} />
                                    </button>
                                  </div>
                                  <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                                    <div>
                                      <span className="text-slate-400 dark:text-slate-500 block">Số lượng đã chuyển:</span>
                                      <span className="font-bold text-slate-800 dark:text-slate-200">{Number(rel.quantity).toLocaleString()} kg</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 dark:text-slate-500 block">Hình thức tạo lô:</span>
                                      <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">
                                        {rel.relation_type === "split" ? "Tách lô (Split)" : rel.relation_type === "merge" ? "Gộp lô (Merge)" : rel.relation_type}
                                      </span>
                                    </div>
                                    <div className="col-span-2 sm:col-span-1">
                                      <span className="text-slate-400 dark:text-slate-500 block">Đơn vị / Kho lưu:</span>
                                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">
                                        {pBatch?.organization_name || pBatch?.current_location || "N/A"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                              🌱
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                                  Lô gốc ban đầu (Root Batch)
                                </span>
                                <span className="rounded bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                                  Khởi điểm chuỗi
                                </span>
                              </div>
                              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                                Đây là lô gốc ban đầu được tạo từ đợt thu hoạch nông trại hoặc nhập khẩu, không có lô mẹ trước đó.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* MŨI TÊN KẾT NỐI TẦNG 1 ➔ TẦNG 2 */}
                      <div className="flex items-center justify-center py-0.5">
                        <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          <ArrowDown size={11} className="text-emerald-600" />
                          <span>Chuyển giao phả hệ</span>
                        </div>
                      </div>

                      {/* TẦNG 2: LÔ ĐANG CHỌN (CURRENT BATCH) */}
                      <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30 p-4 shadow-xs ring-4 ring-emerald-500/10">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-xs">
                              📍 Lô Đang Xem
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                              {selectedBatch.batch_code}
                            </span>
                          </div>
                          <BatchStatusBadge status={selectedBatch.status} />
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60">
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Sản phẩm:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">{selectedBatch.product_name}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Khối lượng ban đầu:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{Number(selectedBatch.initial_quantity).toLocaleString()} kg</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Hiện còn lại:</span>
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">{Number(selectedBatch.remaining_quantity).toLocaleString()} kg</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Nơi lưu trữ:</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300 truncate block">{selectedBatch.current_location || "N/A"}</span>
                          </div>
                        </div>
                      </div>

                      {/* MŨI TÊN KẾT NỐI TẦNG 2 ➔ TẦNG 3 */}
                      <div className="flex items-center justify-center py-0.5">
                        <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          <ArrowDown size={11} className="text-indigo-600" />
                          <span>{batchSummary?.childRelations?.length > 0 ? `Đã tách thành ${batchSummary.childRelations.length} lô con` : "Chưa chia tách"}</span>
                        </div>
                      </div>

                      {/* TẦNG 3: CÁC LÔ CON ĐÃ CHIA (CHILDREN BATCHES) */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                            <Layers size={13} className="text-indigo-600" />
                            Tầng 3: Các Lô Con Được Phân Chia ({batchSummary?.childRelations?.length || 0} lô)
                          </span>
                          {batchSummary?.childRelations?.length > 0 && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Tổng xuất: <strong className="text-slate-800 dark:text-slate-200">{batchSummary.childRelations.reduce((sum, r) => sum + Number(r.quantity), 0).toLocaleString()} kg</strong>
                            </span>
                          )}
                        </div>

                        {batchSummary?.childRelations?.length > 0 ? (
                          <div className="space-y-2">
                            {batchSummary.childRelations.map((rel, idx) => {
                              const cBatch = filteredBatches.find((b) => b.id === rel.child_batch_id) || batches.find((b) => b.id === rel.child_batch_id);
                              const totalInit = Number(selectedBatch.initial_quantity) || 1;
                              const sharePercent = Math.min(100, Math.round((Number(rel.quantity) / totalInit) * 100));

                              return (
                                <div
                                  key={`${rel.parent_batch_id}-${rel.child_batch_id}`}
                                  className="rounded-2xl border border-indigo-100 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50/30 via-white to-slate-50 dark:from-indigo-950/20 dark:via-slate-900/50 dark:to-slate-800/40 p-3.5 transition hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-xs"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                                        {idx + 1}
                                      </span>
                                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                        {rel.child_batch_code}
                                      </span>
                                      {cBatch?.status && <BatchStatusBadge status={cBatch.status} />}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleSelectBatch(rel.child_batch_id)}
                                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition"
                                    >
                                      Xem Lô Con <ArrowRight size={12} />
                                    </button>
                                  </div>

                                  {/* Progress bar tỷ lệ phân bổ */}
                                  <div className="mt-2.5">
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                                      <span>Tỷ lệ so với lô mẹ: <strong>{sharePercent}%</strong></span>
                                      <span>Số lượng nhận: <strong className="text-slate-800 dark:text-slate-200">{Number(rel.quantity).toLocaleString()} kg</strong></span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                        style={{ width: `${sharePercent}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* Thông tin chi tiết lô con */}
                                  <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                                    <div>
                                      <span className="text-slate-400 dark:text-slate-500 block">Hiện còn trong kho:</span>
                                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                        {cBatch ? `${Number(cBatch.remaining_quantity).toLocaleString()} kg` : "N/A"}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 dark:text-slate-500 block">Kiểu phân chia:</span>
                                      <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">
                                        {rel.relation_type === "split" ? "Tách lô" : rel.relation_type === "merge" ? "Gộp lô" : rel.relation_type}
                                      </span>
                                    </div>
                                    <div className="col-span-2 sm:col-span-1">
                                      <span className="text-slate-400 dark:text-slate-500 block">Nơi lưu trữ / Cửa hàng:</span>
                                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">
                                        {cBatch?.current_location || cBatch?.organization_name || "Kho trung tâm"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-4 text-center">
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                              Lô này hiện chưa được chia tách thành lô con nào.
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                              Toàn bộ {Number(selectedBatch.remaining_quantity).toLocaleString()} kg nông sản đang được lưu trữ nguyên vẹn tại {selectedBatch.current_location || "kho"}.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* TAB 2: TOÀN BỘ CHUỖI & DÒNG HỌ NGUỒN GỐC (FULL LINEAGE) */
                    <div className="mt-4 space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Lô tổ tiên (Ancestors):</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{genealogy.ancestors?.length || 0} lô</span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">Lô con cháu (Descendants):</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{genealogy.descendants?.length || 0} lô</span>
                        </div>
                      </div>

                      {genealogy.roots?.length > 0 && (
                        <div className="pt-1">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Lô gốc ban đầu (Roots):</span>
                          <div className="space-y-1.5">
                            {genealogy.roots.map((root) => (
                              <div key={root.id} className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 bg-emerald-50/80 dark:bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                                <span>{root.batch_code}</span>
                                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-normal">Lô gốc</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {genealogy.ancestors?.length > 1 && (
                        <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Đường truy ngược về nguồn gốc (Root Lineage)</span>
                          <ol className="mt-2 space-y-1.5">
                            {genealogy.ancestors.filter((item) => item.id !== selectedBatch.id).map((ancestor, index) => (
                              <li key={ancestor.id} className="flex items-center gap-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 px-2.5 py-2">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">{index + 1}</span>
                                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{ancestor.batch_code}</span>
                                <span className="ml-auto text-slate-500 dark:text-slate-400">còn {Number(ancestor.remaining_quantity).toLocaleString()} kg</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {genealogy.descendants?.length > 0 && (
                        <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Tất cả các lô hậu duệ</span>
                          <ul className="mt-2 space-y-1.5">
                            {genealogy.descendants.map((descendant) => (
                              <li key={descendant.id} className="grid gap-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 px-2.5 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-indigo-500">↳</span>
                                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{descendant.batch_code}</span>
                                    <BatchStatusBadge status={descendant.status} />
                                  </div>
                                  <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                                    {descendant.organization_name || "Chưa rõ tổ chức"} · {descendant.current_location || "Chưa cập nhật địa điểm"}
                                  </p>
                                </div>
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                  Còn {Number(descendant.remaining_quantity).toLocaleString()} kg
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <p className="mt-3 text-xs text-slate-400 italic">
                    Chọn một lô để tải cây phả hệ nguồn gốc.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {consumeModalBatch && (
          <ConsumeModal
            batch={consumeModalBatch}
            onClose={() => setConsumeModalBatch(null)}
            onSuccess={async () => {
              await loadData();
              setSubmission({
                message: `Đã ghi nhận tiêu thụ thành công lô ${consumeModalBatch.batch_code || consumeModalBatch.code}.`,
                tone: "success",
              });
            }}
          />
        )}

        {lineageModalBatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 gaussian-backdrop animate-fade-in">
            <div className="animate-modal-in modal-card-glow relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setLineageModalBatch(null)}
                className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <X size={20} />
              </button>
              <LineageGraphView
                batchId={lineageModalBatch.id}
                batchCode={lineageModalBatch.batch_code || lineageModalBatch.code}
              />
            </div>
          </div>
        )}

        {/* Modal xác nhận lưu lô thu hoạch */}
        {confirmHarvestModal.open && (
          <ConfirmSaveModal
            isOpen={confirmHarvestModal.open}
            title="Xác nhận lưu thông tin lô thu hoạch"
            subtitle="Vui lòng kiểm tra lại thông tin lô nông sản trước khi tạo chuỗi hash"
            data={confirmHarvestModal.data}
            schema={HARVEST_PREVIEW_SCHEMA}
            icon={Tractor}
            isLoading={confirmHarvestModal.submitting}
            onClose={() =>
              !confirmHarvestModal.submitting &&
              setConfirmHarvestModal({ open: false, data: null, submitting: false })
            }
            onConfirm={handleConfirmHarvestSave}
          />
        )}

        {/* Modal xác nhận lưu thông tin thửa đất */}
        {confirmPlotModal.open && (
          <ConfirmSaveModal
            isOpen={confirmPlotModal.open}
            title={editingLandPlotId ? "Xác nhận cập nhật thông tin thửa đất" : "Xác nhận khai báo thửa đất mới"}
            subtitle="Kiểm tra tên thửa đất, diện tích và tọa độ GPS định vị vùng trồng"
            data={confirmPlotModal.data}
            schema={PLOT_PREVIEW_SCHEMA}
            icon={MapPin}
            isLoading={confirmPlotModal.submitting}
            confirmText={editingLandPlotId ? "Xác nhận cập nhật" : "Xác nhận lưu thửa đất"}
            noticeText="Thông tin vùng trồng sẽ được liên kết định danh trong các đợt thu hoạch."
            onClose={() =>
              !confirmPlotModal.submitting &&
              setConfirmPlotModal({ open: false, data: null, submitting: false })
            }
            onConfirm={handleConfirmPlotSave}
          />
        )}

        {/* Modal xác nhận lưu thông tin sản phẩm */}
        {confirmProductModal.open && (
          <ConfirmSaveModal
            isOpen={confirmProductModal.open}
            title={editingProductId ? "Xác nhận cập nhật thông tin sản phẩm" : "Xác nhận thêm sản phẩm mới"}
            subtitle="Kiểm tra tên sản phẩm nông sản và quy cách đơn vị đo lường"
            data={confirmProductModal.data}
            schema={PRODUCT_PREVIEW_SCHEMA}
            icon={Box}
            isLoading={confirmProductModal.submitting}
            confirmText={editingProductId ? "Xác nhận cập nhật" : "Xác nhận thêm sản phẩm"}
            noticeText="Sản phẩm mới sẽ sẵn sàng trong danh mục lựa chọn khi nông dân thu hoạch."
            onClose={() =>
              !confirmProductModal.submitting &&
              setConfirmProductModal({ open: false, data: null, submitting: false })
            }
            onConfirm={handleConfirmProductSave}
          />
        )}

        {/* Modal xác nhận gửi yêu cầu bàn giao */}
        {confirmTransferModal.open && (
          <ConfirmSaveModal
            isOpen={confirmTransferModal.open}
            title="Xác nhận gửi yêu cầu bàn giao lô hàng"
            subtitle="Kiểm tra mã lô nông sản và đơn vị đối tác tiếp nhận bàn giao"
            data={confirmTransferModal.data}
            schema={TRANSFER_PREVIEW_SCHEMA}
            icon={Truck}
            isLoading={confirmTransferModal.submitting}
            confirmText="Gửi yêu cầu bàn giao"
            noticeText="Một yêu cầu bàn giao mới sẽ được chuyển tới tổ chức nhận để họ xác nhận."
            onClose={() =>
              !confirmTransferModal.submitting &&
              setConfirmTransferModal({ open: false, data: null, submitting: false })
            }
            onConfirm={handleConfirmTransferSave}
          />
        )}

        {/* Modal xác nhận phân tách lô hàng */}
        {confirmSplitModal.open && (
          <ConfirmSaveModal
            isOpen={confirmSplitModal.open}
            title="Xác nhận thực hiện phân tách lô hàng"
            subtitle="Kiểm tra số lượng và tổng khối lượng các lô con dự kiến tách"
            data={confirmSplitModal.data}
            schema={SPLIT_PREVIEW_SCHEMA}
            icon={ArrowRightLeft}
            isLoading={confirmSplitModal.submitting}
            confirmText="Xác nhận tách lô"
            noticeText="Hệ thống sẽ sinh mã lô con mới và ghi nhận liên kết phả hệ cha-con bất biến."
            onClose={() =>
              !confirmSplitModal.submitting &&
              setConfirmSplitModal({ open: false, data: null, allocations: null, submitting: false })
            }
            onConfirm={handleConfirmSplitSave}
          />
        )}

        {/* Modal xác nhận gộp các lô hàng */}
        {confirmMergeModal.open && (
          <ConfirmSaveModal
            isOpen={confirmMergeModal.open}
            title="Xác nhận gộp các lô nông sản"
            subtitle="Kiểm tra danh sách các mã lô được gộp thành một lô lớn thống nhất"
            data={confirmMergeModal.data}
            schema={MERGE_PREVIEW_SCHEMA}
            icon={Boxes}
            isLoading={confirmMergeModal.submitting}
            confirmText="Xác nhận gộp lô"
            noticeText="Các lô thành phần sẽ được liên kết vào lô gộp mới và lưu vết trên chuỗi Hash."
            onClose={() =>
              !confirmMergeModal.submitting &&
              setConfirmMergeModal({ open: false, data: null, submitting: false })
            }
            onConfirm={handleConfirmMergeSave}
          />
        )}

        {/* Modal kết quả chi tiết sau khi Tách lô hoặc Gộp lô (S-30) */}
        {splitMergeResultModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 gaussian-backdrop animate-fade-in">
            <div className="animate-modal-in modal-card-glow w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                      splitMergeResultModal.type === "split"
                        ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400"
                        : "bg-teal-100 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400"
                    } shadow-xs`}
                  >
                    <CheckCircle2 size={28} />
                  </div>
                  <div>
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        splitMergeResultModal.type === "split"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-teal-600 dark:text-teal-400"
                      }`}
                    >
                      {splitMergeResultModal.type === "split" ? "Hoàn tất phân tách lô" : "Hoàn tất gộp lô"}
                    </span>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      {splitMergeResultModal.title}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSplitMergeResultModal((prev) => ({ ...prev, open: false }))}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition"
                  aria-label="Đóng"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              {splitMergeResultModal.type === "split" ? (
                <div className="mt-5 space-y-4">
                  {/* Lô Mẹ thông tin */}
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200/80 dark:border-slate-700">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">
                      🌱 Lô Mẹ (Nguồn):
                    </span>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                        {splitMergeResultModal.parent?.batch_code || "Lô mẹ"}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        Khối lượng còn lại sau tách:{" "}
                        <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {Number(splitMergeResultModal.parent?.remaining_quantity || 0).toLocaleString()} kg
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Danh sách các Lô Con vừa tạo */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Layers size={14} className="text-emerald-600" />
                        Danh sách {splitMergeResultModal.children?.length || 0} Lô Con Đã Phân Chia:
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Tổng xuất:{" "}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {splitMergeResultModal.children
                            ?.reduce((s, c) => s + Number(c.initial_quantity || c.remaining_quantity || 0), 0)
                            .toLocaleString()}{" "}
                          kg
                        </strong>
                      </span>
                    </div>

                    <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                      {splitMergeResultModal.children?.map((child, idx) => (
                        <div
                          key={child.id || idx}
                          className="rounded-2xl border border-emerald-100 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/40 via-white to-slate-50 dark:from-emerald-950/20 dark:via-slate-900/40 dark:to-slate-800/40 p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xs">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                  {child.batch_code}
                                </span>
                                <span className="rounded bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                                  Lô con mới
                                </span>
                                {child.status && <BatchStatusBadge status={child.status} />}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                <span>
                                  Khối lượng:{" "}
                                  <strong className="text-slate-800 dark:text-slate-200">
                                    {Number(child.initial_quantity || child.remaining_quantity).toLocaleString()} kg
                                  </strong>
                                </span>
                                {child.current_location && (
                                  <span>
                                    Điểm đến:{" "}
                                    <strong className="text-slate-700 dark:text-slate-300">
                                      {child.current_location}
                                    </strong>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setSplitMergeResultModal((prev) => ({ ...prev, open: false }));
                              if (child.id) handleSelectBatch(child.id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs"
                          >
                            Xem lô con này <ArrowRight size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Gộp lô (Merge) */
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl bg-teal-50 dark:bg-teal-950/40 p-4 border border-teal-200 dark:border-teal-800">
                    <span className="text-[11px] font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wider block mb-1">
                      📦 Lô Gộp Mới Sinh Ra:
                    </span>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-base font-bold text-teal-950 dark:text-teal-100">
                        {splitMergeResultModal.newBatch?.batch_code}
                      </span>
                      <span className="text-xs font-bold text-teal-800 dark:text-teal-300">
                        Tổng khối lượng:{" "}
                        {Number(
                          splitMergeResultModal.newBatch?.initial_quantity ||
                            splitMergeResultModal.newBatch?.remaining_quantity ||
                            0
                        ).toLocaleString()}{" "}
                        kg
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-teal-700 dark:text-teal-400">
                      Vị trí lưu kho: {splitMergeResultModal.newBatch?.current_location || "Kho trung tâm"}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-2">
                      Được gộp từ {splitMergeResultModal.sourceBatches?.length || 0} lô thành phần:
                    </span>
                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                      {splitMergeResultModal.sourceBatches?.map((src) => (
                        <div
                          key={src.id}
                          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2.5 flex items-center justify-between text-xs"
                        >
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {src.batch_code}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            Đã gộp: {Number(src.remaining_quantity || src.initial_quantity).toLocaleString()} kg
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="mt-6 flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSplitMergeResultModal((prev) => ({ ...prev, open: false }))}
                  className="rounded-xl bg-slate-100 dark:bg-slate-800 px-5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Đóng cửa sổ
                </button>
                {splitMergeResultModal.type === "split" && splitMergeResultModal.parent?.id && (
                  <button
                    type="button"
                    onClick={() => {
                      const parentId = splitMergeResultModal.parent.id;
                      setSplitMergeResultModal((prev) => ({ ...prev, open: false }));
                      handleSelectBatch(parentId);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-5 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition"
                  >
                    Xem Lô Mẹ ({splitMergeResultModal.parent?.batch_code}) <ArrowRight size={14} />
                  </button>
                )}
                {splitMergeResultModal.type === "merge" && splitMergeResultModal.newBatch?.id && (
                  <button
                    type="button"
                    onClick={() => {
                      const newId = splitMergeResultModal.newBatch.id;
                      setSplitMergeResultModal((prev) => ({ ...prev, open: false }));
                      handleSelectBatch(newId);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-teal-700 transition shadow-sm"
                  >
                    Mở Xem Lô Gộp Mới <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
