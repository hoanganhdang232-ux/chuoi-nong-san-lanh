#!/usr/bin/env bash
# ==============================================================================
# SCRUM Sprint 8 - Automated Database Backup Script (Bash / Linux / Docker) (T-136)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="${DB_PATH:-$ROOT_DIR/backend/src/data/agritrace.db}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

echo "=========================================================="
echo " [AGRITRACE] BẮT ĐẦU QUY TRÌNH SAO LƯU CSDL TỰ ĐỘNG"
echo "=========================================================="

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "LỖI: Không tìm thấy tệp CSDL tại '$DB_PATH'" >&2
  exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/agritrace_backup_${TIMESTAMP}.db.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

# Thực hiện nén gzip an toàn
gzip -c9 "$DB_PATH" > "$BACKUP_FILE"

# Tính toán Checksum SHA-256
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$BACKUP_FILE" > "$CHECKSUM_FILE"
fi

# Tự động xóa các bản sao lưu cũ hơn $RETENTION_DAYS ngày
find "$BACKUP_DIR" -type f -name "agritrace_backup_*.db.gz*" -mtime +"$RETENTION_DAYS" -exec rm -f {} +

echo ">> [SUCCESS] Hoàn tất sao lưu CSDL: $BACKUP_FILE"
