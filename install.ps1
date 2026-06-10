# OurClass 一键安装脚本 (Windows PowerShell)
# 自动检测 Node.js → 安装依赖 → 启动配置向导
# 使用国内镜像加速：npm 淘宝源、Node.js 淘宝源

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# 颜色输出
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Ok { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# 重试机制
function Invoke-WithRetry {
    param(
        [scriptblock]$ScriptBlock,
        [string]$Description = "命令执行",
        [int]$MaxRetries = 2
    )

    $retry = 0
    while ($retry -lt $MaxRetries) {
        try {
            & $ScriptBlock
            return $true
        }
        catch {
            $retry++
            if ($retry -lt $MaxRetries) {
                Write-Warn "$Description 失败，正在重试 ($retry/$MaxRetries)..."
                Start-Sleep -Seconds 2
            }
        }
    }
    Write-Err "$Description 失败，已重试 $MaxRetries 次"
    return $false
}

Write-Host ""
Write-Host "========================================"
Write-Host "   OurClass 班级管理系统 - 一键安装"
Write-Host "========================================"
Write-Host ""
Write-Info "使用国内镜像加速安装..."
Write-Host ""

# ── 1. 检测 Node.js ─────────────────────────────────────────────────
Write-Info "检查 Node.js..."

function Install-NodeJS {
    Write-Warn "未检测到 Node.js，开始自动安装..."

    # 使用淘宝 Node.js 镜像
    $nodeUrl = "https://npmmirror.com/mirrors/node/v22.14.0/node-v22.14.0-x64.msi"
    $installerPath = "$env:TEMP\node-installer.msi"

    Write-Info "下载 Node.js（使用淘宝镜像）..."
    if (-not (Invoke-WithRetry -ScriptBlock {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $nodeUrl -OutFile $installerPath -UseBasicParsing
    } -Description "下载 Node.js")) {
        Write-Err "下载失败，请检查网络连接或手动安装 Node.js 22+"
        exit 1
    }

    Write-Info "安装 Node.js..."
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$installerPath`" /quiet /norestart"
    Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue

    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

$nodeInstalled = $false
try {
    $nodeVersion = node -v 2>$null
    if ($nodeVersion) {
        $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        if ($majorVersion -ge 18) {
            Write-Ok "Node.js $nodeVersion"
            $nodeInstalled = $true
        }
        else {
            Write-Warn "Node.js 版本过低 ($nodeVersion)，需要 18+"
        }
    }
}
catch {
    # Node.js 未安装
}

if (-not $nodeInstalled) {
    Install-NodeJS
}

# ── 2. 配置 npm 镜像源 ─────────────────────────────────────────────
Write-Info "配置 npm 淘宝镜像源..."
npm config set registry https://registry.npmmirror.com
Write-Ok "npm 镜像源已设置为淘宝源"

# ── 3. 安装项目依赖 ─────────────────────────────────────────────────
Write-Info "安装后端依赖..."
Set-Location "$PSScriptRoot\server"
if (-not (Invoke-WithRetry -ScriptBlock { npm install 2>&1 } -Description "后端依赖安装")) {
    Write-Err "后端依赖安装失败，请检查网络连接"
    exit 1
}
Write-Ok "后端依赖安装完成"

Write-Info "安装前端依赖..."
Set-Location $PSScriptRoot
if (-not (Invoke-WithRetry -ScriptBlock { npm install 2>&1 } -Description "前端依赖安装")) {
    Write-Err "前端依赖安装失败，请检查网络连接"
    exit 1
}
Write-Ok "前端依赖安装完成"

# ── 4. 构建前端 ─────────────────────────────────────────────────────
if (-not $SkipBuild) {
    Write-Info "构建前端..."
    if (-not (Invoke-WithRetry -ScriptBlock { npm run build-only 2>&1 } -Description "前端构建")) {
        Write-Warn "前端构建失败，部分功能可能不可用"
        Write-Host "  可在安装后手动运行: cd $PSScriptRoot && npm run build"
    }
    else {
        Write-Ok "前端构建完成"
    }
}

# ── 5. 启动配置向导 ────────────────────────────────────────────────
Write-Info "启动配置向导..."
Write-Host ""
Write-Host "  打开浏览器访问: http://localhost:3001/setup" -ForegroundColor Cyan
Write-Host ""

Set-Location "$PSScriptRoot\server"

# 后台启动配置向导
$setupProcess = Start-Process -FilePath "npx" -ArgumentList "tsx", "src/setup/index.ts" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\ourclass-setup.log" -RedirectStandardError "$env:TEMP\ourclass-setup-error.log"

# 等待 3 秒验证向导已启动
Start-Sleep -Seconds 3
if (-not $setupProcess.HasExited) {
    Write-Ok "配置向导已启动 (PID: $($setupProcess.Id))"
}
else {
    Write-Warn "配置向导可能未正常启动"
    Write-Host "  查看日志: Get-Content $env:TEMP\ourclass-setup.log"
}

# 自动打开 Edge 浏览器访问配置向导
$setupUrl = "http://localhost:3001/setup"
Write-Info "正在打开 Edge 浏览器..."
try {
    # 尝试启动 Edge
    Start-Process "msedge" -ArgumentList $setupUrl -ErrorAction Stop
    Write-Ok "已打开 Edge 浏览器"
}
catch {
    try {
        # 备用：使用默认浏览器
        Write-Warn "未找到 Edge，尝试使用默认浏览器"
        Start-Process $setupUrl
    }
    catch {
        Write-Warn "无法自动打开浏览器，请手动访问: $setupUrl"
    }
}

Write-Host ""
Write-Host "  提示: 安装完成后可关闭此窗口"
Write-Host "        配置向导将继续在后台运行"
Write-Host ""
Write-Host "  按任意键退出此脚本（配置向导仍在后台运行）..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
