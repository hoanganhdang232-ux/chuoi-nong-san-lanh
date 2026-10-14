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
} from "lucide-react";

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
  const items = menuByRole[user?.role] || menuByRole.user;

  return (
    <aside className="flex w-full flex-col bg-slate-950 text-slate-200 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:overflow-y-auto">
      <div className="flex items-center gap-3 border-b border-white/10 p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500 text-lg font-bold text-white">
          A
        </div>
        <div>
          <div className="font-bold text-white">Agritrace</div>
          <div className="text-xs text-slate-400">Traceability Demo</div>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
          <div className="min-w-0 pr-2">
            <div className="text-xs text-emerald-300">Tài khoản</div>
            <div className="mt-0.5 truncate font-semibold text-white">{user?.name}</div>
            <div className="truncate text-xs text-slate-400">{user?.organizationName}</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Đăng xuất"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:border-rose-500/40 hover:bg-rose-500/20 hover:text-rose-200"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <nav className="flex-1 px-3">
        {items.map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelectView(label)}
            className={`mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${currentView === label ? "bg-emerald-500 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

    </aside>
  );
}
