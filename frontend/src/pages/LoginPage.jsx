import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Factory,
  Leaf,
  Lock,
  ShieldAlert,
  ShieldCheck,
  ThermometerSun,
  Truck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    let isValid = true;
    let errEmail = "";
    let errPass = "";

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errEmail = "Vui lòng điền vào trường này.";
      isValid = false;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        errEmail = "Email không hợp lệ (VD: example@domain.com)";
        isValid = false;
      }
    }

    if (!password) {
      errPass = "Vui lòng điền vào trường này.";
      isValid = false;
    }

    setEmailError(errEmail);
    setPasswordError(errPass);
    return isValid;
  };

  const handleLogin = async (loginEmail, loginPassword) => {
    setServerError("");
    setIsSubmitting(true);

    try {
      await login(loginEmail, loginPassword);
    } catch (loginError) {
      setServerError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }
    void handleLogin(email.trim(), password);
  };

  const isLocked = serverError.toLowerCase().includes("bị khóa") || serverError.toLowerCase().includes("locked");

  return (
    <div className="login-bg min-h-screen flex items-center justify-center p-4 sm:p-6 font-sans antialiased">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-700/50 bg-slate-900/90 shadow-2xl backdrop-blur-xl lg:grid-cols-2">
        {/* Left Branding Side */}
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950/80 p-10 text-white lg:flex lg:flex-col lg:justify-between border-r border-slate-800/80">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />

          <div className="relative z-10">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 font-black text-xl text-white shadow-lg shadow-emerald-500/30">
                A
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-950">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                </span>
              </div>
              <div>
                <div className="font-extrabold tracking-tight text-white text-lg">Agritrace</div>
                <div className="text-xs text-emerald-400 font-semibold tracking-wide">
                  Cold Chain & Traceability 4.0
                </div>
              </div>
            </div>

            <div className="mt-14">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-sm">
                <ShieldCheck size={14} className="text-emerald-400" /> Chuỗi Hash Bất Biến SHA-256
              </div>
              <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
                Truy xuất nguồn gốc & giám sát chuỗi lạnh nông sản.
              </h1>
              <p className="mt-4 text-sm text-slate-300/90 leading-relaxed max-w-lg">
                Theo dõi từng lô hàng từ vùng trồng đến điểm phân phối với lịch sử sự kiện minh bạch và cảnh báo vi phạm nhiệt độ thời gian thực.
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="relative z-10 mt-10">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-emerald-500/40">
                <Leaf className="mb-2.5 text-emerald-400" size={22} />
                <span className="font-bold text-white block text-sm">Vùng trồng</span>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Khai báo thửa đất</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-cyan-500/40">
                <ThermometerSun className="mb-2.5 text-cyan-400" size={22} />
                <span className="font-bold text-white block text-sm">Chuỗi lạnh</span>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Giám sát liên tục</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-violet-500/40">
                <ShieldCheck className="mb-2.5 text-violet-400" size={22} />
                <span className="font-bold text-white block text-sm">Toàn vẹn</span>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Chống sửa xóa</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Side */}
        <div className="flex items-center justify-center p-6 sm:p-12 bg-white">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700 mb-2 border border-emerald-200">
                Hệ thống xác thực an toàn
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Chào mừng trở lại
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Nhập email và mật khẩu tài khoản của bạn để tiếp tục.
              </p>
            </div>

            {/* Server Error / Lockout Banner */}
            {serverError && (
              <div
                className={`mb-5 rounded-2xl p-4 text-xs font-medium border flex items-start gap-3 animate-in fade-in ${
                  isLocked
                    ? "bg-rose-50 text-rose-950 border-rose-300 ring-2 ring-rose-200"
                    : "bg-rose-50 text-rose-800 border-rose-200"
                }`}
              >
                {isLocked ? (
                  <Lock size={20} className="text-rose-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert size={20} className="text-rose-600 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-bold text-sm">{isLocked ? "Tài khoản bị tạm khóa" : "Đăng nhập không thành công"}</p>
                  <p className="mt-1 leading-relaxed opacity-90">{serverError}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <form id="loginForm" noValidate className="space-y-3.5" onSubmit={handleSubmit}>
                {/* Email Field */}
                <div className="flex flex-col">
                  <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1.5">
                    Địa chỉ Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="example@domain.com"
                    disabled={isSubmitting}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError("");
                      if (serverError) setServerError("");
                    }}
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-all duration-150 ${
                      emailError
                        ? "border-red-500 bg-red-50/50 text-red-950 focus:border-red-600 focus:ring-2 focus:ring-red-200"
                        : "border-slate-300 bg-slate-50/40 text-slate-900 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    }`}
                  />
                  {emailError && (
                    <div className="mt-1 flex items-center gap-1.5 text-red-600 text-xs font-medium min-h-[1.2rem]">
                      <AlertTriangle size={13} className="flex-shrink-0" />
                      <span id="emailError">{emailError}</span>
                    </div>
                  )}
                </div>

                {/* Password Field */}
                <div className="flex flex-col">
                  <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1.5">
                    Mật khẩu <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    disabled={isSubmitting}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError("");
                      if (serverError) setServerError("");
                    }}
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-all duration-150 ${
                      passwordError
                        ? "border-red-500 bg-red-50/50 text-red-950 focus:border-red-600 focus:ring-2 focus:ring-red-200"
                        : "border-slate-300 bg-slate-50/40 text-slate-900 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    }`}
                  />
                  {passwordError && (
                    <div className="mt-1 flex items-center gap-1.5 text-red-600 text-xs font-medium min-h-[1.2rem]">
                      <AlertTriangle size={13} className="flex-shrink-0" />
                      <span id="passwordError">{passwordError}</span>
                    </div>
                  )}
                </div>

                {/* Submit button */}
                <button
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-900/20 transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Đang xác thực..." : "Đăng nhập"}
                  {!isSubmitting && <ArrowRight size={16} />}
                </button>
              </form>

              <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 py-1">
                <span className="h-px flex-1 bg-slate-200" />
                Hoặc chọn nhanh tài khoản demo
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Demo Account Buttons */}
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setEmailError("");
                    setPasswordError("");
                    handleLogin("processor@agritrace.demo", "Processor@123");
                  }}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition-all duration-150 hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                    <Factory size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900">
                      Cơ sở chế biến (Processor Admin)
                    </span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      processor@agritrace.demo · Sơ chế, đóng gói, tách/gộp lô
                    </span>
                  </span>
                  <ArrowRight className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" size={15} />
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setEmailError("");
                    setPasswordError("");
                    handleLogin("distributor@agritrace.demo", "Distributor@123");
                  }}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition-all duration-150 hover:border-amber-400 hover:bg-amber-50/40 hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 transition-colors group-hover:bg-amber-600 group-hover:text-white">
                    <Truck size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900">
                      Nhà phân phối (Distributor Admin)
                    </span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      distributor@agritrace.demo · Phân phối cửa hàng, tiêu thụ lô
                    </span>
                  </span>
                  <ArrowRight className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-600" size={15} />
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setEmailError("");
                    setPasswordError("");
                    handleLogin("farm@agritrace.demo", "Farm@123");
                  }}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition-all duration-150 hover:border-emerald-400 hover:bg-emerald-50/40 hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                    <ShieldCheck size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900">
                      Quản trị viên Nông trại (Farm Admin)
                    </span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      farm@agritrace.demo · Quản lý vùng trồng, thu hoạch
                    </span>
                  </span>
                  <ArrowRight className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

