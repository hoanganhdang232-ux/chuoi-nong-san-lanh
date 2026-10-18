import { useState } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  LogOut,
  FileDown,
  Siren,
  ShieldCheck,
  Sprout,
  Users,
  History,
  MapPin,
  FileSpreadsheet,
  Moon,
  Sun,
  Menu,
  X,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext.jsx";

const menuByRole = {
  farm_admin: [
    { label: "Tổng quan", icon: BarChart3 },
    { label: "Lô nông sản", icon: Boxes },
    { label: "Chuỗi lạnh", icon: ClipboardCheck },
    { label: "Thu hồi", icon: Siren },
    { label: "Báo cáo kiểm tra", icon: FileDown },
    { label: "Tổ chức", icon: Users },
    { label: "Địa điểm & Cửa hàng", icon: MapPin },
    { label: "Nhập CSV", icon: FileSpreadsheet },
    { label: "Nhật ký thao tác", icon: History },
  ],
  processor_admin: [
    { label: "Tổng quan", icon: BarChart3 },
    { label: "Lô xử lý", icon: Boxes },
    { label: "Chuỗi lạnh", icon: ClipboardCheck },
    { label: "Thu hồi", icon: Siren },
    { label: "Báo cáo kiểm tra", icon: FileDown },
    { label: "Kiểm soát", icon: ShieldCheck },
    { label: "Địa điểm & Cửa hàng", icon: MapPin },
    { label: "Nhập CSV", icon: FileSpreadsheet },
    { label: "Nhật ký thao tác", icon: History },
  ],
  distributor_admin: [
    { label: "Tổng quan", icon: BarChart3 },
    { label: "Lô phân phối", icon: Boxes },
    { label: "Chuỗi lạnh", icon: ClipboardCheck },
    { label: "Thu hồi", icon: Siren },
    { label: "Báo cáo kiểm tra", icon: FileDown },
    { label: "Kiểm tra", icon: ShieldCheck },
    { label: "Địa điểm & Cửa hàng", icon: MapPin },
    { label: "Nhập CSV", icon: FileSpreadsheet },
    { label: "Nhật ký thao tác", icon: History },
  ],
  auditor: [
    { label: "Tổng quan", icon: BarChart3 },
    { label: "Toàn bộ lô", icon: Boxes },
    { label: "Integrity", icon: ShieldCheck },
    { label: "Báo cáo kiểm tra", icon: FileDown },
    { label: "Thu hồi", icon: Siren },
    { label: "Nhật ký thao tác", icon: History },
  ],
  consumer: [
    { label: "Tổng quan", icon: BarChart3 },
    { label: "Truy xuất", icon: Sprout },
    { label: "An toàn", icon: ShieldCheck },
  ],
  user: [
    { label: "Tổng quan", icon: BarChart3 },
    { label: "Lô hàng", icon: Boxes },
    { label: "Chuỗi lạnh", icon: ClipboardCheck },
    { label: "Integrity", icon: ShieldCheck },
  ],
};

export default function Sidebar({ user, currentView, onSelectView, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const items = menuByRole[user?.role] || menuByRole.user;

  const handleSelect = (label) => {
    onSelectView(label);
    setMobileOpen(false);
  };

  const navContent = (
    <>
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-white/10 p-5 bg-white/70 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 text-lg font-black text-white shadow-lg shadow-emerald-500/25 ring-1 ring-white/20">
            A
            <span className="absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-slate-950">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-slate-900 dark:text-white text-base tracking-tight">Agritrace</span>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 tracking-wider uppercase">
                SaaS
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Chuỗi Lạnh & IoT</div>
          </div>
        </div>

        {/* Mobile close button */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          aria-label="Đóng menu"
        >
          <X size={20} />
        </button>
      </div>

      {/* User Card */}
      <div className="p-4">
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/10 to-teal-500/5 p-3.5 shadow-xs backdrop-blur-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Tài khoản
                </span>
              </div>
              <div className="mt-1 truncate font-semibold text-slate-900 dark:text-white text-sm" title={user?.name}>
                {user?.name}
              </div>
              <div className="truncate text-xs text-slate-500 dark:text-slate-400 font-medium" title={user?.organizationName}>
                {user?.organizationName}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Light / Dark Mode Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                title={isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 text-slate-600 dark:text-slate-300 transition-all hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer active:scale-95"
              >
                {isDark ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-slate-700" />}
              </button>

              {/* Logout Button */}
              <button
                type="button"
                onClick={onLogout}
                title="Đăng xuất"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 text-slate-600 dark:text-slate-300 transition-all hover:border-rose-500/50 hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300 cursor-pointer active:scale-95"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {items.map(({ label, icon: Icon }) => {
          const isActive = currentView === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => handleSelect(label)}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-all duration-150 cursor-pointer ${
                isActive
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950/20 font-semibold"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Icon
                size={18}
                className={`shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                  isActive ? "text-white" : "text-slate-400 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                }`}
              />
              <span className="truncate flex-1">{label}</span>
              {isActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-white shadow-xs" />
              )}
            </button>
          );
        })}
      </nav>

      {/* System Telemetry Footer */}
      <div className="p-4 mt-auto border-t border-slate-200/80 dark:border-white/5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Cảm biến chuỗi lạnh
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
              24/7 LIVE
            </span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            Ký băm SHA-256 · Bất biến
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Top Navbar with Hamburger */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 font-bold text-white shadow-sm">
            A
          </div>
          <div>
            <div className="font-extrabold text-slate-900 dark:text-white text-sm">Agritrace</div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">{currentView}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
            title="Đổi giao diện"
          >
            {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* Mobile Backdrop & Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] flex flex-col bg-white dark:bg-slate-950 shadow-2xl z-10">
            {navContent}
          </div>
        </div>
      )}

      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:flex w-72 shrink-0 flex-col bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800/80 sticky top-0 h-screen overflow-y-auto">
        {navContent}
      </aside>
    </>
  );
}
