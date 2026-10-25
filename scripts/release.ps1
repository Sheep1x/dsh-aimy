# 发布 dsh-aimy 到 npm
#
# 用法：
#   .\scripts\release.ps1                 # 校验 + 发布 + 复核
#   .\scripts\release.ps1 -DryRun         # 只校验，不发布
#   .\scripts\release.ps1 -SkipTests      # 跳过测试（不推荐）
#   .\scripts\release.ps1 -Otp 123456     # 非交互，用指定一次性密码
#
# 前置：npm 已登录（npm whoami 能返回名字）；发布需要 2FA/OTP。
# 脚本会在任何一步失败时停下，不会带着问题继续。

[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$SkipTests,
  [string]$Otp,
  [string]$Proxy = 'http://127.0.0.1:7897'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "    OK  $msg" -ForegroundColor Green }
function Die($msg) { Write-Host "    FAIL  $msg" -ForegroundColor Red; exit 1 }

# npm 与 git 都走代理：直连 registry.npmjs.org / github.com 在部分网络下会超时。
if ($Proxy) {
  $env:npm_config_proxy = $Proxy
  $env:npm_config_https_proxy = $Proxy
  $env:HTTP_PROXY = $Proxy
  $env:HTTPS_PROXY = $Proxy
}

# ── 1. 工作区必须是干净的 ────────────────────────────────────
Step 1 '检查 git 工作区'
$dirty = git status --porcelain
if ($dirty) { Die "工作区有未提交改动，先提交再发布：`n$dirty" }
Ok '干净'

# ── 2. 版本与远端一致性 ──────────────────────────────────────
Step 2 '检查版本与远端'
$version = $null
# 显式按 UTF-8 读：PowerShell 5.1 的 Get-Content 默认按 ANSI 解码，
# package.json 含中文描述，会变乱码并让 ConvertFrom-Json 直接失败。
$pkgPath = Join-Path $repo 'package.json'
$pkgJson = [IO.File]::ReadAllText($pkgPath, [Text.UTF8Encoding]::new($false))
try { $version = ($pkgJson | ConvertFrom-Json).version } catch { Die "package.json 解析失败：$($_.Exception.Message)" }
Write-Host "    本版本：$version"
git fetch origin --quiet 2>$null
$ahead = git log --oneline 'origin/main..HEAD'
if ($ahead) { Die "有未推送的提交，先 push：`n$ahead" }
Ok "与 origin/main 一致"

# 已发布过就停下——npm 不允许覆盖同版本
$exists = npm view "dsh-aimy@$version" version 2>$null
if ($LASTEXITCODE -eq 0 -and $exists) {
  Die "$version 已存在于 npm；请先 npm version 升版本号"
}
Ok "$version 尚未发布"

# ── 3. 登录 ──────────────────────────────────────────────────
Step 3 '检查 npm 登录状态'
$who = npm whoami 2>$null
if ($LASTEXITCODE -ne 0 -or -not $who) { Die '未登录，先运行 npm login' }
Ok "已登录：$who"

# ── 4. 测试 ──────────────────────────────────────────────────
if ($SkipTests) {
  Write-Host "`n[4] 跳过测试（-SkipTests）" -ForegroundColor Yellow
} else {
  Step 4 '运行测试'
  $out = node --test test/*.test.mjs 2>&1
  $out | Select-String -Pattern '^ℹ (tests|pass|fail)' | ForEach-Object { Write-Host "    $($_.Line.Trim())" }
  if ($out -match '^ℹ fail (\d+)' -and [int]$Matches[1] -gt 0) { Die '测试未全部通过' }
  Ok '全部通过'
}

# ── 5. 构建产物必须与新代码同步 ──────────────────────────────
Step 5 '检查 lib/ 是否为最新构建'
node build.mjs | Out-Null
$drift = git status --porcelain -- lib/
if ($drift) {
  Die "lib/ 与源码不同步（忘了提交构建产物）：`n$drift`n请 git add lib/ 后提交"
}
Ok 'lib/ 与源码一致'

# ── 6. 打包预检 ──────────────────────────────────────────────
Step 6 '打包预检'
$packOut = npm pack --dry-run 2>&1 | Out-String
$packOut | Select-String -Pattern 'total files|package size|unpacked size|filename' | ForEach-Object { Write-Host "    $($_.Line.Trim() -replace '^npm notice ','')" }

# 关键文件必须进包：screenshots.json 决定市场详情页能不能显示截图
foreach ($f in @('lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'screenshots.json')) {
  if ($packOut -notmatch [regex]::Escape($f)) { Die "打包内容缺少 $f" }
}
Ok '关键文件齐全'

if ($DryRun) {
  Write-Host "`nDryRun：到此为止，未发布。`n" -ForegroundColor Yellow
  exit 0
}

# ── 7. 发布 ──────────────────────────────────────────────────
Step 7 "发布 $version"
$args = @('publish', '--access', 'public')
if ($Otp) { $args += @('--otp', $Otp) }
npm @args
if ($LASTEXITCODE -ne 0) {
  Write-Host @'

    发布失败。常见两种：
      EOTP  需要一次性密码 → 去掉 -Otp 重跑，按提示在浏览器完成授权；
            或从验证器取 6 位码：.\scripts\release.ps1 -Otp 123456
      E403  账号 2FA 与 token 权限不匹配 → 见 README 的发布说明
'@ -ForegroundColor Yellow
  exit 1
}

# ── 8. 复核 ──────────────────────────────────────────────────
Step 8 '复核发布结果'
$published = npm view "dsh-aimy@$version" version 2>$null
if ($published -ne $version) { Die "复核失败：npm 上读不到 $version" }
$tags = npm view dsh-aimy dist-tags --json 2>$null | ConvertFrom-Json
if ($tags.latest -ne $version) {
  Write-Host "    注意：latest 指向 $($tags.latest)，不是 $version" -ForegroundColor Yellow
} else {
  Ok "latest 已指向 $version"
}
$tarball = npm view "dsh-aimy@$version" dist.tarball 2>$null
Write-Host "    tarball：$tarball"
Ok "发布完成"

Write-Host @"

下一步（可选）：
  - 更新已装实例：cd ~/.dsh/profiles/desktop; pnpm add dsh-aimy@$version
  - dshmarket 的构建快照有滞后，收录要等它下次 CI 刷新
"@ -ForegroundColor Green
