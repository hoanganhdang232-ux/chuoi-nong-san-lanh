import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Factory,
  Leaf,
  Loader2,
  Lock,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sun,
  ThermometerSun,
  Truck,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

export default function LoginPage() {
  const { login } = useAuth();
  const { toggleTheme, isDark } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State cho Modal xác nhận đăng nhập (Gaussian blur + Pop-up nổi)
  const [confirmAuthModal, setConfirmAuthModal] = useState({
    open: false,
    email: "",
    password: "",
    roleTitle: "",
    roleDesc: "",
    badgeText: "",
    IconComponent: ShieldCheck,
    colorTheme: "emerald",
  });

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

  const executeLogin = async (targetEmail, targetPassword) => {
    setServerError("");
    setIsSubmitting(true);

    try {
      await login(targetEmail, targetPassword);
      setConfirmAuthModal((prev) => ({ ...prev, open: false }));
    } catch (loginError) {
      setServerError(loginError.message);
      setConfirmAuthModal((prev) => ({ ...prev, open: false }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Kích hoạt Modal xác nhận khi nhấn nút "Đăng nhập" từ form
  const handleFormSubmit = (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    setConfirmAuthModal({
      open: true,
      email: email.trim(),
      password,
      roleTitle: "Đăng nhập tài khoản cá nhân",
      roleDesc: "Hệ thống sẽ chứng thực chữ ký bảo mật và phân quyền vai trò.",
      badgeText: "Tài khoản cá nhân",
      IconComponent: Lock,
      colorTheme: "emerald",
    });
  };

  // Kích hoạt Modal xác nhận khi bấm các tài khoản Demo
  const handleOpenDemoConfirm = (demoType) => {
    setEmailError("");
    setPasswordError("");
    setServerError("");

    if (demoType === "processor") {
      setConfirmAuthModal({
        open: true,
        email: "processor@agritrace.demo",
        password: "Processor@123",
        roleTitle: "Cơ sở chế biến (Processor Admin)",
        roleDesc: "Quyền quản lý cơ sở chế biến, sơ chế, đóng gói, tách lô và gộp lô nông sản.",
        badgeText: "Cơ sở chế biến",
        IconComponent: Factory,
        colorTheme: "blue",
      });
    } else if (demoType === "distributor") {
      setConfirmAuthModal({
        open: true,
        email: "distributor@agritrace.demo",
        password: "Distributor@123",
        roleTitle: "Nhà phân phối (Distributor Admin)",
        roleDesc: "Quyền tiếp nhận bàn giao, điều phối chi nhánh cửa hàng và ghi nhận tiêu thụ.",
        badgeText: "Nhà phân phối",
        IconComponent: Truck,
        colorTheme: "amber",
      });
    } else if (demoType === "farm") {
      setConfirmAuthModal({
        open: true,
        email: "farm@agritrace.demo",
        password: "Farm@123",
        roleTitle: "Quản trị viên Nông trại (Farm Admin)",
        roleDesc: "Quyền khai báo thửa đất, danh mục sản phẩm và quản lý các đợt thu hoạch nông sản.",
        badgeText: "Chủ trang trại",
        IconComponent: Leaf,
        colorTheme: "emerald",
      });
    }
  };

  const isLocked =
    serverError.toLowerCase().includes("bị khóa") ||
    serverError.toLowerCase().includes("locked");

  const ModalIcon = confirmAuthModal.IconComponent;

  return (
    <div className="login-bg min-h-screen relative flex items-center justify-center p-4 sm:p-6 font-sans antialiased selection:bg-emerald-500 selection:text-white">
      {/* Nút chuyển đổi giao diện Sáng / Tối nổi ở góc trên bên phải */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-30">
        <button
          type="button"
          onClick={toggleTheme}
          className="group flex items-center gap-2 rounded-full border border-slate-300/60 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/80 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-lg backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
          title={isDark ? "Chuyển sang chế độ Sáng" : "Chuyển sang chế độ Tối"}
        >
          {isDark ? (
            <>
              <Sun size={15} className="text-amber-400 group-hover:rotate-45 transition-transform" />
              <span className="hidden sm:inline">Chế độ Sáng</span>
            </>
          ) : (
            <>
              <Moon size={15} className="text-indigo-600 group-hover:-rotate-12 transition-transform" />
              <span className="hidden sm:inline">Chế độ Tối</span>
            </>
          )}
        </button>
      </div>

      {/* Main Login Card */}
      <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-700/60 bg-white/95 dark:bg-slate-900/95 shadow-2xl backdrop-blur-xl lg:grid-cols-2">
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

        {/* Right Form Side with harmonious dark/light mode */}
        <div className="flex items-center justify-center p-6 sm:p-12 bg-white/95 dark:bg-slate-900/95 transition-colors duration-200">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-2 border border-emerald-200 dark:border-emerald-800">
                Hệ thống xác thực an toàn
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Chào mừng trở lại
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Nhập email và mật khẩu tài khoản của bạn để tiếp tục.
              </p>
            </div>

            {/* Server Error / Lockout Banner */}
            {serverError && (
              <div
                className={`mb-5 rounded-2xl p-4 text-xs font-medium border flex items-start gap-3 animate-in fade-in ${
                  isLocked
                    ? "bg-rose-50 dark:bg-rose-950/60 text-rose-950 dark:text-rose-200 border-rose-300 dark:border-rose-800 ring-2 ring-rose-200 dark:ring-rose-900/40"
                    : "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                }`}
              >
                {isLocked ? (
                  <Lock size={20} className="text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert size={20} className="text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-bold text-sm">
                    {isLocked ? "Tài khoản bị tạm khóa" : "Đăng nhập không thành công"}
                  </p>
                  <p className="mt-1 leading-relaxed opacity-90">{serverError}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <form id="loginForm" noValidate className="space-y-3.5" onSubmit={handleFormSubmit}>
                {/* Email Field */}
                <div className="flex flex-col">
                  <label
                    htmlFor="email"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
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
                        ? "border-red-500 bg-red-50/50 dark:bg-red-950/40 text-red-950 dark:text-red-200 focus:border-red-600 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900/40"
                        : "border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/70 text-slate-900 dark:text-white focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/40"
                    }`}
                  />
                  {emailError && (
                    <div className="mt-1 flex items-center gap-1.5 text-red-600 dark:text-red-400 text-xs font-medium min-h-[1.2rem]">
                      <AlertTriangle size={13} className="flex-shrink-0" />
                      <span id="emailError">{emailError}</span>
                    </div>
                  )}
                </div>

                {/* Password Field */}
                <div className="flex flex-col">
                  <label
                    htmlFor="password"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
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
                        ? "border-red-500 bg-red-50/50 dark:bg-red-950/40 text-red-950 dark:text-red-200 focus:border-red-600 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900/40"
                        : "border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/70 text-slate-900 dark:text-white focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/40"
                    }`}
                  />
                  {passwordError && (
                    <div className="mt-1 flex items-center gap-1.5 text-red-600 dark:text-red-400 text-xs font-medium min-h-[1.2rem]">
                      <AlertTriangle size={13} className="flex-shrink-0" />
                      <span id="passwordError">{passwordError}</span>
                    </div>
                  )}
                </div>

                {/* Submit button */}
                <button
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-900/20 transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Đang xác thực..." : "Đăng nhập"}
                  {!isSubmitting && <ArrowRight size={16} />}
                </button>
              </form>

              <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 py-1">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                Hoặc chọn nhanh tài khoản demo
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>

              {/* Demo Account Buttons */}
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleOpenDemoConfirm("processor")}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3 text-left transition-all duration-150 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                    <Factory size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900 dark:text-white">
                      Cơ sở chế biến (Processor Admin)
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      processor@agritrace.demo · Sơ chế, đóng gói, tách/gộp lô
                    </span>
                  </span>
                  <ArrowRight
                    className="shrink-0 text-slate-400 dark:text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                    size={15}
                  />
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleOpenDemoConfirm("distributor")}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3 text-left transition-all duration-150 hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50/40 dark:hover:bg-amber-950/30 hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 transition-colors group-hover:bg-amber-600 group-hover:text-white">
                    <Truck size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900 dark:text-white">
                      Nhà phân phối (Distributor Admin)
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      distributor@agritrace.demo · Phân phối cửa hàng, tiêu thụ lô
                    </span>
                  </span>
                  <ArrowRight
                    className="shrink-0 text-slate-400 dark:text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-600 dark:group-hover:text-amber-400"
                    size={15}
                  />
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleOpenDemoConfirm("farm")}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3 text-left transition-all duration-150 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30 hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                    <ShieldCheck size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900 dark:text-white">
                      Quản trị viên Nông trại (Farm Admin)
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      farm@agritrace.demo · Quản lý vùng trồng, thu hoạch
                    </span>
                  </span>
                  <ArrowRight
                    className="shrink-0 text-slate-400 dark:text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                    size={15}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          MODAL XÁC NHẬN ĐĂNG NHẬP (GAUSSIAN BLUR + POPUP NỔI)
          Làm mờ nền cực mạnh toàn bộ màn hình phía sau
          ======================================================== */}
      {confirmAuthModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 gaussian-backdrop animate-fade-in">
          <div className="animate-modal-in modal-card-glow relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-2xl transition-all">
            {/* Close Button */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setConfirmAuthModal((prev) => ({ ...prev, open: false }))}
              className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition cursor-pointer disabled:opacity-40"
            >
              <X size={18} />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-inner ${
                  confirmAuthModal.colorTheme === "blue"
                    ? "bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400"
                    : confirmAuthModal.colorTheme === "amber"
                    ? "bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                <ModalIcon size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="inline-block rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">
                  Xác nhận truy cập
                </span>
                <h3 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                  Xác nhận đăng nhập
                </h3>
              </div>
            </div>

            {/* Modal Content Info */}
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Tài khoản:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white break-all text-right">
                    {confirmAuthModal.email}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2 border-t border-slate-200/60 dark:border-slate-800/80 pt-2">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Vai trò:</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400 text-right">
                    {confirmAuthModal.roleTitle}
                  </span>
                </div>

                <div className="border-t border-slate-200/60 dark:border-slate-800/80 pt-2">
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    {confirmAuthModal.roleDesc}
                  </p>
                </div>
              </div>

              {/* Security Notice */}
              <div className="flex items-center gap-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 px-3.5 py-2.5 text-[11px] text-slate-600 dark:text-slate-400">
                <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
                <span>Phiên làm việc được bảo mật và mã hóa thời gian thực.</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800 pt-4">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setConfirmAuthModal((prev) => ({ ...prev, open: false }))}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition disabled:opacity-50 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => executeLogin(confirmAuthModal.email, confirmAuthModal.password)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-900/20 active:scale-95 transition disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Đang xác thực...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Xác nhận đăng nhập</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
