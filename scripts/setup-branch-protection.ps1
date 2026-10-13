# Script tự động cấu hình luật bảo vệ nhánh chính (T-04) qua GitHub REST API
# Yêu cầu: GitHub Personal Access Token (PAT) có quyền 'repo' hoặc 'admin:repo'
#
# Cách dùng:
#   $env:GITHUB_TOKEN = "ghp_xxxx..."
#   .\scripts\setup-branch-protection.ps1
# hoặc:
#   .\scripts\setup-branch-protection.ps1 -Token "ghp_xxxx..." -Repo "hoanganhdang232-ux/chuoi-nong-san-lanh" -Branch "main"

param (
    [string]$Token = $env:GITHUB_TOKEN,
    [string]$Repo = "hoanganhdang232-ux/chuoi-nong-san-lanh",
    [string]$Branch = "main"
)

if (-not $Token) {
    Write-Host "Lỗi: Chưa cung cấp GITHUB_TOKEN." -ForegroundColor Red
    Write-Host "Vui lòng đặt biến môi trường `$env:GITHUB_TOKEN = 'ghp_...' hoặc truyền tham số -Token" -ForegroundColor Yellow
    Write-Host "Tạo token tại: https://github.com/settings/tokens (quyền 'repo')" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $Token"
    "Accept"        = "application/vnd.github+json"
    "User-Agent"    = "Branch-Protection-Setup-Script"
}

$apiUrl = "https://api.github.com/repos/$Repo/branches/$Branch/protection"

$body = @{
    required_status_checks = @{
        strict = $true
        contexts = @("Lint, test, and build")
    }
    enforce_admins = $false
    required_pull_request_reviews = @{
        dismiss_stale_reviews = $false
        require_code_owner_reviews = $false
        required_approving_review_count = 1
    }
    restrictions = $null
    allow_force_pushes = $false
    allow_deletions = $false
} | ConvertTo-Json -Depth 5

Write-Host "Đang cấu hình Branch Protection Rule cho nhánh '$Branch' trên repo '$Repo'..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Put -Headers $headers -Body $body -ContentType "application/json"
    Write-Host " Thành công! Đã bật luật bảo vệ nhánh '$Branch':" -ForegroundColor Green
    Write-Host "  - Bắt buộc CI pass (check: 'Lint, test, and build')" -ForegroundColor Green
    Write-Host "  - Bắt buộc tối thiểu 1 người duyệt Pull Request trước khi merge" -ForegroundColor Green
    Write-Host "  - Chặn xóa nhánh và chặn force push" -ForegroundColor Green
} catch {
    Write-Host " Thất bại: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Chi tiết: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}
