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
} from "lucide-react";

const menuByRole = {
  farm_admin: [
    { label: "Tổng quan", icon: BarChart3 },
    { label: "Lô nông sản", icon: Boxes },
    { label: "Chuỗi lạnh", icon: ClipboardCheck },
    { label: "Thu hồi", icon: Siren },
    { label: "Báo cáo kiểm tra", icon: FileDown },
    { label: "Tổ chức", icon: Users },
  ],
  processor_admin: [
    { label: "Tổng quan", icon: BarChart3 },
    { label: "Lô xử lý", icon: Boxes },
    { label: "Chuỗi lạnh", icon: ClipboardCheck },
    { label: "Thu hồi", icon: Siren },
    { label: "Báo cáo kiểm tra", icon: FileDown },
    { label: "Kiểm soát", icon: ShieldCheck },
  ],
  distributor_admin: [
    { label: "Tổng quan", icon: BarChart3 },
    { label: "Lô phân phối", icon: Boxes },
    { label: "Chuỗi lạnh", icon: ClipboardCheck },
    { label: "Thu hồi", icon: Siren },
    { label: "Báo cáo kiểm tra", icon: FileDown },
    { label: "Kiểm tra", icon: ShieldCheck },
  ],
  auditor: [
    { label: "Tổng quan", icon: BarChart3 },
    { label: "Toàn bộ lô", icon: Boxes },
    { label: "Integrity", icon: ShieldCheck },
    { label: "Báo cáo kiểm tra", icon: FileDown },
    { label: "Thu hồi", icon: Siren },
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
    <aside className="flex w-full flex-col bg-brand-900 text-slate-100 lg:w-[280px] border-r border-brand-800 relative z-20">
      <div className="flex items-center gap-4 p-5 bg-brand-800/50 border-b border-brand-800">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-white text-xl font-bold text-brand-800 shadow-sm">
          A
        </div>
        <div>
          <div className="font-display font-bold text-white text-base tracking-wide uppercase">Cổng truy xuất</div>
          <div className="text-xs font-medium text-brand-100/80 uppercase tracking-wider mt-0.5">Bộ Nông nghiệp</div>
        </div>
      </div>

      <div className="p-4">
        <div className="rounded bg-brand-800 p-3 border border-brand-700">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-brand-300">Tài khoản</div>
          <div className="mt-1 font-bold text-white text-sm">{user?.name}</div>
          <div className="text-xs text-brand-200 mt-0.5 truncate">{user?.organizationName}</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {items.map(({ label, icon: Icon }) => {
          const isActive = currentView === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSelectView(label)}
              className={`group flex w-full items-center gap-3 rounded px-4 py-2.5 text-left text-sm font-semibold transition-all ${
                isActive
                  ? "bg-brand-700 text-white"
                  : "text-brand-100 hover:bg-brand-800 hover:text-white"
              }`}
            >
              <Icon 
                size={18} 
                className={`transition-colors ${isActive ? "text-white" : "text-brand-300 group-hover:text-brand-100"}`} 
              />
              {label}
            </button>
          )
        })}
      </nav>

      <div className="p-4 border-t border-brand-800">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded border border-brand-700 bg-brand-800 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-700"
        >
          <LogOut size={18} />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
