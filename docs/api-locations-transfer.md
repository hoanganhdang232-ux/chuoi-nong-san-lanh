# Tài liệu Đặc tả Kỹ thuật & API: Quản lý Cửa hàng & Điều chuyển Lô hàng Nội bộ

Tài liệu này đặc tả chi tiết kiến trúc dữ liệu, luồng nghiệp vụ và danh sách các API phục vụ hai tính năng:
- **SUBTASK 1 (T-64)**: Quản lý danh sách địa điểm / cửa hàng nội bộ trực thuộc Nhà phân phối (NPP).
- **SUBTASK 2 (T-65)**: Điều chuyển / phân bổ lô hàng từ kho tổng về từng cửa hàng bán lẻ nội bộ.

---

## 1. Thiết kế Cơ sở Dữ liệu (Database Schema)

### 1.1. Bảng `locations` (Cửa hàng & Điểm nhận hàng)
Lưu trữ thông tin các chi nhánh, cửa hàng bán lẻ thuộc quyền quản lý của tổ chức (NPP).

| Trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Định danh duy nhất |
| `organization_id` | INTEGER | NOT NULL, FK -> organizations(id) | Tổ chức sở hữu (đảm bảo multi-tenancy) |
| `code` | TEXT | NOT NULL UNIQUE | Mã định danh cửa hàng (VD: `CH-BD-01`, `CH-001`) |
| `name` | TEXT | NOT NULL | Tên cửa hàng/điểm bán |
| `address` | TEXT | NULLABLE | Địa chỉ chi tiết cửa hàng |
| `phone` | TEXT | NULLABLE | Số điện thoại liên hệ |
| `status` | TEXT | NOT NULL DEFAULT 'Active' | Trạng thái hoạt động (`Active` / `Inactive`) |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo |
| `updated_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật cuối |

### 1.2. Bảng `internal_batch_transfers` (Lịch sử Lệnh Điều chuyển Nội bộ)
Lưu trữ toàn bộ lịch sử các lệnh điều chuyển lô hàng từ kho tổng về các cửa hàng.

| Trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Khóa chính |
| `transfer_code` | TEXT | NOT NULL UNIQUE | Mã lệnh chuyển duy nhất (`TRF-INT-YYYYMMDD-XXXX`) |
| `source_batch_id` | INTEGER | NOT NULL, FK -> batches(id) | Lô hàng nguồn tại kho tổng |
| `target_batch_id` | INTEGER | NULLABLE, FK -> batches(id) | Lô con mới được tạo tại cửa hàng |
| `location_id` | INTEGER | NOT NULL, FK -> locations(id) | Cửa hàng tiếp nhận lô hàng |
| `organization_id` | INTEGER | NOT NULL, FK -> organizations(id) | Đơn vị sở hữu |
| `quantity` | REAL | NOT NULL | Khối lượng chuyển (kg) |
| `status` | TEXT | NOT NULL DEFAULT 'completed' | Trạng thái giao dịch (`completed`) |
| `note` | TEXT | NULLABLE | Ghi chú điều chuyển |
| `actor_id` | INTEGER | NOT NULL, FK -> users(id) | Người thực hiện lệnh |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | Thời gian điều chuyển |

---

## 2. Danh sách API Đặc tả (API Specifications)

### 2.1. Nhóm API Quản lý Cửa hàng (T-64)

#### `GET /api/v1/locations`
Lấy danh sách các cửa hàng / địa điểm trực thuộc tổ chức đang đăng nhập kèm thống kê số lượng lô hàng và tổng tồn kho hiện tại.

- **Quyền truy cập:** `farm_admin`, `processor_admin`, `distributor_admin`, `auditor`.
- **Query Parameters (tùy chọn):**
  - `status`: Lọc theo trạng thái (`Active` hoặc `Inactive`).
  - `search`: Tìm kiếm theo mã cửa hàng, tên hoặc địa chỉ.
- **Response mẫu (HTTP 200):**
```json
[
  {
    "id": 1,
    "organization_id": 3,
    "code": "CH-BD-01",
    "name": "Cửa hàng Ba Đình",
    "address": "12 Kim Mã, Ba Đình, Hà Nội",
    "phone": "02437890123",
    "status": "Active",
    "created_at": "2026-10-19 10:00:00",
    "updated_at": "2026-10-19 10:00:00",
    "batch_count": 2,
    "total_inventory": 350.0
  }
]
```

#### `POST /api/v1/locations`
Thêm mới một cửa hàng / địa điểm vào hệ thống.

- **Quyền truy cập:** Quản trị viên tổ chức (`distributor_admin`, `farm_admin`, `processor_admin`).
- **Request Body:**
```json
{
  "code": "CH-TX-01",
  "name": "Cửa hàng Thanh Xuân",
  "address": "100 Nguyễn Trãi, Thanh Xuân, Hà Nội",
  "phone": "02431239999",
  "status": "Active"
}
```
*Ghi chú: Nếu `code` để trống, hệ thống sẽ tự động sinh mã dạng `CH-xxx`.*
- **Response mẫu (HTTP 201):**
```json
{
  "message": "Tạo địa điểm thành công.",
  "location": {
    "id": 4,
    "organization_id": 3,
    "code": "CH-TX-01",
    "name": "Cửa hàng Thanh Xuân",
    "address": "100 Nguyễn Trãi, Thanh Xuân, Hà Nội",
    "phone": "02431239999",
    "status": "Active",
    "created_at": "2026-10-19 11:00:00",
    "updated_at": "2026-10-19 11:00:00"
  }
}
```

#### `PUT /api/v1/locations/:id`
Cập nhật thông tin cửa hàng.

- **Request Body:**
```json
{
  "name": "Cửa hàng Thanh Xuân Premium",
  "address": "102 Nguyễn Trãi, Thanh Xuân, Hà Nội",
  "phone": "0988776655",
  "status": "Active"
}
```
- **Response mẫu (HTTP 200):**
```json
{
  "message": "Cập nhật địa điểm thành công.",
  "location": {
    "id": 4,
    "code": "CH-TX-01",
    "name": "Cửa hàng Thanh Xuân Premium",
    "address": "102 Nguyễn Trãi, Thanh Xuân, Hà Nội",
    "phone": "0988776655",
    "status": "Active",
    "updated_at": "2026-10-19 11:05:00"
  }
}
```

#### `DELETE /api/v1/locations/:id`
Xóa cửa hàng hoặc chuyển sang trạng thái `Inactive` nếu cửa hàng đã có dữ liệu giao dịch điều chuyển.

- **Response mẫu (HTTP 200):**
```json
{
  "message": "Xóa địa điểm thành công.",
  "deleted": true,
  "id": 4
}
```

---

### 2.2. Nhóm API Điều chuyển Lô hàng Nội bộ (T-65)

#### `POST /api/v1/batches/transfer`
Tiếp nhận và xử lý lệnh điều chuyển lô hàng từ kho tổng về cửa hàng nội bộ.

- **Quyền truy cập:** `distributor_admin`, `farm_admin`, `processor_admin`.
- **Cơ chế hoạt động:**
  1. Kiểm tra quyền sở hữu lô hàng và trạng thái khả dụng (chưa bị thu hồi, chưa tiêu thụ hết).
  2. Kiểm tra điều kiện số lượng: `tổng_chuyển <= tồn_kho_kho_tổng`.
  3. Kiểm tra cửa hàng nhận: phải tồn tại, thuộc cùng tổ chức và có trạng thái `Active`.
  4. Thực thi Transaction nguyên tử (Atomic Database Transaction):
     - Trừ tồn kho tại lô gốc ở kho tổng.
     - Khởi tạo lô con mới gán cho cửa hàng nhận kèm khối lượng nhận được.
     - Ghi nhận liên kết phả hệ cha-con (`batch_relations` loại `split`).
     - Lưu giao dịch vào bảng `internal_batch_transfers`.
     - Ký số và ghi nhận sự kiện chuỗi khối SHA-256 (`event_logs`) cho cả lô gốc và lô con.
- **Request Body (Hỗ trợ cả chuyển đơn lẻ hoặc chia nhiều cửa hàng cùng lúc):**
```json
{
  "batch_id": 12,
  "location_id": 1,
  "quantity": 25.5,
  "note": "Điều chuyển đợt 1 về cửa hàng Ba Đình"
}
```
*Hoặc cấu trúc phân bổ đa điểm bán:*
```json
{
  "batch_id": 12,
  "allocations": [
    { "location_id": 1, "quantity": 15.0 },
    { "location_id": 2, "quantity": 10.5 }
  ],
  "note": "Điều chuyển phân bổ cho 2 điểm bán nội thành"
}
```
- **Response mẫu (HTTP 200):**
```json
{
  "success": true,
  "message": "Đã điều chuyển thành công 25.5 kg từ kho tổng tới 2 cửa hàng.",
  "source_batch": {
    "id": 12,
    "batch_code": "BATCH-2026-0012",
    "remaining_quantity": 74.5
  },
  "total_transferred_quantity": 25.5,
  "remaining_quantity": 74.5,
  "children": [
    {
      "id": 35,
      "batch_code": "BATCH-2026-0012-CHBD01-A1F2",
      "initial_quantity": 15.0,
      "remaining_quantity": 15.0,
      "location_id": 1,
      "current_location": "Cửa hàng Ba Đình",
      "status": "active"
    }
  ]
}
```

#### `GET /api/v1/batches/transfers`
Truy vấn danh sách và lịch sử các lệnh điều chuyển lô hàng nội bộ.

- **Query Parameters (tùy chọn):**
  - `batch_id`: Lọc theo ID lô hàng nguồn hoặc lô con.
  - `location_id`: Lọc theo ID cửa hàng nhận.
  - `limit`, `offset`: Phân trang.
- **Response mẫu (HTTP 200):**
```json
[
  {
    "id": 8,
    "transfer_code": "TRF-INT-20261019-8F21",
    "source_batch_id": 12,
    "target_batch_id": 35,
    "source_batch_code": "BATCH-2026-0012",
    "target_batch_code": "BATCH-2026-0012-CHBD01-A1F2",
    "product_name": "Bắp cải sạch",
    "product_unit": "kg",
    "location_id": 1,
    "location_code": "CH-BD-01",
    "location_name": "Cửa hàng Ba Đình",
    "location_address": "12 Kim Mã, Ba Đình, Hà Nội",
    "quantity": 15.0,
    "actor_name": "Distributor Admin",
    "note": "Điều chuyển đợt 1 về cửa hàng Ba Đình",
    "status": "completed",
    "created_at": "2026-10-19 11:20:00"
  }
]
```

---

## 3. Giao diện Người dùng (UI Frontend)

Giao diện quản lý cửa hàng và phân phối lô hàng tại `frontend/src/components/LocationsView.jsx` cung cấp:
1. **Quản lý danh sách cửa hàng (T-64)**:
   - Danh sách bảng đầy đủ thông tin: Mã CH, Tên, Địa chỉ, SĐT, Trạng thái hoạt động, Số lô và Tồn kho tại điểm.
   - Thanh tìm kiếm và bộ lọc trạng thái (Đang hoạt động / Tạm dừng).
   - Modal Thêm/Sửa thông tin cửa hàng trực quan.
2. **Form điều chuyển lô hàng về cửa hàng nội bộ (T-65)**:
   - Cho phép chọn lô nguồn, kiểm tra tồn kho theo thời gian thực.
   - Chọn cửa hàng tiếp nhận và nhập số lượng phân bổ (hỗ trợ chuyển cho 1 cửa hàng hoặc nhiều cửa hàng, không có cảnh báo ép buộc tối thiểu 2 cửa hàng).
   - Kiểm tra điều kiện số lượng chuyển không vượt quá tồn kho kho tổng.
   - Modal thông báo kết quả chi tiết kèm mã lô con mới tạo.
3. **Màn hình lịch sử điều chuyển lô hàng**:
   - Tab "Lịch sử Điều chuyển Nội bộ" hiển thị mã lệnh, ngày giờ, lô nguồn, lô đích, cửa hàng nhận, số lượng, người thực hiện và trạng thái giao dịch.
