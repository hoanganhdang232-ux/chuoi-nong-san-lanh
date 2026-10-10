const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3001/api" : "/api");

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
    throw new Error(errorData.message || "Yêu cầu không thành công.");
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
};
