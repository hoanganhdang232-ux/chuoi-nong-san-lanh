<#
.SYNOPSIS
  Thiết lập Ruleset bảo vệ nhánh main trên GitHub thông qua GitHub CLI (gh).

.DESCRIPTION
  Script này sẽ sử dụng file github-ruleset.json để tạo một Ruleset mới.
  Đảm bảo bạn đã đăng nhập bằng lệnh: gh auth login
#>

# Kiểm tra xem gh CLI có được cài đặt hay chưa
if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) chưa được cài đặt. Vui lòng cài đặt từ https://cli.github.com/ và chạy 'gh auth login' trước."
    exit 1
}

$repo = gh repo view --json nameWithOwner -q ".nameWithOwner" 2>$null
if (-not $repo) {
    Write-Error "Không thể xác định repository GitHub. Thư mục này chưa được liên kết với một git remote GitHub hợp lệ, hoặc bạn chưa đăng nhập gh CLI."
    exit 1
}

Write-Host "Đang thiết lập Ruleset cho repository: $repo" -ForegroundColor Cyan

# Kiểm tra xem ruleset đã tồn tại chưa để tránh lỗi duplicate
$existingRulesets = gh api "repos/$repo/rulesets" -q ".[].name"
if ($existingRulesets -contains "Protect Main Branch") {
    Write-Host "Ruleset 'Protect Main Branch' đã tồn tại. Đang cập nhật..." -ForegroundColor Yellow
    # Lấy ID của ruleset để cập nhật
    $rulesetId = gh api "repos/$repo/rulesets" -q ".[] | select(.name == `"Protect Main Branch`") | .id"
    gh api -X PUT "repos/$repo/rulesets/$rulesetId" --input scripts/github-ruleset.json
} else {
    Write-Host "Tạo mới Ruleset 'Protect Main Branch'..." -ForegroundColor Green
    gh api -X POST "repos/$repo/rulesets" --input scripts/github-ruleset.json
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "Thiết lập bảo vệ nhánh thành công!" -ForegroundColor Green
} else {
    Write-Error "Có lỗi xảy ra khi tạo Ruleset. Nếu bạn đang dùng gói Free và repository là Private, tính năng này có thể không được hỗ trợ."
}
