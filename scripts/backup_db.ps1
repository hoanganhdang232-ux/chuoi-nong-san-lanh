# ==============================================================================
# SCRUM Sprint 8 - Automated Database Backup Script (PowerShell / Windows) (T-136)
# ==============================================================================
param(
  [string]$DbPath = "$PSScriptRoot/../backend/src/data/agritrace.db",
  [string]$BackupDir = "$PSScriptRoot/../backups",
  [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [AGRITRACE] BẮT ĐẦU QUY TRÌNH SAO LƯU CSDL TỰ ĐỘNG" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Test-Path $DbPath)) {
  Write-Error "Không tìm thấy CSDL tại đường dẫn: $DbPath"
}

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFileName = "agritrace_backup_$Timestamp.db.gz"
$BackupFilePath = Join-Path $BackupDir $BackupFileName
$ChecksumPath = "$BackupFilePath.sha256"

# Gọi qua Node.js backup core
node "$PSScriptRoot/backup_db.js"

if ($LASTEXITCODE -eq 0) {
  Write-Host ">> [SUCCESS] Sao lưu CSDL thành công!" -ForegroundColor Green
} else {
  Write-Error ">> [FAILED] Quá trình sao lưu CSDL gặp sự cố!"
}
