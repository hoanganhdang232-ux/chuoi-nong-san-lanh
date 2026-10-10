import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Sprout,
  Building2,
  Truck,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Settings,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (loginEmail, loginPassword) => {
    setError("");
    setIsSubmitting(true);

    try {
      await login(loginEmail, loginPassword);
    } catch (loginError) {
      setError(loginError.message || "Đăng nhập không thành công.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    void handleLogin(email, password);
  };

  const demoRoles = [
    {
      title: "Nông dân / Hợp tác xã",
      desc: "Khai báo thửa đất, nhập sản lượng & tạo lô thu hoạch",
      email: "farm@agritrace.demo",
      pass: "Farm@123",
      icon: Sprout,
      color: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
    },
    {
      title: "Cơ sở sơ chế / Chế biến",
      desc: "Tiếp nhận lô hàng, đóng gói & bảo quản",
      email: "processor@agritrace.demo",
      pass: "Processor@123",
      icon: Building2,
      color: "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100",
    },
    {
      title: "Đơn vị vận chuyển / Phân phối",
      desc: "Giám sát chuỗi lạnh trên đường đi, tiếp nhận kho",
      email: "distributor@agritrace.demo",
      pass: "Distributor@123",
      icon: Truck,
      color: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
    },
    {
      title: "Cán bộ kiểm tra / Thanh tra",
      desc: "Kiểm toán toàn vẹn Blockchain, kích hoạt thu hồi",
      email: "auditor@agritrace.demo",
      pass: "Auditor@123",
      icon: ShieldCheck,
      color: "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100",
    },
    {
      title: "Quản trị viên (Admin)",
      desc: "Quản lý hệ thống, phân quyền và giám sát tổng thể",
      email: "admin",
      pass: "123456",
      icon: Settings,
      color: "bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* Top Banner */}
      <div className="bg-brand-900 text-white text-xs py-2 px-4 border-b border-brand-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-brand-100 hover:text-white transition-colors"
          >
            <ArrowLeft size={14} /> Quay lại Cổng tra cứu công khai
          </Link>
          <span className="text-[11px] text-brand-200 hidden sm:inline">
            Hệ thống Quản lý Tác nghiệp An toàn Chuỗi lạnh
          </span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-4xl bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden grid md:grid-cols-12">
          {/* Left / Top Info: 1-Click Demo Login */}
          <div className="md:col-span-6 bg-slate-50 p-6 sm:p-8 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-800 text-white font-bold text-sm">
                  VN
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-brand-800">
                  BỘ NÔNG NGHIỆP VÀ PTNT
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
                Đăng nhập
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mb-6">
                Bấm vào vai trò bạn muốn thử nghiệm bên dưới để điền tự động thông tin đăng nhập:
              </p>

              <div className="space-y-2.5">
                {demoRoles.map((role) => {
                  const Icon = role.icon;
                  return (
                    <button
                      key={role.email}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setEmail(role.email);
                        setPassword(role.pass);
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3 ${role.color} disabled:opacity-50`}
                    >
                      <Icon size={20} className="shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-bold">{role.title}</div>
                        <div className="text-[11px] opacity-80 mt-0.5">{role.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500">
              * Dành cho học phần Thực tập cơ sở: Truy xuất nguồn gốc & giám sát chuỗi lạnh nông sản.
            </div>
          </div>

          {/* Right: Manual Login Form */}
          <div className="md:col-span-6 p-6 sm:p-8 flex flex-col justify-center">
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              Đăng nhập tài khoản cá nhân
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Nhập email và mật khẩu được cấp để truy cập hệ thống.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Email đăng nhập
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="ví dụ: farm@agritrace.demo"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-brand-700 focus:ring-1 focus:ring-brand-700 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Mật khẩu
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-brand-700 focus:ring-1 focus:ring-brand-700 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-brand-800 hover:bg-brand-900 text-white font-semibold text-sm shadow transition-all active:scale-95 disabled:opacity-60"
              >
                <span>{isSubmitting ? "Đang xác thực..." : "Đăng nhập hệ thống"}</span>
                <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
