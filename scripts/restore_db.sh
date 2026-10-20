#!/usr/bin/env bash
# ==============================================================================
# SCRUM Sprint 8 - Disaster Recovery Database Restore Script (Bash / Linux) (T-137)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_FILE="${1:-latest}"

echo "=========================================================="
echo " [AGRITRACE] KHỞI CHẠY QUY TRÌNH PHỤC HỒI CSDL (DISASTER RECOVERY)"
echo "=========================================================="

node "$SCRIPT_DIR/restore_db.js" "$BACKUP_FILE"

echo ">> [SUCCESS] Khôi phục CSDL hoàn tất an toàn!"
