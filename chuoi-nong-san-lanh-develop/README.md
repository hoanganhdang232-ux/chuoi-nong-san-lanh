# Agritrace Demo

Demo truy xuất nguồn gốc và giám sát chuỗi lạnh nông sản.

## Công nghệ

- Backend: Node.js, Express, SQLite, JWT
- Frontend: React, Vite, Tailwind CSS
- Mật khẩu: bcrypt
- Chuỗi hash: SHA-256

## Chạy nhanh

```bash
npm install
npm run dev
```

Mặc định:

- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- API health: http://localhost:3001/api/health

## Staging trên Render

Staging dùng một Render Web Service để phục vụ frontend và API cùng domain, với persistent disk cho SQLite. Tạo service từ `render.yaml` trên Render và kết nối repo này. Trong Settings của service, tạo Deploy Hook rồi lưu URL đó trong GitHub repository secret `RENDER_DEPLOY_HOOK_URL`.

Workflow CI chạy lint, test và build trên pull request cũng như khi push lên `main`. Khi CI của một commit trên `main` thành công, GitHub Actions gọi Deploy Hook để cập nhật staging. Hãy đặt check `Lint, test, and build` thành required status check trong branch protection của `main` nếu muốn chặn merge khi CI đỏ.

## Tài khoản demo

- Auditor: auditor@agritrace.demo / Auditor@123
- Farm admin: farm@agritrace.demo / Farm@123
- Processor admin: processor@agritrace.demo / Processor@123
- Distributor admin: distributor@agritrace.demo / Distributor@123
- Farmer: user@agritrace.demo / User@123

Nút Farmer trên màn hình đăng nhập dùng tài khoản demo Farmer; Quản trị viên dùng Farm admin.

## Modules demo

- Giám sát chuỗi lạnh: giả lập 8 mẫu cảm biến, cảnh báo khi nhiệt độ trên 8°C liên tục quá 30 phút; khoảng trống cảm biến trên 10 phút ngắt chuỗi.
- Thu hồi: truy xuôi qua quan hệ tách/gộp, cập nhật trạng thái mọi lô liên quan, lập báo cáo tồn tại kho/điểm bán và thông báo nội bộ.
- Public trace: mở `http://localhost:5173/trace/BATCH-THA-2026-0001-F1`; không yêu cầu đăng nhập. API chỉ trả trường công khai đã whitelist, không trả giá, khối lượng nội bộ, đối tác hoặc dữ liệu cá nhân.
- Báo cáo: xuất JSON chứa phả hệ, lịch sử, dữ liệu nhiệt độ và kết quả xác minh hash chain tại thời điểm xuất. Auditor có quyền toàn hệ thống; Quản trị viên chỉ xem lô thuộc tổ chức.

## Seed lại dữ liệu demo

```bash
npm run db:reset --workspace backend
```

Lệnh này xóa và tạo lại database demo, bao gồm một phả hệ 3 tầng với 12 lô, lịch sử nhiệt độ và sự kiện mẫu. Không chạy trên database chứa dữ liệu cần giữ.

Để chỉ bổ sung dataset phả hệ 12 lô vào database demo hiện tại mà không xóa dữ liệu:

```bash
npm run db:seed-features --workspace backend
```

Lệnh seed bổ sung có tính idempotent và chỉ tạo một lần.

## Chức năng chính

- Đăng nhập, khóa tài khoản sau 5 lần sai trong 15 phút
- Phân quyền theo tổ chức và vai trò
- Quản lý trang trại, thửa đất, sản phẩm, lô hàng
- Ghi sự kiện vào event log với chuỗi hash
- Dashboard tổng quan theo quyền truy cập
- Theo dõi nhiệt độ, phát hiện vi phạm liên tục, quản lý thu hồi và báo cáo auditor
