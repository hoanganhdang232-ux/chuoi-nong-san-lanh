import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import PublicTracePage from "./pages/PublicTracePage.jsx";
import PublicPortalPage from "./pages/PublicPortalPage.jsx";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500 bg-slate-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-800 border-r-transparent mb-3"></div>
          <p className="font-semibold text-slate-700">Đang khởi động hệ thống...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Trang chủ Cổng Quốc gia (Tra cứu công khai cho người dân & cơ quan) */}
      <Route path="/" element={<PublicPortalPage />} />

      {/* Hồ sơ điện tử truy xuất cho một mã lô cụ thể */}
      <Route path="/trace/:batchCode" element={<PublicTracePage />} />

      {/* Đăng nhập hệ thống cán bộ / HTX */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />

      {/* Bàn làm việc Quản trị & Tác nghiệp */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Điều hướng mặc định */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
