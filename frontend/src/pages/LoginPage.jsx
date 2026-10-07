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
  const { login } = useAuth();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDemoLogin = async (email, password) => {
    setError("");
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
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
                Đăng nhập
              </p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">
                Chọn vai trò để tiếp tục
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Chọn Quản trị viên hoặc Farmer.
              </p>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() =>
                  handleDemoLogin("farm@agritrace.demo", "Farm@123")
                }
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
                onClick={() =>
                  handleDemoLogin("user@agritrace.demo", "User@123")
                }
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
