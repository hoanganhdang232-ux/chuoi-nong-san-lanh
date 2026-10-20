import { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Boxes,
  X,
  CheckCircle2,
  Layers,
  History,
  Store,
  ArrowRightLeft,
  Search,
  Phone,
  Building2,
  RefreshCw,
  Eye,
  ShieldCheck,
  Hash,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "../api.js";
import { useToast } from "../context/ToastContext.jsx";
import { scrollToElement } from "../utils/scrollHelper.js";

export default function LocationsView({
  batches = [],
  onBatchUpdated,
  activeBatchId = null,
  _user = null,
}) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("stores"); // "stores" | "history"

  // Locations state
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  // Transfer history state
  const [transfersHistory, setTransfersHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferPage, setTransferPage] = useState(1);
  const transferPageSize = 8;

  // Transfer Detail Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedTransferDetail, setSelectedTransferDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Location Form State (T-64)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    address: "",
    phone: "",
    type: "STORE",
    status: "Active",
  });
  const [submitting, setSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  // Transfer Batch Modal State (T-65)
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(
    activeBatchId ? String(activeBatchId) : "",
  );
  const [transferNote, setTransferNote] = useState("");
  const [distributionAllocations, setDistributionAllocations] = useState([
    { locationId: "", quantity: "" },
  ]);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [distributeResultModal, setDistributeResultModal] = useState({
    open: false,
    parentBatch: null,
    children: [],
    transferCode: "",
  });

  const selectedBatch = batches.find((batch) => String(batch.id) === selectedBatchId);
  const totalDistribution = distributionAllocations.reduce(
    (total, allocation) => total + (Number(allocation.quantity) || 0),
    0,
  );
  const remainingStock = Number(selectedBatch?.remaining_quantity || 0);
  const isOverAllocated = totalDistribution > remainingStock;

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const res = await api.getLocations();
      // Hỗ trợ cả array hoặc object { data, pagination }
      const items = Array.isArray(res) ? res : (res?.data || []);
      setLocations(items);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransfersHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.getInternalTransfers();
      const items = Array.isArray(res) ? res : (res?.data || []);
      setTransfersHistory(items);
    } catch (err) {
      console.warn("Không tải được lịch sử điều chuyển:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
    fetchTransfersHistory();
  }, []);

  useEffect(() => {
    if (activeBatchId) {
      setSelectedBatchId(String(activeBatchId));
      setAssignModalOpen(true);
    }
  }, [activeBatchId]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      code: "",
      name: "",
      address: "",
      phone: "",
      type: "STORE",
      status: "Active",
    });
    setIsFormOpen(true);
    setPhoneError("");
  };

  const handleOpenEdit = (loc) => {
    setEditingId(loc.id);
    setFormData({
      code: loc.code || "",
      name: loc.name || "",
      address: loc.address || "",
      phone: loc.phone || "",
      type: loc.type || "STORE",
      status: loc.status || "Active",
    });
    setIsFormOpen(true);
    setPhoneError("");
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      const nextStatus = String(currentStatus).toUpperCase() === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await api.toggleLocationStatus(id, nextStatus);
      toast.success(
        `Đã chuyển trạng thái sang ${nextStatus === "ACTIVE" ? "Hoạt động" : "Tạm dừng"}.`,
      );
      await fetchLocations();
      scrollToElement(`location-row-${id}`, { block: "center", highlight: true });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleViewTransferDetail = async (transferId) => {
    try {
      setDetailLoading(true);
      setDetailModalOpen(true);
      const detail = await api.getTransferDetail(transferId);
      setSelectedTransferDetail(detail);
    } catch (err) {
      toast.error("Không thể xem chi tiết: " + err.message);
      setDetailModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.phone && formData.phone.trim()) {
      const cleanPhone = formData.phone.trim().replace(/[\s.-]/g, "");
      if (!/^0\d{9}$/.test(cleanPhone)) {
        setPhoneError("Số điện thoại không hợp lệ. Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0.");
        toast.error("Số điện thoại không hợp lệ. Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0.");
        return;
      }
    }
    setSubmitting(true);
    let targetLocationId = editingId;
    try {
      if (editingId) {
        await api.updateLocation(editingId, formData);
        toast.success("Cập nhật thông tin cửa hàng thành công.");
      } else {
        const res = await api.createLocation(formData);
        targetLocationId = res?.location?.id || res?.id;
        toast.success("Thêm mới cửa hàng thành công.");
      }
      setIsFormOpen(false);
      await fetchLocations();
      if (targetLocationId) {
        scrollToElement(`location-row-${targetLocationId}`, { block: "center", highlight: true });
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa cửa hàng "${name}"?`)) return;
    try {
      const res = await api.deleteLocation(id);
      if (res?.status === "Inactive") {
        toast.info(res.message || "Cửa hàng đã được chuyển trạng thái sang Tạm dừng do có lịch sử.");
      } else {
        toast.success(`Đã xóa cửa hàng "${name}".`);
      }
      await fetchLocations();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleOpenTransferForLocation = (locationId) => {
    setDistributionAllocations([{ locationId: String(locationId), quantity: "" }]);
    setAssignModalOpen(true);
  };

  const handleAssignLocation = async (e) => {
    e.preventDefault();
    if (!selectedBatchId || distributionAllocations.length === 0) return;

    // Validate
    const invalidRow = distributionAllocations.find(
      (row) => !row.locationId || !(Number(row.quantity) > 0),
    );
    if (invalidRow) {
      toast.error("Vui lòng chọn cửa hàng và nhập số lượng hợp lệ (> 0).");
      return;
    }

    if (isOverAllocated) {
      toast.error("Tổng số lượng phân bổ vượt quá tồn kho hiện có của lô hàng.");
      return;
    }

    setAssignSubmitting(true);
    try {
      const allocations = distributionAllocations.map((allocation) => ({
        location_id: Number(allocation.locationId),
        quantity: Number(allocation.quantity),
      }));

      const currentBatchObj = batches.find((batch) => String(batch.id) === selectedBatchId);
      const result = await api.transferBatchToStore({
        batch_id: Number(selectedBatchId),
        allocations,
        note: transferNote,
      });

      toast.success(result.message || `Đã chuyển lô thành công cho ${allocations.length} cửa hàng.`);

      // Hiển thị modal chi tiết các lô con đã chia cho từng cửa hàng
      setDistributeResultModal({
        open: true,
        parentBatch: currentBatchObj,
        children: result.children || [],
        transferCode: result.transfers?.[0]?.transfer_code || "",
      });

      setAssignModalOpen(false);
      setSelectedBatchId("");
      setTransferNote("");
      setDistributionAllocations([{ locationId: "", quantity: "" }]);

      if (onBatchUpdated) onBatchUpdated();
      await fetchLocations();
      await fetchTransfersHistory();
      setActiveTab("history");
      scrollToElement("internal-transfers-table-container", { block: "start", highlight: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAssignSubmitting(false);
    }
  };

  const filteredLocations = locations.filter((loc) => {
    const matchesSearch =
      searchTerm.trim() === "" ||
      loc.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loc.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loc.address?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      loc.status?.toLowerCase() === statusFilter.toLowerCase();

    const matchesType =
      typeFilter === "all" ||
      (loc.type || "STORE").toLowerCase() === typeFilter.toLowerCase();

    return matchesSearch && matchesStatus && matchesType;
  });

  const totalStorePages = Math.max(1, Math.ceil(filteredLocations.length / pageSize));
  const paginatedLocations = filteredLocations.slice((page - 1) * pageSize, page * pageSize);

  const filteredTransfers = transfersHistory.filter((t) => {
    if (!transferSearch.trim()) return true;
    const term = transferSearch.toLowerCase();
    return (
      t.transfer_code?.toLowerCase().includes(term) ||
      t.source_batch_code?.toLowerCase().includes(term) ||
      t.target_batch_code?.toLowerCase().includes(term) ||
      t.location_name?.toLowerCase().includes(term)
    );
  });

  const totalTransferPages = Math.max(1, Math.ceil(filteredTransfers.length / transferPageSize));
  const paginatedTransfers = filteredTransfers.slice(
    (transferPage - 1) * transferPageSize,
    transferPage * transferPageSize,
  );

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-xs">
              <Store size={18} />
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              Quản lý Cửa hàng & Phân phối Lô hàng (NPP)
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Quản lý danh sách các điểm nhận và thực hiện điều chuyển lô hàng từ kho tổng về cửa hàng nội bộ trực thuộc.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setDistributionAllocations([{ locationId: "", quantity: "" }]);
              setAssignModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 cursor-pointer shadow-xs active:scale-95"
          >
            <Boxes size={16} />
            <span>Điều chuyển lô về cửa hàng</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 cursor-pointer active:scale-95"
          >
            <Plus size={16} />
            <span>Thêm cửa hàng mới</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("stores")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === "stores"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Building2 size={16} />
            <span>Danh sách Cửa hàng</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              {locations.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("history");
              fetchTransfersHistory();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === "history"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <History size={16} />
            <span>Lịch sử Điều chuyển Nội bộ</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              {transfersHistory.length}
            </span>
          </button>
        </div>

        {activeTab === "stores" && (
          <div className="flex items-center gap-2 pb-2 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã, tên, địa chỉ..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-44 sm:w-56"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="all">Tất cả loại</option>
              <option value="STORE">Cửa hàng</option>
              <option value="WAREHOUSE">Kho phụ</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="Active">Đang hoạt động</option>
              <option value="Inactive">Tạm dừng</option>
            </select>
          </div>
        )}

        {activeTab === "history" && (
          <div className="flex items-center gap-2 pb-2 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã lệnh, lô hàng, cửa hàng..."
                value={transferSearch}
                onChange={(e) => {
                  setTransferSearch(e.target.value);
                  setTransferPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-52 sm:w-64"
              />
            </div>
            <button
              type="button"
              onClick={fetchTransfersHistory}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-700 font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white cursor-pointer transition"
            >
              <RefreshCw size={13} className={historyLoading ? "animate-spin" : ""} />
              <span>Làm mới</span>
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: Danh sách Cửa hàng (T-64) */}
      {activeTab === "stores" && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200/80">
                  <tr>
                    <th className="px-5 py-3.5">Mã CH</th>
                    <th className="px-5 py-3.5">Tên Cửa Hàng / Điểm Bán</th>
                    <th className="px-5 py-3.5">Loại</th>
                    <th className="px-5 py-3.5">Địa Chỉ Chi Tiết</th>
                    <th className="px-5 py-3.5">Số Điện Thoại</th>
                    <th className="px-5 py-3.5">Trạng Thái</th>
                    <th className="px-5 py-3.5">Tồn Kho Hiện Tại</th>
                    <th className="px-5 py-3.5 text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                        Đang tải danh sách cửa hàng...
                      </td>
                    </tr>
                  ) : paginatedLocations.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-400 italic">
                        {locations.length === 0
                          ? "Chưa có cửa hàng nào được khai báo. Hãy bấm \"Thêm cửa hàng mới\"."
                          : "Không tìm thấy cửa hàng phù hợp với bộ lọc."}
                      </td>
                    </tr>
                  ) : (
                    paginatedLocations.map((loc, idx) => {
                      const isActive = (loc.status || "Active").toLowerCase() === "active";
                      const isWarehouse = (loc.type || "STORE").toUpperCase() === "WAREHOUSE";
                      return (
                        <tr
                          key={loc.id}
                          id={`location-row-${loc.id}`}
                          className={`transition-colors ${
                            idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                          } hover:bg-emerald-50/40`}
                        >
                          <td className="px-5 py-4 font-mono font-bold">
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700 border border-slate-200">
                              {loc.code || `CH-${String(loc.id).padStart(3, "0")}`}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-bold text-slate-900 text-sm">
                            {loc.name}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                                isWarehouse
                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                  : "bg-blue-50 text-blue-700 border-blue-200"
                              }`}
                            >
                              {isWarehouse ? "Kho phụ" : "Cửa hàng"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-slate-600 max-w-xs truncate" title={loc.address}>
                            {loc.address || "Chưa cập nhật"}
                          </td>
                          <td className="px-5 py-4 text-slate-600 font-mono">
                            {loc.phone ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="flex items-center gap-1.5">
                                  <Phone size={13} className="text-slate-400" />
                                  {loc.phone}
                                </span>
                                {!/^0\d{9}$/.test(String(loc.phone).replace(/[\s.-]/g, "")) && (
                                  <span className="inline-flex items-center text-[10px] text-amber-600 font-medium font-sans">
                                    ⚠️ Cần sửa (phải 10 số)
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">--</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(loc.id, loc.status)}
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition cursor-pointer border ${
                                isActive
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                  : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                              }`}
                              title="Bấm để bật/tắt trạng thái"
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isActive ? "bg-emerald-500" : "bg-slate-400"
                                }`}
                              />
                              {isActive ? "Hoạt động" : "Tạm dừng"}
                            </button>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                                {loc.batch_count || 0} lô
                              </span>
                              <span className="font-mono text-slate-800 font-semibold">
                                {Number(loc.total_inventory || 0).toLocaleString()} kg
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenTransferForLocation(loc.id)}
                                className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer"
                                title="Chuyển lô đến cửa hàng này"
                              >
                                Chuyển lô
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(loc)}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-700 transition cursor-pointer"
                                title="Chỉnh sửa"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(loc.id, loc.name)}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                                title="Xóa hoặc chuyển trạng thái"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Cửa hàng */}
          {filteredLocations.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-500 px-2">
              <div>
                Hiển thị{" "}
                <strong className="text-slate-800">
                  {Math.min(filteredLocations.length, (page - 1) * pageSize + 1)} -{" "}
                  {Math.min(filteredLocations.length, page * pageSize)}
                </strong>{" "}
                trong tổng số <strong className="text-slate-800">{filteredLocations.length}</strong> địa điểm
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-semibold text-slate-700">
                  {page} / {totalStorePages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalStorePages}
                  onClick={() => setPage((p) => Math.min(totalStorePages, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Lịch sử Điều chuyển Nội bộ (T-65) */}
      {activeTab === "history" && (
        <div className="space-y-3">
          <div id="internal-transfers-table-container" className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200/80">
                  <tr>
                    <th className="px-5 py-3.5">Mã Lệnh Điều Chuyển</th>
                    <th className="px-5 py-3.5">Thời Gian</th>
                    <th className="px-5 py-3.5">Lô Nguồn (Kho Tổng)</th>
                    <th className="px-5 py-3.5">Lô Đích (Cửa Hàng)</th>
                    <th className="px-5 py-3.5">Cửa Hàng Tiếp Nhận</th>
                    <th className="px-5 py-3.5">Khối Lượng</th>
                    <th className="px-5 py-3.5">Người Thực Hiện</th>
                    <th className="px-5 py-3.5">Ghi Chú</th>
                    <th className="px-5 py-3.5 text-center">Trạng Thái</th>
                    <th className="px-5 py-3.5 text-center">Chi Tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-8 text-center text-slate-400">
                        Đang tải lịch sử điều chuyển lô hàng...
                      </td>
                    </tr>
                  ) : paginatedTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-8 text-center text-slate-400 italic">
                        Chưa có lệnh điều chuyển nội bộ nào. Hãy thực hiện chuyển lô từ kho tổng về cửa hàng.
                      </td>
                    </tr>
                  ) : (
                    paginatedTransfers.map((t, idx) => (
                      <tr
                        key={t.id || idx}
                        id={`internal-transfer-row-${t.id}`}
                        className={`transition-colors ${
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                        } hover:bg-emerald-50/30`}
                      >
                        <td className="px-5 py-3.5 font-mono font-bold text-emerald-800">
                          {t.transfer_code}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 font-mono">
                          {t.created_at ? new Date(t.created_at).toLocaleString("vi-VN") : "--"}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-mono font-bold text-slate-900">{t.source_batch_code}</div>
                          <div className="text-[11px] text-slate-500">{t.product_name}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {t.target_batch_code || "--"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-900">{t.location_name}</div>
                          <div className="text-[11px] text-slate-500 max-w-xs truncate" title={t.location_address}>
                            {t.location_code ? `[${t.location_code}] ` : ""}
                            {t.location_address}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-mono font-bold text-emerald-700 text-sm">
                            {Number(t.quantity).toLocaleString()} {t.product_unit || "kg"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          {t.actor_name || "Nhà phân phối"}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 max-w-xs truncate" title={t.note}>
                          {t.note || <span className="text-slate-400 italic">--</span>}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} />
                            Hoàn thành
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleViewTransferDetail(t.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition cursor-pointer"
                            title="Xem chi tiết lệnh và audit log"
                          >
                            <Eye size={13} />
                            <span>Xem</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Lịch sử */}
          {filteredTransfers.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-500 px-2">
              <div>
                Hiển thị{" "}
                <strong className="text-slate-800">
                  {Math.min(filteredTransfers.length, (transferPage - 1) * transferPageSize + 1)} -{" "}
                  {Math.min(filteredTransfers.length, transferPage * transferPageSize)}
                </strong>{" "}
                trong tổng số <strong className="text-slate-800">{filteredTransfers.length}</strong> lệnh chuyển
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={transferPage <= 1}
                  onClick={() => setTransferPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-semibold text-slate-700">
                  {transferPage} / {totalTransferPages}
                </span>
                <button
                  type="button"
                  disabled={transferPage >= totalTransferPages}
                  onClick={() => setTransferPage((p) => Math.min(totalTransferPages, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal 1: Thêm/Sửa Cửa hàng (SUBTASK 1 - T-64) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 gaussian-backdrop animate-fade-in">
          <div className="animate-modal-in modal-card-glow w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Store size={18} className="text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingId ? "Cập nhật thông tin cửa hàng" : "Thêm cửa hàng mới"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block font-semibold text-slate-700">
                  Mã cửa hàng
                  <input
                    placeholder="VD: CH-HN-01"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 uppercase"
                  />
                </label>
                <label className="block font-semibold text-slate-700">
                  Loại địa điểm *
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="STORE">Cửa hàng (Store)</option>
                    <option value="WAREHOUSE">Kho phụ (Warehouse)</option>
                  </select>
                </label>
                <label className="block font-semibold text-slate-700">
                  Trạng thái *
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="Active">Đang hoạt động</option>
                    <option value="Inactive">Tạm dừng</option>
                  </select>
                </label>
              </div>

              <label className="block font-semibold text-slate-700">
                Tên cửa hàng / Điểm bán *
                <input
                  required
                  placeholder="VD: Cửa hàng Hoàn Kiếm"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </label>

              <label className="block font-semibold text-slate-700">
                Địa chỉ chi tiết
                <input
                  placeholder="VD: 36 Tràng Tiền, Hoàn Kiếm, Hà Nội"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </label>

              <label className="block font-semibold text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Số điện thoại liên hệ</span>
                  <span className="text-[11px] font-normal text-slate-400">10 số, bắt đầu bằng 0</span>
                </div>
                <input
                  type="tel"
                  placeholder="VD: 0912345678"
                  value={formData.phone}
                  maxLength={10}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setFormData({ ...formData, phone: digitsOnly });
                    if (digitsOnly.length > 0 && !digitsOnly.startsWith("0")) {
                      setPhoneError("Số điện thoại phải bắt đầu bằng số 0.");
                    } else if (digitsOnly.length > 0 && digitsOnly.length < 10) {
                      setPhoneError(`Số điện thoại phải gồm đúng 10 số (hiện có ${digitsOnly.length} số).`);
                    } else {
                      setPhoneError("");
                    }
                  }}
                  onBlur={() => {
                    if (formData.phone && formData.phone.trim().length > 0) {
                      if (!/^0\d{9}$/.test(formData.phone.trim())) {
                        setPhoneError("Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0.");
                      } else {
                        setPhoneError("");
                      }
                    }
                  }}
                  className={`mt-1 w-full rounded-xl border bg-white p-2.5 font-mono text-slate-900 focus:outline-none focus:ring-2 ${
                    phoneError
                      ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                  }`}
                />
                {phoneError ? (
                  <p className="mt-1 text-xs font-semibold text-rose-500 flex items-center gap-1">
                    <span>⚠️</span> {phoneError}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">Định dạng chuẩn 10 chữ số (VD: 0912345678).</p>
                )}
              </label>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="min-w-[100px] rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-w-[140px] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition cursor-pointer"
                >
                  {submitting ? "Đang lưu..." : "Lưu cửa hàng"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Điều chuyển Lô hàng về Cửa hàng (SUBTASK 2 - T-65) */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 gaussian-backdrop animate-fade-in">
          <div className="animate-modal-in modal-card-glow w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <ArrowRightLeft size={17} />
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Điều chuyển Lô hàng về Cửa hàng Nội bộ (T-65)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {locations.length === 0 && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-semibold">Chưa có cửa hàng nhận hàng.</p>
                <p className="mt-1 text-[11px] opacity-90">
                  Vui lòng thêm ít nhất một cửa hàng trước khi thực hiện điều chuyển.
                </p>
              </div>
            )}

            <form onSubmit={handleAssignLocation} className="mt-4 space-y-4 text-xs">
              <label className="block font-semibold text-slate-700">
                Lô hàng nguồn (Kho tổng) *
                <select
                  required
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="">-- Chọn lô hàng cần điều chuyển --</option>
                  {batches
                    .filter(
                      (batch) =>
                        Number(batch.remaining_quantity) > 0 &&
                        batch.status !== "consumed" &&
                        batch.status !== "recalled",
                    )
                    .map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.batch_code} ({batch.product_name} — Tồn kho: {Number(batch.remaining_quantity).toLocaleString()} kg)
                      </option>
                    ))}
                </select>
              </label>

              {selectedBatch && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase block">Sản phẩm</span>
                    <span className="font-bold text-slate-900 text-xs">{selectedBatch.product_name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-500 uppercase block">Tồn kho hiện có</span>
                    <span className="font-mono font-bold text-emerald-700 text-sm">
                      {remainingStock.toLocaleString()} kg
                    </span>
                  </div>
                </div>
              )}

              {/* Phân bổ cửa hàng */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">
                    Phân bổ số lượng đến cửa hàng nhận *
                  </span>
                  <span
                    className={`font-mono text-xs font-bold ${
                      isOverAllocated ? "text-rose-600" : "text-slate-600"
                    }`}
                  >
                    Đã chọn: {totalDistribution.toLocaleString()} / {remainingStock.toLocaleString()} kg
                    {selectedBatch && (
                      <span className="ml-1 text-[11px] text-slate-400">
                        (Còn lại: {Math.max(0, remainingStock - totalDistribution).toLocaleString()} kg)
                      </span>
                    )}
                  </span>
                </div>

                {distributionAllocations.map((allocation, index) => {
                  const usedIds = distributionAllocations
                    .filter((_, rowIndex) => rowIndex !== index)
                    .map((row) => String(row.locationId));
                  return (
                    <div key={index} className="flex gap-2">
                      <select
                        required
                        value={allocation.locationId}
                        onChange={(e) =>
                          setDistributionAllocations((rows) =>
                            rows.map((row, i) => (i === index ? { ...row, locationId: e.target.value } : row)),
                          )
                        }
                        className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      >
                        <option value="">-- Chọn cửa hàng tiếp nhận --</option>
                        {locations
                          .filter((loc) => (loc.status || "Active").toLowerCase() === "active")
                          .map((location) => (
                            <option
                              key={location.id}
                              value={location.id}
                              disabled={usedIds.includes(String(location.id))}
                            >
                              [{location.code || `CH-${location.id}`}] {location.name}
                              {location.address ? ` — ${location.address}` : ""}
                            </option>
                          ))}
                      </select>
                      <input
                        required
                        type="number"
                        min="0.001"
                        step="any"
                        value={allocation.quantity}
                        onChange={(e) =>
                          setDistributionAllocations((rows) =>
                            rows.map((row, i) => (i === index ? { ...row, quantity: e.target.value } : row)),
                          )
                        }
                        placeholder="Số kg"
                        className="w-28 rounded-xl border border-slate-300 bg-white p-2.5 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                      {distributionAllocations.length > 1 && (
                        <button
                          type="button"
                          aria-label="Xóa dòng"
                          onClick={() => setDistributionAllocations((rows) => rows.filter((_, i) => i !== index))}
                          className="rounded-lg p-2 text-slate-400 hover:text-rose-600 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setDistributionAllocations((rows) => [...rows, { locationId: "", quantity: "" }])}
                  disabled={distributionAllocations.length >= locations.length}
                  className="font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 cursor-pointer pt-1 inline-flex items-center gap-1"
                >
                  <Plus size={14} /> Thêm cửa hàng tiếp nhận
                </button>
              </div>

              {/* Ghi chú */}
              <label className="block font-semibold text-slate-700">
                Ghi chú điều chuyển (tùy chọn)
                <input
                  placeholder="VD: Điều chuyển đợt 1 cho các điểm bán khu vực nội thành"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </label>

              {isOverAllocated && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-medium">
                  Cảnh báo: Tổng khối lượng điều chuyển ({totalDistribution.toLocaleString()} kg) vượt quá tồn kho kho tổng ({remainingStock.toLocaleString()} kg)!
                </p>
              )}

              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                Mỗi cửa hàng sẽ nhận một lô con riêng biệt được ghi nhận vào chuỗi cung ứng. Số lượng chưa điều chuyển vẫn tiếp tục được lưu giữ tại kho tổng.
              </p>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="min-w-[100px] rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={
                    assignSubmitting ||
                    !selectedBatchId ||
                    locations.length === 0 ||
                    distributionAllocations.some((row) => !row.locationId || !(Number(row.quantity) > 0)) ||
                    new Set(distributionAllocations.map((row) => row.locationId)).size !== distributionAllocations.length ||
                    isOverAllocated
                  }
                  className="min-w-[160px] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition cursor-pointer"
                >
                  {assignSubmitting ? "Đang điều chuyển..." : "Xác nhận điều chuyển"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal kết quả chi tiết sau khi điều chuyển thành công */}
      {distributeResultModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 gaussian-backdrop animate-fade-in">
          <div className="animate-modal-in modal-card-glow w-full max-w-2xl rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-xs">
                  <CheckCircle2 size={28} />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                    Điều Chuyển Thành Công (T-65)
                  </span>
                  <h3 className="text-xl font-bold text-slate-900">
                    Đã phân phối lô hàng về cửa hàng nội bộ
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDistributeResultModal((prev) => ({ ...prev, open: false }))}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="mt-5 space-y-4">
              {/* Lô nguồn */}
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  🌱 Lô Nguồn (Kho tổng):
                </span>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {distributeResultModal.parentBatch?.batch_code || "Lô nguồn"}
                  </span>
                  <span className="text-xs text-slate-600">
                    Sản phẩm: <strong className="text-slate-800">{distributeResultModal.parentBatch?.product_name || "Nông sản"}</strong>
                  </span>
                </div>
              </div>

              {/* Danh sách các lô con đã phân phối về cửa hàng */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={14} className="text-emerald-600" />
                    Danh sách {distributeResultModal.children?.length || 0} Lô con mới tại cửa hàng:
                  </span>
                  <span className="text-xs text-slate-500">
                    Tổng xuất:{" "}
                    <strong className="text-slate-800">
                      {distributeResultModal.children
                        ?.reduce((s, c) => s + Number(c.initial_quantity || c.remaining_quantity || 0), 0)
                        .toLocaleString()}{" "}
                      kg
                    </strong>
                  </span>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                  {distributeResultModal.children?.map((child, idx) => (
                    <div
                      key={child.id || idx}
                      className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/40 via-white to-slate-50 p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xs">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {child.batch_code}
                            </span>
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                              Lô con mới
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            <span>
                              Khối lượng:{" "}
                              <strong className="text-slate-800">
                                {Number(child.initial_quantity || child.remaining_quantity).toLocaleString()} kg
                              </strong>
                            </span>
                            <span>
                              Cửa hàng nhận:{" "}
                              <strong className="text-emerald-700">
                                {child.current_location || child.location?.name || "Cửa hàng chi nhánh"}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        Đã ghi nhận tồn kho
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDistributeResultModal((prev) => ({ ...prev, open: false }))}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-sm cursor-pointer"
              >
                Đã hiểu & Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Chi tiết Lệnh Điều Chuyển & Audit Trail (T-65) */}
      {detailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 gaussian-backdrop animate-fade-in">
          <div className="animate-modal-in modal-card-glow w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Chi tiết Lệnh Điều Chuyển Nội Bộ
                  </h3>
                  <span className="font-mono text-xs text-emerald-700 font-semibold">
                    {selectedTransferDetail?.transfer_code || "Đang tải..."}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {detailLoading ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Đang tải thông tin chi tiết và bằng chứng toàn vẹn...
              </div>
            ) : selectedTransferDetail ? (
              <div className="mt-4 space-y-4 text-xs">
                {/* Thông tin lệnh */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                  <div>
                    <span className="text-[11px] text-slate-500 block">Thời gian thực hiện:</span>
                    <strong className="text-slate-800 font-mono">
                      {selectedTransferDetail.created_at
                        ? new Date(selectedTransferDetail.created_at).toLocaleString("vi-VN")
                        : "--"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Người phụ trách điều chuyển:</span>
                    <strong className="text-slate-800">
                      {selectedTransferDetail.actor_name || "Quản trị viên NPP"} (
                      {selectedTransferDetail.actor_email || "NPP"})
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Khối lượng điều chuyển:</span>
                    <strong className="text-emerald-700 font-mono text-sm">
                      {Number(selectedTransferDetail.quantity).toLocaleString()}{" "}
                      {selectedTransferDetail.product_unit || "kg"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Sản phẩm:</span>
                    <strong className="text-slate-800">
                      {selectedTransferDetail.product_name || "Nông sản"}
                    </strong>
                  </div>
                </div>

                {/* Phả hệ chuyển giao */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                    <span className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                      📤 Lô Nguồn (Kho tổng)
                    </span>
                    <div className="font-mono font-bold text-slate-900 text-sm">
                      {selectedTransferDetail.source_batch_code}
                    </div>
                    <div className="text-slate-500 text-[11px] mt-1">Kho trung tâm Nhà phân phối</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3.5">
                    <span className="text-[11px] font-bold uppercase text-emerald-700 block mb-1">
                      📥 Lô Đích (Cửa hàng nhận)
                    </span>
                    <div className="font-mono font-bold text-emerald-800 text-sm">
                      {selectedTransferDetail.target_batch_code || "(Lô con mới)"}
                    </div>
                    <div className="text-slate-700 font-semibold text-[11px] mt-1">
                      {selectedTransferDetail.location_name} [{selectedTransferDetail.location_code}]
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      {selectedTransferDetail.location_address}
                    </div>
                  </div>
                </div>

                {/* Ghi chú */}
                {selectedTransferDetail.note && (
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/80">
                    <span className="text-[11px] font-semibold text-slate-500 block">Ghi chú:</span>
                    <p className="text-slate-700 italic mt-0.5">{selectedTransferDetail.note}</p>
                  </div>
                )}

                {/* Audit Trail & Hash Chaining */}
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-2">
                    <Hash size={14} className="text-emerald-600" />
                    <span>Lịch sử Hash Chain & Bằng chứng Toàn vẹn (SHA-256)</span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedTransferDetail.events?.length === 0 ? (
                      <div className="text-slate-400 italic">Chưa có bản ghi hash chain.</div>
                    ) : (
                      selectedTransferDetail.events?.map((e) => (
                        <div
                          key={e.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 font-mono text-[10px]"
                        >
                          <div className="flex items-center justify-between text-slate-500">
                            <span className="font-bold text-emerald-700 uppercase">
                              {e.event_type}
                            </span>
                            <span>{new Date(e.timestamp).toLocaleString("vi-VN")}</span>
                          </div>
                          <div className="mt-1 truncate text-slate-600" title={e.current_hash}>
                            <strong>Current Hash:</strong> {e.current_hash}
                          </div>
                          <div className="truncate text-slate-400" title={e.previous_hash}>
                            <strong>Previous Hash:</strong> {e.previous_hash || "0 (Genesis)"}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-900 transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
