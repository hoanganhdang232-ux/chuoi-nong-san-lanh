# QUY TRÌNH ỨNG PHÓ SỰ CỐ & SAO LƯU PHỤC HỒI CSDL (DISASTER RECOVERY PLAN)
**Dự án:** Hệ thống Truy xuất Nguồn gốc & Giám sát Chuỗi lạnh Nông sản Agritrace  
**Tiêu chuẩn tuân thủ:** ISO/IEC 27001, Nghị định 13/2023/NĐ-CP & TCVN ISO 22005  
**Phiên bản:** 1.0 (Sprint 8)

---

## 1. MỤC TIÊU PHỤC HỒI (RTO & RPO)
| Chỉ số | Mục tiêu cam kết | Mô tả chi tiết |
| :--- | :--- | :--- |
| **RTO (Recovery Time Objective)** | **< 15 phút** | Thời gian tối đa để hệ thống khôi phục hoàn toàn từ khi phát hiện sự cố đến khi vận hành bình thường. |
| **RPO (Recovery Point Objective)** | **< 1 giờ** | Mức độ mất mát dữ liệu tối đa chấp nhận được (dữ liệu được sao lưu định kỳ và snapshot liên tục). |

---

## 2. CHIẾN LƯỢC SAO LƯU TỰ ĐỘNG (T-136)
1. **Lịch trình thực thi:**
   - **Định kỳ hàng ngày (02:00 AM):** Cronjob tự động snapshot toàn bộ CSDL và nén thành tệp `.db.gz`.
   - **Xoay vòng (Retention Policy):** Lưu trữ 30 ngày gần nhất tại thư mục `/backups` và đẩy bản sao thứ cấp lên Cloud Storage (MinIO / AWS S3).
2. **Cơ chế đảm bảo an toàn:**
   - Sử dụng cơ chế nén tối ưu `gzip level 9` để giảm thiểu 80% dung lượng lưu trữ.
   - Tạo mã băm kiểm tra toàn vẹn **SHA-256** đính kèm (`.sha256`) cho mỗi bản sao lưu để chống lỗi truyền tải hoặc can thiệp trái phép.
3. **Các lệnh sao lưu:**
   - **Windows PowerShell:**
     ```powershell
     powershell -File ./scripts/backup_db.ps1
     ```
   - **Linux / Docker:**
     ```bash
     bash ./scripts/backup_db.sh
     ```
   - **Node.js (Đa nền tảng):**
     ```bash
     node ./scripts/backup_db.js
     ```

---

## 3. QUY TRÌNH PHỤC HỒI THẢM HỌA (DISASTER RECOVERY RUNBOOK - T-137)

### Bước 1: Đánh giá & Cách ly sự cố
- Ngay khi phát hiện CSDL bị lỗi hoặc có dấu hiệu can thiệp (từ cảnh báo của **System Integrity Worker**), quản trị viên tạm ngắt kết nối ghi để bảo vệ hiện trường.

### Bước 2: Chọn bản sao lưu chuẩn
- Kiểm tra danh sách bản sao lưu trong `backups/backup_manifest.json` hoặc chọn bản mới nhất `latest`.

### Bước 3: Thực thi lệnh phục hồi
- Script phục hồi sẽ tự động thực hiện 4 thao tác an toàn:
  1. Kiểm tra mã Checksum SHA-256 của tệp nén.
  2. Tạo bản chụp an toàn dự phòng (Safety Snapshot) của CSDL hiện tại.
  3. Giải nén và nạp dữ liệu sạch vào CSDL đích.
  4. Chạy `PRAGMA integrity_check` để xác nhận cấu trúc dữ liệu khỏe mạnh.

- **Thực thi trên Windows:**
  ```powershell
  # Khôi phục bản mới nhất
  powershell -File ./scripts/restore_db.ps1 -BackupFile latest

  # Hoặc chỉ định tệp cụ thể
  powershell -File ./scripts/restore_db.ps1 -BackupFile ./backups/agritrace_backup_20261020_120000.db.gz
  ```

- **Thực thi trên Linux / Docker:**
  ```bash
  bash ./scripts/restore_db.sh latest
  ```

### Bước 4: Kiểm tra xác minh sau khôi phục
- Chạy lệnh kiểm tra tính toàn vẹn Hash Chain hệ thống:
  ```bash
  curl -X POST http://localhost:3001/api/v1/system/run-integrity-check -H "Authorization: Bearer <TOKEN>"
  ```
- Kiểm tra API Health: `http://localhost:3001/api/health` -> Trả về `{"status":"ok","database":"ok"}`.

---

## 4. BẢO VỆ DỮ LIỆU CÁ NHÂN THEO NGHỊ ĐỊNH 13/2023/NĐ-CP
- Toàn bộ các bản sao lưu tuân thủ quy định bảo mật dữ liệu cá nhân:
  - Thông tin nông hộ đã được ẩn danh (Pseudonymized) bằng hệ thống bảo vệ độc lập.
  - Thuật toán Hash Chain bảo toàn tính liên tục của các khối băm mà không lưu trữ trực tiếp thông tin PII nhạy cảm trong payload cốt lõi.
