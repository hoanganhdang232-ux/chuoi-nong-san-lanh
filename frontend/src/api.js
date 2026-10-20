function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== "undefined" && window.location) {
    const { hostname, protocol, port } = window.location;
    // Nếu frontend được phục vụ trực tiếp từ cổng backend (3001), dùng relative /api
    if (port === "3001") {
      return "/api";
    }
    // Nếu đang chạy dev (Vite port 5173 hoặc tương tự), kết nối tới backend port 3001 trên CÙNG địa chỉ IP/hostname
    if (import.meta.env.DEV || port === "5173") {
      return `${protocol}//${hostname}:3001/api`;
    }
  }
  return "/api";
}

const API_URL = getApiBaseUrl();

async function request(path, options = {}) {
  const token = localStorage.getItem("agritrace_token");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const details = Array.isArray(errorData.errors) ? ` ${errorData.errors.join(" ")}` : "";
    const err = new Error(`${errorData.message || "Yêu cầu không thành công."}${details}`);
    err.field = errorData.field;
    err.data = errorData;
    throw err;
  }

  return response.status === 204 ? null : response.json();
}

export const api = {
  login: (email, password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  getMe: () => request("/auth/me"),
  getDashboard: () => request("/auth/dashboard"),
  getBatches: () => request("/batches"),
  getActivity: (limit = 100) => request(`/batches/activity?limit=${limit}`),
  importBatchesCsv: (csvText) => request("/batches/import-csv", {
    method: "POST",
    body: JSON.stringify({ csvText }),
  }),
  getBatch: (batchId) => request(`/batches/${batchId}`),
  getBatchGenealogy: (batchId) => request(`/batches/${batchId}/genealogy`),
  splitBatch: (batchId, allocations) =>
    request(`/batches/${batchId}/split`, {
      method: "POST",
      body: JSON.stringify({ allocations }),
    }),
  mergeBatches: (batchIds, productId) =>
    request("/batches/merge", {
      method: "POST",
      body: JSON.stringify({ batchIds, productId }),
    }),
  getBatchSummary: (batchId) => request(`/batches/${batchId}/summary`),
  getProducts: () => request("/batches/products"),
  createProduct: (payload) =>
    request("/batches/products", { method: "POST", body: JSON.stringify(payload) }),
  updateProduct: (productId, payload) =>
    request(`/batches/products/${productId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getLandPlots: () => request("/batches/land-plots"),
  createLandPlot: (payload) =>
    request("/batches/land-plots", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateLandPlot: (plotId, payload) =>
    request(`/batches/land-plots/${plotId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  createHarvest: (payload) =>
    request("/batches/harvest", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getTransferRequests: () => request("/batches/transfer-requests"),
  createTransferRequest: (batchId, payload) =>
    request(`/batches/${batchId}/transfer-requests`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  decideTransfer: (transferId, payload) =>
    request(`/batches/transfer-requests/${transferId}/decision`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  v1CreateTransfer: (payload) =>
    request("/v1/transfers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  v1GetPendingTransfers: () => request("/v1/transfers/pending"),
  v1ApproveTransfer: (id, payload = {}) =>
    request(`/v1/transfers/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  v1RejectTransfer: (id, payload) =>
    request(`/v1/transfers/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  v1CancelTransfer: (id, payload = {}) =>
    request(`/v1/transfers/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verifyBatchIntegrity: (batchId) => request(`/batches/${batchId}/integrity`),
  simulateSensor: (batchId, payload = {}) =>
    request(`/features/batches/${batchId}/sensor-simulation`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getTemperatureLogs: (batchId) =>
    request(`/features/batches/${batchId}/temperature-logs`),
  activateRecall: (payload) =>
    request("/features/recalls", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getRecallReports: () => request("/features/recalls"),
  getNotifications: () => request("/features/notifications"),
  getAuditReport: (batchId) => request(`/features/auditor/reports/${batchId}`),
  getPublicTrace: (batchCode) =>
    request(`/features/public/trace/${encodeURIComponent(batchCode)}`),
  // ─── SPRINT 4 APIs ────────────────────────────────────────────────────────
  getDescendants: (batchId) => request(`/v1/batches/${batchId}/descendants`),
  getLineageGraph: (batchId) => request(`/v1/batches/${batchId}/lineage-graph`),
  consumeBatch: (batchId, payload = {}) =>
    request(`/v1/batches/${batchId}/consume`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getLocations: (params = {}) => {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
    );
    const q = new URLSearchParams(query).toString();
    return request(`/v1/locations${q ? "?" + q : ""}`);
  },
  transferBatchToStore: (payload) =>
    request("/v1/batches/transfer", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getInternalTransfers: (params = {}) => {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
    );
    const q = new URLSearchParams(query).toString();
    return request(`/v1/batches/transfers${q ? "?" + q : ""}`);
  },
  distributeBatchToStores: (batchId, allocations) =>
    request("/v1/locations/distribute-batch", {
      method: "POST",
      body: JSON.stringify({ batchId, allocations }),
    }),
  createLocation: (payload) =>
    request("/v1/locations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getLocationById: (id) => request(`/v1/locations/${id}`),
  updateLocation: (id, payload) =>
    request(`/v1/locations/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  toggleLocationStatus: (id, status) =>
    request(`/v1/locations/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(status ? { status } : {}),
    }),
  deleteLocation: (id) =>
    request(`/v1/locations/${id}`, {
      method: "DELETE",
    }),
  getTransferDetail: (id) => request(`/v1/batches/transfers/${id}`),
  assignBatchLocation: (batchId, payload) =>
    request(`/v1/batches/${batchId}/assign-location`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAuditLogs: (params = {}) => {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
    );
    const q = new URLSearchParams(query).toString();
    return request(`/v1/audit-logs${q ? "?" + q : ""}`);
  },
  importProductsCsv: (csvContent) =>
    request("/v1/import/products", {
      method: "POST",
      body: JSON.stringify({ csvContent }),
    }),
  importLandPlotsCsv: (csvContent) =>
    request("/v1/import/land-plots", {
      method: "POST",
      body: JSON.stringify({ csvContent }),
    }),
  // ─── SPRINT 5 APIs: RECALL & NOTIFICATIONS ──────────────────────────────
  createRecallV1: (payload) =>
    request("/v1/recalls", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getRecallsV1: () => request("/v1/recalls"),
  getRecallAffectedBatches: (recallId, params = {}) => {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
    );
    const q = new URLSearchParams(query).toString();
    return request(`/v1/recalls/${recallId}/affected-batches${q ? "?" + q : ""}`);
  },
  quarantineBatch: (batchId, payload) =>
    request(`/v1/batches/${batchId}/quarantine`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  downloadRecallCsv: async (recallId, recallCode) => {
    const token = localStorage.getItem("agritrace_token");
    const response = await fetch(`${API_URL}/v1/recalls/${recallId}/export-csv`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      throw new Error("Không thể tải báo cáo thu hồi dạng CSV.");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Recall_${recallCode || recallId}_Affected_Batches.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  getNotificationsV1: (limit = 50) => request(`/v1/notifications?limit=${limit}`),
  markNotificationRead: (id) =>
    request(`/v1/notifications/${id}/read`, {
      method: "PATCH",
    }),
  markAllNotificationsRead: () =>
    request("/v1/notifications/read-all", {
      method: "POST",
    }),
  // ─── SPRINT 6 COLD CHAIN APIs ──────────────────────────────────────────────
  updateProductColdChainConfig: (productId, payload) =>
    request(`/v1/products/${productId}/cold-chain-config`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getProductColdChainConfig: (productId) =>
    request(`/v1/products/${productId}/cold-chain-config`),
  sendTemperatureTelemetry: (payload) =>
    request("/v1/telemetry/temperature", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getBatchTemperatureHistory: (batchId) =>
    request(`/v1/batches/${batchId}/temperature-history`),
  evaluateColdChain: (batchId) =>
    request(`/v1/batches/${batchId}/evaluate-cold-chain`, {
      method: "POST",
    }),
  archiveColdChainLogs: (daysOld = 30) =>
    request("/v1/cold-chain/maintenance/archive", {
      method: "POST",
      body: JSON.stringify({ daysOld }),
    }),
  getColdChainOverview: () => request("/v1/cold-chain/overview"),
  // ─── SPRINT 7 PUBLIC QR & NOTIFICATION CENTER APIs ─────────────────────────
  generateBatchQr: (batchId) =>
    request(`/v1/batches/${batchId}/qr`, {
      method: "POST",
      body: JSON.stringify({
        clientOrigin: typeof window !== "undefined" ? window.location.origin : null,
      }),
    }),
  getPublicTraceV1: (code, headers = {}) =>
    request(`/v1/public/trace/${encodeURIComponent(code)}`, { headers }),
  verifyHashChain: (code) =>
    request(`/v1/public/verify-chain/${encodeURIComponent(code)}`),
  getNotificationHistory: (params = {}) => {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    );
    const q = new URLSearchParams(query).toString();
    return request(`/v1/notifications/history${q ? "?" + q : ""}`);
  },
  markAllNotificationsReadV1: () =>
    request("/v1/notifications/read-all", {
      method: "PUT",
    }),
  getCertifications: () => request("/v1/certifications"),
  // ─── SPRINT 8 INSPECTOR, PDF EXPORT, TRANSPORTER ANALYTICS & PRIVACY APIs ──
  getInspectorTrace: (batchCode) =>
    request(`/v1/inspector/trace/${encodeURIComponent(batchCode)}`),
  downloadInspectorPdf: async (batchCode) => {
    const token = localStorage.getItem("agritrace_token");
    const response = await fetch(`${API_URL}/v1/inspector/export-pdf/${encodeURIComponent(batchCode)}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "Không thể tải tệp tin PDF.");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Ho_So_Kiem_Tra_${batchCode}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
  getTransporterViolations: (params = {}) => {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    );
    const q = new URLSearchParams(query).toString();
    return request(`/v1/analytics/transporter-violations${q ? "?" + q : ""}`);
  },
  getTransporters: () => request("/v1/transporters"),
  runSystemIntegrityCheck: () =>
    request("/v1/system/run-integrity-check", { method: "POST" }),
  getSystemIntegrityRuns: (params = {}) => {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    );
    const q = new URLSearchParams(query).toString();
    return request(`/v1/system/integrity-runs${q ? "?" + q : ""}`);
  },
  anonymizeFarmer: ({ targetType, targetId, reason }) =>
    request("/v1/privacy/anonymize-farmer", {
      method: "POST",
      body: JSON.stringify({ targetType, targetId, reason }),
    }),
  getPrivacyRequests: (params = {}) => {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    );
    const q = new URLSearchParams(query).toString();
    return request(`/v1/privacy/anonymization-requests${q ? "?" + q : ""}`);
  },
};
