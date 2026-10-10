# Agritrace — các liên kết cần thiết

## Trang điều khiển liên kết

Mở [quick-links.html](./quick-links.html) bằng trình duyệt để có các nút mở nhanh toàn bộ link của dự án.

## 1. Khởi động web

Mở PowerShell tại thư mục dự án:

```powershell
cd "C:\Users\Admin\Desktop\du-an-agritrace2"
npm run dev
```

Giữ cửa sổ PowerShell này mở trong khi dùng web. Lệnh này khởi động cả frontend và backend.

## 2. Liên kết local

| Mục đích | Liên kết |
|---|---|
| Ứng dụng web | [http://localhost:5173](http://localhost:5173) |
| Màn hình đăng nhập | [http://localhost:5173/login](http://localhost:5173/login) |
| API kiểm tra trạng thái | [http://localhost:3001/api/health](http://localhost:3001/api/health) |
| Trang truy xuất mẫu | [http://localhost:5173/trace/BATCH-THA-2026-0001-F1](http://localhost:5173/trace/BATCH-THA-2026-0001-F1) |

## 3. Trang truy xuất theo mã lô

Thay `MA_LO` bằng mã lô cần xem:

```text
http://localhost:5173/trace/MA_LO
```

Ví dụ:

[http://localhost:5173/trace/BATCH-THA-2026-0001](http://localhost:5173/trace/BATCH-THA-2026-0001)

## 4. Tài khoản demo

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Auditor | `auditor@agritrace.demo` | `Auditor@123` |
| Farm admin | `farm@agritrace.demo` | `Farm@123` |
| Processor admin | `processor@agritrace.demo` | `Processor@123` |
| Distributor admin | `distributor@agritrace.demo` | `Distributor@123` |
| Farmer | `user@agritrace.demo` | `User@123` |

Màn hình đăng nhập cũng có nút chọn nhanh tài khoản demo.

## 5. Dừng web

Trong cửa sổ PowerShell đang chạy web, nhấn:

```text
Ctrl + C
```

## 6. Nếu dữ liệu demo bị thay đổi

Đặt lại toàn bộ database demo:

```powershell
npm run db:reset --workspace backend
```

Lệnh này xóa dữ liệu hiện tại và tạo lại dữ liệu mẫu. Chỉ dùng khi bạn muốn làm mới database demo.
