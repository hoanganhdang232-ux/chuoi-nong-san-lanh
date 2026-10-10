import { useState } from "react";
import { useNavigate } from "react-router-dom";
import NationalHeader from "../components/NationalHeader.jsx";
import {
  Search,
  QrCode,
  ShieldCheck,
  ThermometerSnowflake,
  Truck,
  Sprout,
  Store,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";

export default function PublicPortalPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searchError, setSearchError] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e?.preventDefault();
    const code = searchInput.trim();
    if (!code) {
      setSearchError("Vui lòng nhập mã lô hàng hoặc mã QR cần tra cứu.");
      return;
    }
    setSearchError("");
    navigate(`/trace/${encodeURIComponent(code)}`);
  };

  const handleQuickSelect = (code) => {
    setSearchInput(code);
    navigate(`/trace/${encodeURIComponent(code)}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <NationalHeader />

      {/* Hero Banner Section */}
      <section className="bg-gradient-to-b from-brand-900 to-brand-800 text-white py-12 px-4 sm:px-6 relative overflow-hidden border-b border-brand-700">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-4 border border-white/15">
            <Sparkles size={14} /> Cổng tra cứu công khai trực tuyến
          </div>
          
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white mb-3">
            Tra cứu Nguồn gốc Nông sản & Giám sát Chuỗi lạnh
          </h1>
          <p className="text-sm sm:text-base text-brand-100 max-w-2xl mx-auto mb-8 font-normal">
            Minh bạch toàn diện hành trình từ nông trại, cơ sở chế biến, xe vận chuyển lạnh có cảm biến IoT cho đến điểm phân phối.
          </p>

          {/* Search Box - To, Rõ, Dễ Thao Tác Cho Người Mới */}
          <div className="max-w-2xl mx-auto bg-white p-2.5 sm:p-3 rounded-xl shadow-lg border border-slate-200 text-slate-800">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Nhập mã lô hàng (VD: BATCH-THA-2026-0001)..."
                  className="w-full pl-10 pr-4 py-3 text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg text-sm sm:text-base outline-none focus:border-brand-700 focus:bg-white focus:ring-2 focus:ring-brand-700/20 transition-all"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-800 hover:bg-brand-900 text-white font-semibold rounded-lg shadow transition-all active:scale-95 text-sm sm:text-base"
              >
                <Search size={18} />
                <span>Tra cứu ngay</span>
              </button>
            </form>

            {searchError && (
              <p className="mt-2 text-left text-xs sm:text-sm text-rose-600 font-medium pl-1">
                {searchError}
              </p>
            )}

            {/* Quick Demo Links Cho Người Mới Thao Tác Nhanh */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs text-slate-600 text-left">
              <span className="font-semibold text-slate-700 shrink-0">Lô mẫu thử nghiệm:</span>
              <button
                type="button"
                onClick={() => handleQuickSelect("BATCH-THA-2026-0001")}
                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded font-medium border border-emerald-200 transition-colors"
              >
                🍉 Dưa hấu đỏ (BATCH-THA-2026-0001)
              </button>
              <button
                type="button"
                onClick={() => handleQuickSelect("BATCH-TRACE-DEMO-2026-ROOT")}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-medium border border-slate-200 transition-colors"
              >
                📦 Lô chuỗi lạnh mẫu (DEMO-ROOT)
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Thống Kê Nhanh (Key Indicators) */}
      <section className="bg-white border-b border-slate-200 py-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="text-2xl sm:text-3xl font-extrabold text-brand-800">100%</div>
            <div className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">Mã hoá chuỗi khối SHA-256</div>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700">2°C – 8°C</div>
            <div className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">Chuẩn kiểm soát chuỗi lạnh</div>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="text-2xl sm:text-3xl font-extrabold text-blue-700">TCVN 12850</div>
            <div className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">Tiêu chuẩn quốc gia truy xuất</div>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-700">Real-time</div>
            <div className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">Giám sát cảm biến tự động</div>
          </div>
        </div>
      </section>

      {/* Quy trình Chuỗi Lạnh 4 Bước Dễ Hiểu Cho Người Mới */}
      <section className="max-w-6xl mx-auto py-12 px-4 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Hành Trình Chuỗi Cung Ứng & Giám Sát Chuỗi Lạnh
          </h2>
          <p className="text-slate-600 text-sm mt-1 max-w-xl mx-auto">
            Mỗi công đoạn được ghi nhận sự kiện minh bạch và bảo vệ tính toàn vẹn dữ liệu.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Bước 1 */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:border-brand-600 transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 font-bold text-base">
                1
              </span>
              <Sprout className="text-emerald-700" size={24} />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">Vùng trồng & Thu hoạch</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Nông dân khai báo thửa đất, nhật ký thu hoạch, số lượng và toạ độ GPS chính xác tại vườn.
            </p>
          </div>

          {/* Bước 2 */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:border-brand-600 transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-800 font-bold text-base">
                2
              </span>
              <ShieldCheck className="text-blue-700" size={24} />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">Sơ chế & Kiểm định</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Hợp tác xã phân loại, đóng gói, gắn mã định danh GS1 và xác thực an toàn vệ sinh thực phẩm.
            </p>
          </div>

          {/* Bước 3 */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:border-brand-600 transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 text-cyan-800 font-bold text-base">
                3
              </span>
              <ThermometerSnowflake className="text-cyan-700" size={24} />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">Vận chuyển lạnh IoT</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Xe tải chuyên dụng giám sát nhiệt độ liên tục (2°C–8°C). Bật cảnh báo ngay nếu xảy ra vi phạm.
            </p>
          </div>

          {/* Bước 4 */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:border-brand-600 transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-800 font-bold text-base">
                4
              </span>
              <Store className="text-amber-700" size={24} />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">Phân phối & Người dùng</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Cửa hàng, siêu thị và người tiêu dùng quét mã QR để tra cứu toàn bộ hồ sơ điện tử minh bạch.
            </p>
          </div>
        </div>
      </section>

      {/* Hướng Dẫn Nhanh & Lợi Ích */}
      <section className="bg-slate-100 py-10 px-4 sm:px-6 mt-auto border-t border-slate-200">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Dành cho Đơn vị / Cơ sở sản xuất & Kiểm định</h3>
            <p className="text-slate-600 text-sm mt-1 max-w-2xl">
              Nếu bạn là Nông dân, Cơ sở Sơ chế, Đơn vị Vận chuyển hoặc Thanh tra viên, vui lòng truy cập hệ thống quản trị để nhập liệu và giám sát lô hàng.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-800 hover:bg-brand-900 text-white font-semibold rounded-lg text-sm shadow transition-all"
          >
            <span>Vào hệ thống quản lý tác nghiệp</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* Footer Chuẩn Cơ Quan Nhà Nước */}
      <footer className="bg-brand-950 text-slate-300 py-6 px-4 sm:px-6 text-xs border-t border-brand-900">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="font-bold text-white uppercase tracking-wider">
              BỘ NÔNG NGHIỆP VÀ PHÁT TRIỂN NÔNG THÔN
            </div>
            <div className="text-slate-400 mt-0.5">
              Cổng thông tin Truy xuất nguồn gốc nông sản và Giám sát chuỗi lạnh Quốc gia
            </div>
          </div>
          <div className="text-slate-400 text-center sm:text-right">
            Đề tài Nghiên cứu Thực tập cơ sở · Công nghệ Chuỗi khối & IoT Cold Chain
          </div>
        </div>
      </footer>
    </div>
  );
}
