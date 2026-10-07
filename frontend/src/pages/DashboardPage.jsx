import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Box,
  CheckCircle2,
  Droplets,
  Download,
  ExternalLink,
  MapPin,
  Plus,
  ShieldCheck,
  Siren,
  Thermometer,
  Warehouse,
} from "lucide-react";
import Sidebar from "../components/Sidebar.jsx";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

const statusColors = {
  registered: "bg-slate-100 text-slate-700",
  pending_confirmation: "bg-amber-100 text-amber-700",
  processed: "bg-blue-100 text-blue-700",
  in_transit: "bg-amber-100 text-amber-700",
  delivered: "bg-emerald-100 text-emerald-700",
  recalled: "bg-rose-100 text-rose-700",
};

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
  const [transferForm, setTransferForm] = useState({
    batchId: "",
    toOrganizationId: "",
    note: "",
  });
  const [submission, setSubmission] = useState({ message: "", tone: "" });
  const [recallForm, setRecallForm] = useState({ batchId: "", reason: "" });

  const loadData = async () => {
    const [dashboardData, batchData, transferData] = await Promise.all([
      api.getDashboard(),
      api.getBatches(),
      api.getTransferRequests(),
    ]);
    setDashboard(dashboardData);
    setBatches(batchData);
    setTransferRequests(transferData);
    setSelectedBatch(batchData[0] || null);
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

  const handleSelectBatch = async (batchId) => {
    const batch = filteredBatches.find((item) => item.id === batchId);
    if (!batch) return;
    setSelectedBatch(batch);
  };

  const handleLandPlotSubmit = async (event) => {
    event.preventDefault();
    setSubmission({ message: "", tone: "" });
    try {
      await api.createLandPlot(landPlotForm);
      setLandPlotForm({ name: "", areaHa: "", latitude: "", longitude: "" });
      const nextPlots = await api.getLandPlots();
      setLandPlots(nextPlots);
      setSubmission({ message: "Đã khai báo thửa đất mới.", tone: "success" });
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

  const handleTransferDecision = async (transferId, decision) => {
    try {
      await api.decideTransfer(transferId, {
        decision,
        reason: decision === "rejected" ? "Không đạt tiêu chuẩn." : "",
      });
      await loadData();
      setSubmission({
        message:
          decision === "confirmed"
            ? "Đã xác nhận bàn giao."
            : "Đã từ chối bàn giao.",
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
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Đang tải dashboard...
      </div>
    );
  if (error)
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center text-rose-600">
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
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-600">
              Agritrace Dashboard
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              {user?.organizationName}
            </h1>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <ShieldCheck className="text-emerald-600" size={18} /> Event lock
              integrity:{" "}
              <span className="font-semibold text-emerald-700">Verified</span>
            </div>
          </div>
        </header>

        {selectedView === "Tổng quan" && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map(({ label, value, icon: Icon, tone }) => (
                <div
                  key={label}
                  className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">{label}</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">
                        {value}
                      </p>
                    </div>
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}
                    >
                      <Icon size={20} />
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">
                    Lô hàng gần nhất
                  </h2>
                  <span className="text-xs text-slate-500">
                    {filteredBatches.length} lô
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="pb-3">Mã lô</th>
                        <th className="pb-3">Sản phẩm</th>
                        <th className="pb-3">Trạng thái</th>
                        <th className="pb-3">Khối lượng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBatches.slice(0, 5).map((batch) => (
                        <tr
                          key={batch.id}
                          className="border-t border-slate-100 hover:bg-slate-50"
                        >
                          <td className="py-3 font-semibold text-slate-800">
                            <button
                              onClick={() => handleSelectBatch(batch.id)}
                              className="text-left hover:text-emerald-600"
                            >
                              {batch.batch_code}
                            </button>
                          </td>
                          <td className="py-3 text-slate-600">
                            {batch.product_name}
                          </td>
                          <td className="py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[batch.status] || statusColors.registered}`}
                            >
                              {batch.status}
                            </span>
                          </td>
                          <td className="py-3 text-slate-600">
                            {Number(batch.remaining_quantity).toLocaleString()}{" "}
                            kg
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-lg font-bold text-slate-900">
                  Giám sát chuỗi lạnh
                </h2>
                <div className="mt-5 space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="text-emerald-600" size={18} />
                      <span className="font-medium text-slate-700">
                        Nhiệt độ hiện tại
                      </span>
                    </div>
                    <span className="font-bold text-emerald-700">
                      {selectedBatch?.temperature_c ?? 9}°C
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-amber-50 p-4">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="text-amber-600" size={18} />
                      <span className="font-medium text-slate-700">
                        Ngưỡng an toàn
                      </span>
                    </div>
                    <span className="font-bold text-amber-700">≥ 2°C</span>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <MapPin size={16} /> Vị trí hiện tại
                    </div>
                    <p className="mt-2 font-semibold text-slate-800">
                      {selectedBatch?.current_location || "Chưa cập nhật"}
                    </p>
                  </div>
                </div>
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

        {transferRequests.length > 0 && (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-slate-900">
              Danh sách bàn giao
            </h2>
            <div className="mt-4 space-y-3">
              {transferRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-semibold text-slate-800">
                      {request.batch_code}
                    </div>
                    <div className="text-sm text-slate-500">
                      Từ {request.from_organization_name} →{" "}
                      {request.to_organization_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      Trạng thái: {request.status}
                    </div>
                  </div>
                  {request.status === "pending" &&
                    [
                      "farm_admin",
                      "processor_admin",
                      "distributor_admin",
                    ].includes(user?.role) &&
                    request.to_organization_id === user?.organizationId && (
                      <div className="flex gap-2">
                        <button
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                          onClick={() =>
                            handleTransferDecision(request.id, "confirmed")
                          }
                        >
                          Xác nhận
                        </button>
                        <button
                          className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
                          onClick={() =>
                            handleTransferDecision(request.id, "rejected")
                          }
                        >
                          Từ chối
                        </button>
                      </div>
                    )}
                </div>
              ))}
            </div>
          </section>
        )}

        {selectedBatch && (
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                Lịch sử sự kiện
              </h2>
              <div className="mt-5 space-y-3">
                {(selectedBatch.events || []).map((event, index) => (
                  <div
                    key={event.id || index}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        {event.event_type}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(event.timestamp).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                      {event.data_json}
                    </pre>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Hash trước: {event.previous_hash}</span>
                      <span>Hash hiện tại: {event.current_hash}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h3 className="font-bold text-slate-900">Thông tin lô</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Mã lô</dt>
                    <dd className="font-semibold text-slate-800">
                      {selectedBatch.batch_code}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Sản phẩm</dt>
                    <dd className="font-semibold text-slate-800">
                      {selectedBatch.product_name}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Tổ chức</dt>
                    <dd className="font-semibold text-slate-800">
                      {selectedBatch.organization_name}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Khối lượng</dt>
                    <dd className="font-semibold text-slate-800">
                      {Number(
                        selectedBatch.remaining_quantity,
                      ).toLocaleString()}{" "}
                      kg
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h3 className="font-bold text-slate-900">Integrity status</h3>
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-700">
                  <ShieldCheck size={18} />{" "}
                  <span className="font-semibold">
                    Lịch sử sự kiện không thể sửa
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  Mỗi event được nối bằng SHA-256. Demo sử dụng
                  previous_hash/current_hash để kiểm tra tính toàn vẹn.
                </p>
                <a
                  href={`/trace/${encodeURIComponent(selectedBatch.batch_code)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                >
                  <ExternalLink size={16} /> Mở trang truy xuất công khai
                </a>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
