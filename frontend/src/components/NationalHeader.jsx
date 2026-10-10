import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  Search,
  User,
  LogOut,
  LayoutDashboard,
} from "lucide-react";

export default function NationalHeader() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isHome = location.pathname === "/" || location.pathname.startsWith("/trace");

  return (
    <header className="sticky top-0 z-50 w-full shadow-sm flex flex-col font-sans">
      {/* Banner Nền Xanh Đậm theo đúng chuẩn hình ảnh */}
      <div className="bg-[#1b4332] text-white py-3 px-4 sm:px-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-4">
          {/* Biểu tượng Quốc huy (Hình ảnh placeholder tương tự) */}
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#fcd34d] flex items-center justify-center border-2 border-amber-500 shrink-0 shadow-sm relative overflow-hidden">
             {/* Ngôi sao đỏ nhỏ giả lập */}
             <div className="text-red-600 text-2xl leading-none font-bold">★</div>
          </div>
          
          <div>
            <div className="text-sm sm:text-xl md:text-2xl font-bold uppercase tracking-wide flex items-center gap-2.5">
              HỆ THỐNG TRUY XUẤT NGUỒN GỐC VÀ GIÁM SÁT CHUỖI LẠNH NÔNG SẢN
            </div>
          </div>
        </Link>
      </div>

      {/* Navbar Nền Trắng */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Cụm Link Bờ Trái */}
          <nav className="flex items-center gap-1 sm:gap-2 h-full text-[13px] sm:text-sm font-medium">
            <Link 
              to="/" 
              className={`px-3 sm:px-4 py-2 rounded-md transition-colors ${isHome ? 'bg-[#edf5eb] text-[#1b5e20] font-bold' : 'text-slate-600 hover:text-[#1b5e20] hover:bg-slate-50'}`}
            >
              Trang chủ
            </Link>
            <Link 
              to="/providers" 
              className={`px-3 sm:px-4 py-2 rounded-md transition-colors ${location.pathname === '/providers' ? 'bg-[#edf5eb] text-[#1b5e20] font-bold' : 'text-slate-600 hover:text-[#1b5e20] hover:bg-slate-50'}`}
            >
              Đơn vị cung cấp giải pháp
            </Link>
            <Link 
              to="/about" 
              className={`hidden md:block px-3 sm:px-4 py-2 rounded-md transition-colors ${location.pathname === '/about' ? 'bg-[#edf5eb] text-[#1b5e20] font-bold' : 'text-slate-600 hover:text-[#1b5e20] hover:bg-slate-50'}`}
            >
              Giới thiệu
            </Link>
          </nav>

          {/* Nút hành động Bờ Phải */}
          <div className="flex items-center gap-2">
            {!isHome && (
               <Link
                 to="/"
                 className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-[#1b5e20] hover:bg-slate-100 rounded transition-colors"
               >
                 <Search size={14} className="text-[#1b5e20]" />
                 <span>Tra cứu lô hàng</span>
               </Link>
            )}

            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white bg-[#1b5e20] hover:bg-[#144d18] rounded shadow-sm transition-colors"
                >
                  <LayoutDashboard size={14} />
                  <span className="hidden sm:inline">Bàn làm việc</span>
                </Link>
                <button
                  onClick={logout}
                  title="Đăng xuất"
                  className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-[#1b5e20] border border-[#1b5e20] hover:bg-[#edf5eb] rounded transition-colors"
              >
                <User size={14} />
                <span className="hidden sm:inline">Đăng nhập Quản trị</span>
                <span className="sm:hidden">Đăng nhập</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
