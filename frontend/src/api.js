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
    const err = new Error(errorData.message || "Yêu cầu không thành công.");
    err.error_code = errorData.error_code;
    err.field = errorData.field;
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
  getMe: () => request("/auth/me"),
  getDashboard: () => request("/auth/dashboard"),
  getBatches: () => request("/batches"),
  getBatch: (batchId) => request(`/batches/${batchId}`),
  getBatchSummary: (batchId) => request(`/batches/${batchId}/summary`),
  getProducts: () => request("/products"),
  createProduct: (payload) =>
    request("/products", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProduct: (id, payload) =>
    request(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteProduct: (id) =>
    request(`/products/${id}`, {
      method: "DELETE",
    }),
  getFarms: () => request("/farms"),
  createFarm: (payload) =>
    request("/farms", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateFarm: (id, payload) =>
    request(`/farms/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteFarm: (id) =>
    request(`/farms/${id}`, {
      method: "DELETE",
    }),
  getLandPlots: () => request("/batches/land-plots"),
  createLandPlot: (payload) =>
    request("/batches/land-plots", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteLandPlot: (id) =>
    request(`/batches/land-plots/${id}`, {
      method: "DELETE",
    }),
  updateLandPlot: (id, payload) =>
    request(`/batches/land-plots/${id}`, {
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
  splitBatch: (batchId, payload) =>
    request(`/batches/${batchId}/split`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  mergeBatches: (payload) =>
    request(`/batches/merge`, {
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
