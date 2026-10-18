import { useState, useEffect } from "react";
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Boxes,
  X,
} from "lucide-react";
import { api } from "../api.js";
import { useToast } from "../context/ToastContext.jsx";

export default function LocationsView({
  batches = [],
  onBatchUpdated,
  activeBatchId = null,
  _user = null,
}) {
  const toast = useToast();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Location Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: "", address: "" });
  const [submitting, setSubmitting] = useState(false);

  // Assign Location Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(
    activeBatchId ? String(activeBatchId) : "",
  );
  const [distributionAllocations, setDistributionAllocations] = useState([
    { locationId: "", quantity: "" },
    { locationId: "", quantity: "" },
  ]);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const selectedBatch = batches.find((batch) => String(batch.id) === selectedBatchId);
  const totalDistribution = distributionAllocations.reduce(
    (total, allocation) => total + (Number(allocation.quantity) || 0),
    0,
  );

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const data = await api.getLocations();
      setLocations(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (activeBatchId) {
      setSelectedBatchId(String(activeBatchId));
      setAssignModalOpen(true);
    }
  }, [activeBatchId]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ name: "", address: "" });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (loc) => {
    setEditingId(loc.id);
    setFormData({ name: loc.name, address: loc.address || "" });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await api.updateLocation(editingId, formData);
        toast.success("Cập nhật địa điểm thành công.");
      } else {
        await api.createLocation(formData);
        toast.success("Thêm mới địa điểm thành công.");
      }
      setIsFormOpen(false);
      await fetchLocations();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa địa điểm "${name}"?`)) return;
    try {
      await api.deleteLocation(id);
      toast.success(`Đã xóa địa điểm "${name}".`);
      await fetchLocations();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAssignLocation = async (e) => {
    e.preventDefault();
    if (!selectedBatchId || distributionAllocations.length < 2) return;
    setAssignSubmitting(true);
    try {
      const allocations = distributionAllocations.map((allocation) => ({
        locationId: Number(allocation.locationId),
        quantity: Number(allocation.quantity),
      }));
      const result = await api.distributeBatchToStores(Number(selectedBatchId), allocations);
      toast.success(result.message || `Đã chia lô cho ${allocations.length} cửa hàng.`);
      setAssignModalOpen(false);
      setSelectedBatchId("");
      setDistributionAllocations([
        { locationId: "", quantity: "" },
        { locationId: "", quantity: "" },
      ]);
      if (onBatchUpdated) onBatchUpdated();
      await fetchLocations();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAssignSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-xs">
              <MapPin size={18} />
            </span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Quản lý Địa điểm & Cửa hàng Nội bộ
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Khai báo các chi nhánh, cửa hàng bán lẻ và chia tách lô hàng về từng điểm bán nội bộ (S-30).
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setAssignModalOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 transition hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer shadow-xs active:scale-95"
          >
            <Boxes size={16} />
            <span>Chia lô về từng cửa hàng (S-30)</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 cursor-pointer active:scale-95"
          >
            <Plus size={16} />
            <span>Thêm địa điểm mới</span>
          </button>
        </div>
      </div>

      {/* Locations Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
            Danh sách Điểm bán & Kho hàng ({locations.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">ID</th>
                <th className="px-6 py-3.5">Tên địa điểm / Cửa hàng</th>
                <th className="px-6 py-3.5">Địa chỉ</th>
                <th className="px-6 py-3.5">Tồn kho tại điểm</th>
                <th className="px-6 py-3.5">Ngày tạo</th>
                <th className="px-6 py-3.5 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    Đang tải danh sách địa điểm...
                  </td>
                </tr>
              ) : locations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic">
                    Chưa có địa điểm nào được khai báo. Hãy bấm &quot;Thêm địa điểm mới&quot;.
                  </td>
                </tr>
              ) : (
                locations.map((loc, idx) => (
                  <tr
                    key={loc.id}
                    className={`transition-colors ${
                      idx % 2 === 0
                        ? "bg-white dark:bg-slate-900"
                        : "bg-slate-50/50 dark:bg-slate-900/50"
                    } hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20`}
                  >
                    <td className="px-6 py-4 font-mono font-bold text-slate-500 dark:text-slate-400">#{loc.id}</td>
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{loc.name}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{loc.address || "Chưa có địa chỉ"}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-lg bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          {loc.batch_count || 0} lô
                        </span>
                        <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">
                          {Number(loc.total_inventory || 0).toLocaleString()} kg
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono">
                      {new Date(loc.created_at).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(loc)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-700 dark:hover:text-emerald-400 transition cursor-pointer"
                          title="Chỉnh sửa"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(loc.id, loc.name)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                          title="Xóa"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create or edit an internal location modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 gaussian-backdrop animate-fade-in">
          <div className="animate-modal-in modal-card-glow w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingId ? "Cập nhật cửa hàng" : "Thêm cửa hàng mới"}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                Tên cửa hàng *
                <input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 font-normal text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </label>
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                Địa chỉ
                <input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 font-normal text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </label>
              <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="min-w-[110px] rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-w-[160px] rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-7 py-3 text-sm sm:text-base font-bold text-white shadow-lg shadow-emerald-700/25 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition cursor-pointer"
                >
                  {submitting ? "Đang lưu..." : "Lưu cửa hàng"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Split a batch between the distributor's own stores modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 gaussian-backdrop animate-fade-in">
          <div className="animate-modal-in modal-card-glow w-full max-w-3xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                  <Boxes size={16} />
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Chia lô về từng cửa hàng nội bộ (S-30)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {locations.length < 2 && (
              <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200">
                <p className="font-semibold">Cần có ít nhất 2 cửa hàng để chia lô.</p>
                <p className="mt-1 text-[11px] opacity-90">
                  Vui lòng thêm ít nhất 2 cửa hàng trước khi thực hiện thao tác chia lô.
                </p>
              </div>
            )}
            <form onSubmit={handleAssignLocation} className="mt-4 space-y-4 text-xs">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                Lô nguồn *
                <select
                  required
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 font-normal text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="">-- Chọn lô hàng --</option>
                  {batches
                    .filter((batch) => Number(batch.remaining_quantity) > 0 && batch.status !== "consumed")
                    .map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.batch_code} ({batch.product_name} — còn {Number(batch.remaining_quantity).toLocaleString()} kg)
                      </option>
                    ))}
                </select>
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Phân bổ số lượng đến cửa hàng *
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono">
                    {totalDistribution.toLocaleString()} / {Number(selectedBatch?.remaining_quantity || 0).toLocaleString()} kg
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
                        className="min-w-0 flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 text-slate-900 dark:text-white"
                      >
                        <option value="">-- Chọn cửa hàng --</option>
                        {locations.map((location) => (
                          <option key={location.id} value={location.id} disabled={usedIds.includes(String(location.id))}>
                            {location.name}
                            {location.address ? ` (${location.address})` : ""}
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
                        className="w-24 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 text-slate-900 dark:text-white font-mono"
                      />
                      {distributionAllocations.length > 2 && (
                        <button
                          type="button"
                          aria-label="Xóa phân bổ"
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
                  className="font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  + Thêm cửa hàng
                </button>
              </div>

              <p className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-[11px] text-slate-600 dark:text-slate-400">
                Mỗi cửa hàng nhận một lô con riêng. Tổng phân bổ không vượt khối lượng còn lại; phần chưa phân bổ vẫn ở lô nguồn.
              </p>

              <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="min-w-[110px] rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={
                    assignSubmitting ||
                    !selectedBatchId ||
                    locations.length < 2 ||
                    distributionAllocations.some((row) => !row.locationId || !(Number(row.quantity) > 0)) ||
                    new Set(distributionAllocations.map((row) => row.locationId)).size !== distributionAllocations.length ||
                    totalDistribution > Number(selectedBatch?.remaining_quantity || 0)
                  }
                  className="min-w-[180px] rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-7 py-3 text-sm sm:text-base font-bold text-white shadow-lg shadow-emerald-700/25 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition cursor-pointer"
                >
                  {assignSubmitting ? "Đang chia lô..." : "Xác nhận chia lô"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
