import { useState, useEffect } from "react";
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Boxes,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { api } from "../api.js";

export default function LocationsView({ batches = [], onBatchUpdated }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Location Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: "", address: "" });
  const [submitting, setSubmitting] = useState(false);

  // Assign Location Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const data = await api.getLocations();
      setLocations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

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
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      if (editingId) {
        await api.updateLocation(editingId, formData);
        setSuccess("Cập nhật địa điểm thành công.");
      } else {
        await api.createLocation(formData);
        setSuccess("Thêm mới địa điểm thành công.");
      }
      setIsFormOpen(false);
      await fetchLocations();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa địa điểm "${name}"?`)) return;
    setError("");
    setSuccess("");
    try {
      await api.deleteLocation(id);
      setSuccess(`Đã xóa địa điểm "${name}".`);
      await fetchLocations();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssignLocation = async (e) => {
    e.preventDefault();
    if (!selectedBatchId || !selectedLocationId) return;
    setAssignSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const result = await api.assignBatchLocation(Number(selectedBatchId), {
        locationId: Number(selectedLocationId),
      });
      setSuccess(`Đã điều chuyển lô hàng về "${result.location.name}". Sự kiện đã được ký băm vào chuỗi hash.`);
      setAssignModalOpen(false);
      if (onBatchUpdated) onBatchUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setAssignSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <MapPin size={18} />
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              Quản lý Địa điểm / Cửa hàng Nội bộ (S-30)
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Khai báo các chi nhánh, cửa hàng, kho bãi nội bộ và điều chuyển lô hàng trực tiếp không qua quy trình 2 bên.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAssignModalOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
          >
            <Boxes size={16} />
            <span>Điều chuyển lô về cửa hàng</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
          >
            <Plus size={16} />
            <span>Thêm địa điểm mới</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800">
          <AlertCircle size={16} className="shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-800">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* Locations Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-200/80 bg-slate-50/60 px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-slate-800 text-sm">
            Danh sách Điểm bán & Kho hàng ({locations.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">ID</th>
                <th className="px-6 py-3.5">Tên địa điểm / Cửa hàng</th>
                <th className="px-6 py-3.5">Địa chỉ</th>
                <th className="px-6 py-3.5">Ngày tạo</th>
                <th className="px-6 py-3.5 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    Đang tải danh sách địa điểm...
                  </td>
                </tr>
              ) : locations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">
                    Chưa có địa điểm nào được khai báo. Hãy bấm "Thêm địa điểm mới".
                  </td>
                </tr>
              ) : (
                locations.map((loc) => (
                  <tr key={loc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-slate-500">#{loc.id}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{loc.name}</td>
                    <td className="px-6 py-4 text-slate-600">{loc.address || "Chưa có địa chỉ"}</td>
                    <td className="px-6 py-4 text-slate-500">{new Date(loc.created_at).toLocaleDateString("vi-VN")}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(loc)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-700 transition"
                          title="Chỉnh sửa"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(loc.id, loc.name)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
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

      {/* Modal: Thêm / Sửa Địa điểm */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                {editingId ? "Cập nhật Địa điểm" : "Thêm Địa điểm mới"}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tên địa điểm / Cửa hàng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Cửa hàng Cầu Giấy, Kho Lạnh Hoàng Mai"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Địa chỉ chi tiết
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: 123 Đường Xuân Thủy, Cầu Giấy, Hà Nội"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {submitting ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Tạo địa điểm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Điều chuyển Lô về Địa điểm */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                Điều chuyển nội bộ về Cửa hàng (S-30)
              </h3>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAssignLocation} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Chọn Lô hàng cần điều chuyển <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Chọn lô hàng --</option>
                  {batches
                    .filter((b) => Number(b.remaining_quantity) > 0 && b.status !== "consumed")
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_code} ({b.product_name} - Còn {Number(b.remaining_quantity).toLocaleString()} kg)
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Chọn Cửa hàng / Điểm bán đến <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Chọn địa điểm đến --</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} {loc.address ? `(${loc.address})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500 border border-slate-200/80">
                Lưu ý: Vì đây là điều chuyển nội bộ trong cùng tổ chức nên không cần quy trình xác nhận 2 bên. Sự kiện <code>LOCATION_ASSIGNED</code> sẽ được ghi tiếp vào chuỗi Hash của lô hàng.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={assignSubmitting || !selectedBatchId || !selectedLocationId}
                  className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {assignSubmitting ? "Đang xử lý..." : "Xác nhận chuyển lô"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
