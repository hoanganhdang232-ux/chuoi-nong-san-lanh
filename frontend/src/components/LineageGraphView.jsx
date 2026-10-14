import { useState, useEffect, useCallback } from "react";
import {
  GitBranch,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MapPin,
  Building2,
  CheckCircle2,
  Search,
  Loader2,
  X,
  Info,
} from "lucide-react";
import { api } from "../api.js";

export default function LineageGraphView({
  batchId,
  batchCode,
  graphData: initialGraphData,
  descendantsData: initialDescendantsData,
  currentBatch: initialCurrentBatch,
  onSelectBatch,
}) {
  const [activeTab, setActiveTab] = useState("graph"); // "graph" | "table"
  const [expandedNodes, setExpandedNodes] = useState({});
  const [tableSearch, setTableSearch] = useState("");

  // Remote data states when batchId is passed
  const [graphData, setGraphData] = useState(initialGraphData || null);
  const [descendantsData, setDescendantsData] = useState(
    initialDescendantsData || null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Quick detail modal inside graph
  const [inspectBatch, setInspectBatch] = useState(null);

  const fetchLineage = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [graphRes, descRes] = await Promise.all([
        api.getBatchLineageGraph(id),
        api.getBatchDescendants(id),
      ]);
      setGraphData(graphRes);
      setDescendantsData(descRes);
    } catch (err) {
      setError(err.message || "Không thể tải cây phả hệ.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (batchId) {
      fetchLineage(batchId);
    } else if (initialGraphData) {
      setGraphData(initialGraphData);
      setDescendantsData(initialDescendantsData);
    }
  }, [batchId, initialGraphData, initialDescendantsData, fetchLineage]);

  if (loading) {
    return (
      <div className="flex min-h-[350px] flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-slate-500">
        <Loader2 size={36} className="animate-spin text-emerald-600 mb-3" />
        <p className="text-sm font-semibold text-slate-700">
          Đang truy vết đồ thị phả hệ BFS...
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Quét toàn bộ quan hệ tổ tiên & hậu duệ qua các tầng tách/gộp (S-26, S-28)
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <div className="flex items-center gap-2 font-bold text-sm">
          <AlertTriangle size={18} className="text-rose-600" />
          <span>Lỗi tải sơ đồ phả hệ</span>
        </div>
        <p className="mt-2 text-xs">{error}</p>
      </div>
    );
  }

  if (!graphData && !descendantsData) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-slate-400">
        <GitBranch className="mx-auto mb-2 opacity-40 text-slate-400" size={36} />
        <p className="text-sm">Vui lòng chọn một lô hàng để xem cây phả hệ & hậu duệ.</p>
      </div>
    );
  }

  const nodes = graphData?.nodes || [];
  const edges = graphData?.edges || [];
  const cycleDetected =
    graphData?.cycleDetected || descendantsData?.cycle_detected;

  const ancestors = nodes.filter(
    (n) => n.position === "left" || n.type === "ancestor"
  );
  const centerNode = nodes.find(
    (n) => n.position === "center" || n.type === "current"
  ) || {
    label: batchCode || initialCurrentBatch?.batch_code || "Lô hiện tại",
    data: {
      batch_code: batchCode || initialCurrentBatch?.batch_code,
      organization_name: initialCurrentBatch?.organization_name,
      location_name:
        initialCurrentBatch?.current_location ||
        initialCurrentBatch?.location_name,
      remaining_quantity: initialCurrentBatch?.remaining_quantity,
      display_status:
        Number(initialCurrentBatch?.remaining_quantity) === 0
          ? "Đã tiêu thụ"
          : initialCurrentBatch?.status,
    },
  };
  const descendants = nodes.filter(
    (n) => n.position === "right" || n.type === "descendant"
  );

  const toggleExpand = (nodeId) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const handleNodeClick = (node) => {
    setInspectBatch(node.data || node);
  };

  const filteredDescendants = (descendantsData?.descendants || []).filter(
    (d) => {
      if (!tableSearch) return true;
      const q = tableSearch.toLowerCase();
      return (
        (d.batch_code || d.code || "").toLowerCase().includes(q) ||
        (d.organization_name || "").toLowerCase().includes(q) ||
        (d.location_name || "").toLowerCase().includes(q)
      );
    }
  );

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-slate-50/70 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
              <GitBranch size={16} />
            </span>
            <h3 className="font-bold text-slate-900 text-lg">
              Sơ đồ Phả hệ Cây & Đồ thị Hậu duệ (S-28, T-60, T-61)
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Duyệt đồ thị xuôi BFS & cấu trúc phả hệ đa tầng, chống lặp vô hạn.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center rounded-xl bg-slate-200/70 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("graph")}
            className={`rounded-lg px-3 py-1.5 transition ${
              activeTab === "graph"
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Sơ đồ Cây 3 Cột (Tree Graph)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("table")}
            className={`rounded-lg px-3 py-1.5 transition ${
              activeTab === "table"
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Danh sách Hậu duệ (
            {descendantsData?.descendants?.length ?? descendants.length})
          </button>
        </div>
      </div>

      {/* Cycle Detection Warning Banner */}
      {cycleDetected && (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-rose-800 flex items-center gap-3">
          <AlertTriangle className="shrink-0 text-rose-600" size={20} />
          <div className="text-xs">
            <span className="font-bold">Cảnh báo Chu trình (Cycle Detected):</span>{" "}
            Hệ thống phát hiện chu trình phân nhánh trong dữ liệu phả hệ. Thuật
            toán đã tự động ngắt để bảo vệ an toàn và ngăn lặp vô tận.
          </div>
        </div>
      )}

      {/* GRAPH TAB */}
      {activeTab === "graph" && (
        <div className="p-6 overflow-x-auto">
          {/* Summary bar */}
          <div className="mb-6 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-500" />
              <span>
                Tổ tiên (Ancestors): <strong>{ancestors.length}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              <span>
                Lô trọng tâm: <strong>{centerNode.label}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              <span>
                Hậu duệ (Descendants): <strong>{descendants.length}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span>
                Quan hệ nhánh (Edges): <strong>{edges.length}</strong>
              </span>
            </div>
          </div>

          {/* 3-Column Tree Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start min-w-[750px]">
            {/* Cột Trái: Tổ tiên (Ancestors) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">
                  ← Tổ tiên ({ancestors.length})
                </span>
                <span className="text-[11px] text-slate-400">Nguồn gốc</span>
              </div>

              {ancestors.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                  Đây là lô thu hoạch gốc (Không có tổ tiên).
                </div>
              ) : (
                ancestors.map((node) => (
                  <div
                    key={node.id}
                    onClick={() => handleNodeClick(node)}
                    className="group relative cursor-pointer rounded-xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50/50 to-white p-3.5 shadow-xs transition hover:border-cyan-400 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-900 group-hover:underline">
                        {node.label}
                      </span>
                      <span className="rounded-md bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
                        Tổ tiên
                      </span>
                    </div>

                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5 truncate">
                        <Building2 size={13} className="text-slate-400 shrink-0" />
                        <span className="truncate">
                          {node.data?.organization_name || "Chưa rõ tổ chức"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1 text-[11px] font-medium text-slate-500">
                        <span>
                          Còn lại:{" "}
                          {Number(
                            node.data?.remaining_quantity || 0
                          ).toLocaleString()}{" "}
                          kg
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            Number(node.data?.remaining_quantity) === 0
                              ? "bg-slate-100 text-slate-500"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {node.data?.display_status || "ACTIVE"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cột Giữa: Lô hiện tại (Center) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-300 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  ● Lô đang xem (Center)
                </span>
                <span className="text-[11px] font-bold text-emerald-700">
                  Tâm đồ thị
                </span>
              </div>

              <div
                onClick={() => handleNodeClick(centerNode)}
                className="cursor-pointer rounded-2xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/50 p-4 shadow-md ring-4 ring-emerald-100 hover:ring-emerald-200 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-black text-emerald-950">
                    {centerNode.label}
                  </span>
                  <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs">
                    Hiện tại
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-slate-700">
                  <div className="flex items-center gap-1.5">
                    <Building2
                      size={14}
                      className="text-emerald-700 shrink-0"
                    />
                    <span className="font-semibold text-slate-900">
                      {centerNode.data?.organization_name || "Tổ chức sở hữu"}
                    </span>
                  </div>
                  {centerNode.data?.location_name && (
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <MapPin
                        size={14}
                        className="text-emerald-600 shrink-0"
                      />
                      <span>{centerNode.data.location_name}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between font-medium">
                    <span>Khối lượng còn:</span>
                    <span className="font-mono font-bold text-emerald-800 text-sm">
                      {Number(
                        centerNode.data?.remaining_quantity || 0
                      ).toLocaleString()}{" "}
                      kg
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Trạng thái:</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        Number(centerNode.data?.remaining_quantity) === 0 ||
                        centerNode.data?.status === "consumed"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {centerNode.data?.display_status ||
                        centerNode.data?.status ||
                        "ACTIVE"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cột Phải: Hậu duệ (Descendants) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                  Hậu duệ ({descendants.length}) →
                </span>
                <span className="text-[11px] text-slate-400">
                  Các tầng tách/gộp
                </span>
              </div>

              {descendants.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                  Chưa phát sinh lô con hoặc hậu duệ nào.
                </div>
              ) : (
                descendants.map((node) => {
                  const isExpanded = expandedNodes[node.id];
                  const isConsumed =
                    Number(node.data?.remaining_quantity) === 0 ||
                    String(node.data?.status).toLowerCase() === "consumed";

                  return (
                    <div
                      key={node.id}
                      className="group relative rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 to-white p-3.5 shadow-xs transition hover:border-indigo-400 hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleNodeClick(node)}
                          className="font-mono text-xs font-bold text-indigo-900 group-hover:underline text-left"
                          title="Bấm để mở chi tiết lô này"
                        >
                          {node.label}
                        </button>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            isConsumed
                              ? "bg-purple-100 text-purple-800"
                              : "bg-indigo-100 text-indigo-800"
                          }`}
                        >
                          {isConsumed ? "Đã tiêu thụ" : "Hậu duệ"}
                        </span>
                      </div>

                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5 truncate">
                          <Building2
                            size={13}
                            className="text-slate-400 shrink-0"
                          />
                          <span className="truncate">
                            {node.data?.organization_name || "Chưa rõ tổ chức"}
                          </span>
                        </div>
                        {node.data?.location_name && (
                          <div className="flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                            <MapPin
                              size={12}
                              className="text-slate-400 shrink-0"
                            />
                            <span className="truncate">
                              {node.data.location_name}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1 text-[11px] font-medium text-slate-500">
                          <span>
                            Còn lại:{" "}
                            {Number(
                              node.data?.remaining_quantity || 0
                            ).toLocaleString()}{" "}
                            kg
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              isConsumed
                                ? "bg-purple-50 text-purple-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {node.data?.display_status || node.data?.status}
                          </span>
                        </div>
                      </div>

                      {/* T-61: Thu gọn / mở rộng nhánh */}
                      {node.data?.has_children && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(node.id)}
                          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200/80 bg-white/70 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                        >
                          {isExpanded ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                          <span>
                            {isExpanded
                              ? "Thu gọn nhánh con"
                              : "Mở rộng nhánh con"}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TABLE TAB (S-26/S-27 Forward BFS Detailed Table) */}
      {activeTab === "table" && (
        <div className="p-6">
          <div className="mb-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search
                className="absolute left-3 top-2.5 text-slate-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Tìm mã lô, tổ chức, điểm bán..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="text-xs text-slate-500">
              Tổng số hậu duệ: <strong>{filteredDescendants.length}</strong> lô
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-100/80 text-slate-700 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Mã Lô (Code)</th>
                  <th className="px-4 py-3">Tổ chức đang giữ</th>
                  <th className="px-4 py-3">Địa điểm / Cửa hàng</th>
                  <th className="px-4 py-3 text-right">Khối lượng còn</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredDescendants.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-slate-400 italic"
                    >
                      Không tìm thấy hậu duệ phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredDescendants.map((batch) => {
                    const isConsumed =
                      Number(batch.remaining_quantity) === 0 ||
                      String(batch.status).toLowerCase() === "consumed";

                    return (
                      <tr
                        key={batch.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          {batch.batch_code || batch.code}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {batch.organization_name || "N/A"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <span className="flex items-center gap-1">
                            <MapPin size={12} className="text-slate-400" />
                            {batch.location_name ||
                              batch.current_location ||
                              "Chưa gán"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                          {Number(
                            batch.remaining_quantity || 0
                          ).toLocaleString()}{" "}
                          kg
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              isConsumed
                                ? "bg-purple-100 text-purple-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {isConsumed ? <CheckCircle2 size={11} /> : null}
                            {batch.display_status ||
                              (isConsumed ? "Đã tiêu thụ" : batch.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleNodeClick({ data: batch })}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-emerald-600 hover:text-white transition"
                          >
                            Chi tiết
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* T-61: Modal chi tiết lô khi bấm vào node */}
      {inspectBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/10">
            <button
              type="button"
              onClick={() => setInspectBatch(null)}
              className="absolute right-4 top-4 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <Info size={20} className="text-emerald-600" />
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  Chi tiết Lô hàng
                </h4>
                <p className="font-mono text-xs text-slate-500">
                  {inspectBatch.batch_code || inspectBatch.code || inspectBatch.label}
                </p>
              </div>
            </div>

            <dl className="mt-4 space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <dt className="text-slate-500">Tổ chức quản lý:</dt>
                <dd className="font-semibold text-slate-800">
                  {inspectBatch.organization_name || "Chưa rõ"}
                </dd>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <dt className="text-slate-500">Vị trí / Cửa hàng:</dt>
                <dd className="font-medium text-slate-800">
                  {inspectBatch.location_name ||
                    inspectBatch.current_location ||
                    "Chưa gán địa điểm"}
                </dd>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <dt className="text-slate-500">Khối lượng còn lại:</dt>
                <dd className="font-mono font-bold text-emerald-700">
                  {Number(inspectBatch.remaining_quantity || 0).toLocaleString()}{" "}
                  kg
                </dd>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <dt className="text-slate-500">Trạng thái:</dt>
                <dd className="font-semibold text-slate-800">
                  {Number(inspectBatch.remaining_quantity) === 0
                    ? "Đã tiêu thụ (CONSUMED)"
                    : inspectBatch.display_status || inspectBatch.status || "ACTIVE"}
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex items-center justify-end gap-2">
              {onSelectBatch && inspectBatch.id && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectBatch(Number(inspectBatch.id));
                    setInspectBatch(null);
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                >
                  Chọn lô này trên Dashboard
                </button>
              )}
              <button
                type="button"
                onClick={() => setInspectBatch(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
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
