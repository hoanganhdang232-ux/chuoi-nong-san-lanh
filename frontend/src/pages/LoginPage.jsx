import { useState } from "react";
import {
  ArrowRight,
  Leaf,
  ShieldCheck,
  Sprout,
  ThermometerSun,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    organizationName: "",
    organizationType: "farm",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (loginEmail, loginPassword) => {
    setError("");
    setIsSubmitting(true);

    try {
      await login(loginEmail, loginPassword);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        organizationName: formData.organizationName,
        organizationType: formData.organizationType,
      });
    } catch (registerError) {
      setError(registerError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (mode === "login") {
      void handleLogin(formData.email, formData.password);
      return;
    }
    void handleRegister(event);
  };

  return (
    <div className="login-bg flex min-h-screen items-center justify-center p-6">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft lg:grid-cols-2">
        <div className="relative hidden overflow-hidden bg-slate-950 p-10 text-white lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.35),transparent_30%)]" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 font-bold">
                A
              </div>
              <div>
                <div className="font-bold">Agritrace</div>
                <div className="text-xs text-slate-400">
                  Traceability & Cold Chain
                </div>
              </div>
            </div>
            <div className="mt-16">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Hệ thống minh họa
              </p>
              <h1 className="mt-4 max-w-sm text-4xl font-bold leading-tight">
                Truy xuất nguồn gốc, giám sát chuỗi lạnh nông sản.
              </h1>
              <p className="mt-6 max-w-md text-slate-300">
                Theo dõi từng lô hàng từ vùng trồng đến người mua với lịch sử sự
                kiện minh bạch và dữ liệu nhiệt độ trực tiếp.
              </p>
            </div>
            <div className="mt-auto grid grid-cols-3 gap-4 text-sm">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Leaf className="mb-2 text-emerald-300" size={20} /> Farm trace
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <ThermometerSun className="mb-2 text-cyan-300" size={20} /> Cold
                chain
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <ShieldCheck className="mb-2 text-violet-300" size={20} /> Hash
                integrity
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center p-8 sm:p-12">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
                {mode === "login" ? "Đăng nhập" : "Đăng ký"}
              </p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">
                {mode === "login" ? "Đăng nhập tài khoản" : "Tạo tổ chức mới"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {mode === "login"
                  ? "Nhập email và mật khẩu để tiếp tục."
                  : "Đăng ký tổ chức và trở thành admin của tổ chức đó."}
              </p>
            </div>

            <div className="mb-4 flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  mode === "login"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  mode === "register"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Đăng ký
              </button>
            </div>

            <div className="space-y-4">
              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === "register" && (
                  <label className="block text-sm font-medium text-slate-700">
                    Họ và tên
                    <input
                      name="name"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      disabled={isSubmitting}
                      onChange={handleChange}
                      required
                      type="text"
                      value={formData.name}
                    />
                  </label>
                )}

                <label className="block text-sm font-medium text-slate-700">
                  Email
                  <input
                    autoComplete="username"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    disabled={isSubmitting}
                    name="email"
                    onChange={handleChange}
                    required
                    type="email"
                    value={formData.email}
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Mật khẩu
                  <input
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    disabled={isSubmitting}
                    minLength={6}
                    name="password"
                    onChange={handleChange}
                    required
                    type="password"
                    value={formData.password}
                  />
                </label>

                {mode === "register" && (
                  <>
                    <label className="block text-sm font-medium text-slate-700">
                      Tên tổ chức
                      <input
                        name="organizationName"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        disabled={isSubmitting}
                        onChange={handleChange}
                        required
                        type="text"
                        value={formData.organizationName}
                      />
                    </label>

                    <label className="block text-sm font-medium text-slate-700">
                      Loại tổ chức
                      <select
                        name="organizationType"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        disabled={isSubmitting}
                        onChange={handleChange}
                        value={formData.organizationType}
                      >
                        <option value="farm">Farm</option>
                        <option value="processor">Processor</option>
                        <option value="distributor">Distributor</option>
                      </select>
                    </label>
                  </>
                )}

                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting
                    ? mode === "login"
                      ? "Đang đăng nhập..."
                      : "Đang đăng ký..."
                    : mode === "login"
                    ? "Đăng nhập"
                    : "Đăng ký"}
                  {!isSubmitting && <ArrowRight size={18} />}
                </button>
              </form>

              {mode === "login" && (
                <>
                  <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    Hoặc dùng tài khoản demo
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleLogin("farm@agritrace.demo", "Farm@123")}
                    className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
                      <ShieldCheck size={21} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900">
                        Quản trị viên
                      </span>
                      <span className="mt-1 block text-sm text-slate-500">
                        Quản lý vùng trồng, thửa đất và lô thu hoạch
                      </span>
                    </span>
                    {isSubmitting ? (
                      <span className="text-sm text-slate-500">Đang vào...</span>
                    ) : (
                      <ArrowRight className="shrink-0 text-emerald-700" size={18} />
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleLogin("user@agritrace.demo", "User@123")}
                    className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                      <Sprout size={21} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900">
                        Farmer
                      </span>
                      <span className="mt-1 block text-sm text-slate-500">
                        Theo dõi lô hàng, chuỗi lạnh và tính toàn vẹn
                      </span>
                    </span>
                    {isSubmitting ? (
                      <span className="text-sm text-slate-500">Đang vào...</span>
                    ) : (
                      <ArrowRight className="shrink-0 text-emerald-700" size={18} />
                    )}
                  </button>
                </>
              )}

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
