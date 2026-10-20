# ==============================================================================
# SCRUM Sprint 8 - Disaster Recovery Database Restore Script (PowerShell / Windows) (T-137)
# ==============================================================================
param(
  [string]$BackupFile = "latest",
  [string]$DbPath = "$PSScriptRoot/../backend/src/data/agritrace.db"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [AGRITRACE] KHỞI CHẠY QUY TRÌNH PHỤC HỒI CSDL (DISASTER RECOVERY)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# Thực thi khôi phục qua script Node.js
node "$PSScriptRoot/restore_db.js" "$BackupFile"

if ($LASTEXITCODE -eq 0) {
  Write-Host ">> [SUCCESS] Khôi phục CSDL hoàn tất an toàn!" -ForegroundColor Green
} else {
  Write-Error ">> [FAILED] Quá trình khôi phục gặp lỗi! Vui lòng kiểm tra lại tệp sao lưu."
}
