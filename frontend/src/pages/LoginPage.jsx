import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Leaf,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  ThermometerSun,
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
    <div className="login-bg flex min-h-screen items-center justify-center p-6 font-sans">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft lg:grid-cols-2">
        {/* Left Branding Side */}
        <div className="relative hidden overflow-hidden bg-slate-950 p-10 text-white lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.35),transparent_30%)]" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 font-bold shadow-sm">
                A
              </div>
              <div>
                <div className="font-bold tracking-tight">Agritrace</div>
                <div className="text-xs text-slate-400">
                  Traceability & Cold Chain
                </div>
              </div>
            </div>
            <div className="mt-16">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                <ShieldCheck size={14} /> Chuỗi Hash Bất Biến
              </div>
              <h1 className="mt-4 max-w-sm text-3xl font-bold leading-tight tracking-tight">
                Truy xuất nguồn gốc & giám sát chuỗi lạnh nông sản.
              </h1>
              <p className="mt-4 max-w-md text-sm text-slate-300 leading-relaxed">
                Theo dõi từng lô hàng từ vùng trồng đến điểm phân phối với lịch sử sự kiện minh bạch và cảnh báo vi phạm nhiệt độ thời gian thực.
              </p>
            </div>
            <div className="mt-auto grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <Leaf className="mb-2 text-emerald-300" size={20} />
                <span className="font-semibold block">Vùng trồng</span>
                <span className="text-[11px] text-slate-400">Khai báo thửa đất</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <ThermometerSun className="mb-2 text-cyan-300" size={20} />
                <span className="font-semibold block">Chuỗi lạnh</span>
                <span className="text-[11px] text-slate-400">Giám sát liên tục</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <ShieldCheck className="mb-2 text-violet-300" size={20} />
                <span className="font-semibold block">Toàn vẹn</span>
                <span className="text-[11px] text-slate-400">Chống sửa xóa</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Side */}
        <div className="flex items-center p-8 sm:p-12">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                Đăng nhập hệ thống
              </p>
              <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
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
                    ? "bg-rose-100 text-rose-950 border-rose-300 ring-2 ring-rose-200"
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
                  <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1">
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
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition ${
                      emailError
                        ? "border-red-600 bg-red-50 text-red-950 focus:border-red-600 focus:ring-2 focus:ring-red-200"
                        : "border-slate-300 bg-white text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
                  <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1">
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
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition ${
                      passwordError
                        ? "border-red-600 bg-red-50 text-red-950 focus:border-red-600 focus:ring-2 focus:ring-red-200"
                        : "border-slate-300 bg-white text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Đang xác thực..." : "Đăng nhập"}
                  {!isSubmitting && <ArrowRight size={16} />}
                </button>
              </form>

              <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-400 py-1">
                <span className="h-px flex-1 bg-slate-200" />
                Hoặc chọn nhanh tài khoản demo
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Demo Account Buttons */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setEmailError("");
                  setPasswordError("");
                  handleLogin("farm@agritrace.demo", "Farm@123");
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-emerald-500 hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-60 card-shadow"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <ShieldCheck size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-slate-900">
                    Quản trị viên Farm (Farm Admin)
                  </span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    farm@agritrace.demo · Quản lý vùng trồng, thửa đất và lô thu hoạch
                  </span>
                </span>
                <ArrowRight className="shrink-0 text-emerald-700" size={16} />
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setEmailError("");
                  setPasswordError("");
                  handleLogin("user@agritrace.demo", "User@123");
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-emerald-500 hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-60 card-shadow"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Sprout size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-slate-900">
                    Farmer (Nông dân)
                  </span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    user@agritrace.demo · Theo dõi lô hàng, chuỗi lạnh và tính toàn vẹn
                  </span>
                </span>
                <ArrowRight className="shrink-0 text-emerald-700" size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

