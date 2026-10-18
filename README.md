# Agritrace Demo

Demo truy xuất nguồn gốc và giám sát chuỗi lạnh nông sản.

## Công nghệ

- Backend: Node.js, Express, SQLite, Argon2id, server-side sessions
- Frontend: React, Vite, Tailwind CSS
- Mật khẩu: Argon2id (tự nâng cấp hash bcrypt cũ sau lần đăng nhập thành công)
- Chuỗi hash: SHA-256

## Chạy nhanh

```bash
npm install
npm run dev
```

Chạy bản production bằng Docker (SQLite được lưu trong volume để không mất dữ liệu khi container khởi động lại):

```bash
docker compose up --build
```

Đặt `JWT_SECRET` trong file `.env` trước khi chạy Docker Compose. Dự án hiện chủ động dùng SQLite; `DATABASE_PATH` là đường dẫn tương đối bên trong thư mục `backend`.

Mặc định:

- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- API health: http://localhost:3001/api/health

## Staging trên Render

Staging dùng một Render Web Service để phục vụ frontend và API cùng domain, với persistent disk cho SQLite. Tạo service từ `render.yaml` trên Render và kết nối repo này. Trong Settings của service, tạo Deploy Hook rồi lưu URL đó trong GitHub repository secret `RENDER_DEPLOY_HOOK_URL`.

## CI/CD & Bảo vệ nhánh chính (T-03 & T-04)

### T-03: Pipeline CI chạy build, lint, test trên mỗi push
Workflow tại `.github/workflows/ci.yml` tự động kích hoạt trên **mỗi sự kiện push** và **pull request**. Các bước bao gồm:
1. `npm ci`: Cài đặt dependencies chuẩn xác theo `package-lock.json`.
2. `npm run lint`: Kiểm tra chất lượng mã nguồn backend và frontend qua ESLint.
3. `npm run build`: Build gói ứng dụng frontend Vite để kiểm tra không có lỗi bundle.
4. `npm test`: Chạy toàn bộ test suites backend (22 tests kiểm thử nghiệp vụ, xác thực, phả hệ, chuỗi hash).

### T-04: Luật bảo vệ nhánh chính (`main`)
Để đảm bảo chỉ code đạt chuẩn mới được đưa vào nhánh chính (`main`), cấu hình Branch Protection Rule trên GitHub:

**Cách 1: Cấu hình qua giao diện GitHub Web**
1. Mở trang [Settings > Branches](https://github.com/hoanganhdang232-ux/chuoi-nong-san-lanh/settings/branches) của repository.
2. Bấm **Add branch protection rule** (hoặc chọn rule cho branch `main`).
3. Đặt **Branch name pattern**: `main`.
4. Tích chọn **Require a pull request before merging**:
   - Tích chọn **Require approvals** và đặt số người duyệt là **1**.
5. Tích chọn **Require status checks to pass before merging**:
   - Tích chọn **Require branches to be up to date before merging**.
   - Tìm và chọn status check: `Lint, test, and build` (từ workflow CI).
6. Tích chọn **Do not allow force pushes** và **Do not allow deletions**.
7. Bấm **Create** / **Save changes**.

**Cách 2: Sử dụng script tự động**
Nếu có GitHub Personal Access Token (`repo` scope):
```powershell
$env:GITHUB_TOKEN = "ghp_xxxx..."
.\scripts\setup-branch-protection.ps1
```

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
Đáp án phả hệ đếm tay độc lập để đối chiếu seed nằm tại
[`backend/src/db/seedFeatures.expected.md`](backend/src/db/seedFeatures.expected.md).

## Chức năng chính

- Đăng nhập, khóa tài khoản sau 5 lần sai trong 15 phút
- Phân quyền theo tổ chức và vai trò
- Quản lý trang trại, thửa đất, sản phẩm, lô hàng
- Ghi sự kiện vào event log với chuỗi hash
- Dashboard tổng quan theo quyền truy cập
- Theo dõi nhiệt độ, phát hiện vi phạm liên tục, quản lý thu hồi và báo cáo auditor
