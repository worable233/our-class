# OurClass 一键安装脚本 (Windows PowerShell)
# 自动检测 Node.js → 安装依赖 → 启动配置向导
# 使用国内镜像加速：npm 淘宝源、Node.js 淘宝源

param(
    [switch]$SkipBuild
)

# 保存原始工作目录和错误偏好
$origDir = $PWD.Path
$origErrorPref = $ErrorActionPreference

# 解除 .ps1 执行限制，后续的 reset.ps1 可以直接运行
$currentPolicy = Get-ExecutionPolicy -Scope CurrentUser
if ($currentPolicy -eq 'Restricted' -or $currentPolicy -eq 'Undefined') {
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction SilentlyContinue
}

# PowerShell 5.1 兼容：用于在脚本退出前暂停，让用户看到错误信息
function Pause-Exit($code = 1) {
    Write-Host ""
    Write-Host "按任意键退出..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    $ErrorActionPreference = $origErrorPref
    Set-Location $origDir
    exit $code
}

# 颜色输出
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Ok { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# 运行外部命令并检查退出码（不依赖 $ErrorActionPreference）
# PowerShell 5.1 会把 stderr 的内容转成 ErrorRecord，配合 "Stop" 会导致误判，
# 所以这里用 cmd /c 包装，只通过退出码判断成败
function Invoke-Native {
    param(
        [string]$Command,
        [string]$Description = "命令执行",
        [int]$MaxRetries = 2
    )
    $retry = 0
    while ($retry -lt $MaxRetries) {
        $ErrorActionPreference = 'Continue'  # 临时关闭 Stop，避免 stderr 干扰
        cmd /c "$Command 2>&1"
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($exitCode -eq 0) { return $true }
        $retry++
        if ($retry -lt $MaxRetries) {
            Write-Warn "$Description 失败 (exit $exitCode)，正在重试 ($retry/$MaxRetries)..."
            Start-Sleep -Seconds 2
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
    $ErrorActionPreference = 'Continue'
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $nodeUrl -OutFile $installerPath -UseBasicParsing -ErrorAction Stop
    } catch {
        $ErrorActionPreference = 'Stop'
        Write-Err "下载失败，请检查网络连接或手动安装 Node.js 22+"
        Pause-Exit 1
    }
    $ErrorActionPreference = 'Stop'

    Write-Info "安装 Node.js..."
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$installerPath`" /quiet /norestart"
    Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue

    # 刷新环境变量（MSI 安装后 PATH 不会立即生效）
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

$nodeInstalled = $false
$ErrorActionPreference = 'Continue'
try {
    $nodeVersion = & node -v 2>$null
    if ($nodeVersion -and $nodeVersion -match '^v(\d+)') {
        $majorVersion = [int]$Matches[1]
        if ($majorVersion -ge 18) {
            Write-Ok "Node.js $nodeVersion"
            $nodeInstalled = $true
        } else {
            Write-Warn "Node.js 版本过低 ($nodeVersion)，需要 18+"
        }
    }
} catch {
    # Node.js 未安装
}
$ErrorActionPreference = 'Stop'

if (-not $nodeInstalled) {
    Install-NodeJS
    # 再次检查
    $ErrorActionPreference = 'Continue'
    try {
        $nodeVersion = & node -v 2>$null
        if ($nodeVersion -and $nodeVersion -match '^v(\d+)') {
            $majorVersion = [int]$Matches[1]
            if ($majorVersion -ge 18) {
                Write-Ok "Node.js $nodeVersion（已自动安装）"
                $nodeInstalled = $true
            }
        }
    } catch {}
    $ErrorActionPreference = 'Stop'
    if (-not $nodeInstalled) {
        Write-Err "Node.js 安装后仍不可用，请重启终端后重试"
        Pause-Exit 1
    }
}

# ── 2. 安装项目依赖（使用 --registry 而非全局修改 npm config）────────
$npmRegistry = "--registry https://registry.npmmirror.com"

Write-Info "安装后端依赖..."
Set-Location "$PSScriptRoot\server"
if (-not (Invoke-Native -Command "npm install $npmRegistry" -Description "后端依赖安装")) {
    Write-Err "后端依赖安装失败，请检查网络连接"
    Pause-Exit 1
}
Write-Ok "后端依赖安装完成"

Write-Info "安装前端依赖..."
Set-Location $PSScriptRoot
if (-not (Invoke-Native -Command "npm install $npmRegistry" -Description "前端依赖安装")) {
    Write-Err "前端依赖安装失败，请检查网络连接"
    Pause-Exit 1
}
Write-Ok "前端依赖安装完成"

# ── 2.5 预装 PM2 进程管理器 ─────────────────────────────────────────
Write-Info "预装 PM2 进程管理器..."
$ErrorActionPreference = 'Continue'
$pm2Exists = Get-Command pm2 -ErrorAction SilentlyContinue
$ErrorActionPreference = 'Stop'
if (-not $pm2Exists) {
    if (Invoke-Native -Command "npm install -g pm2 $npmRegistry" -Description "PM2 全局安装") {
        Write-Ok "PM2 预装完成"
    } else {
        Write-Warn "PM2 预装失败，可在配置向导中重试"
    }
} else {
    Write-Ok "PM2 已安装，跳过"
}

# ── 3. 构建前端 ─────────────────────────────────────────────────────
if (-not $SkipBuild) {
    Write-Info "构建前端..."
    if (-not (Invoke-Native -Command "npm run build-only" -Description "前端构建")) {
        Write-Warn "前端构建失败，部分功能可能不可用"
        Write-Host "  可在安装后手动运行: cd $PSScriptRoot && npm run build"
    } else {
        Write-Ok "前端构建完成"
    }
}

# ── 4. 启动配置向导 ────────────────────────────────────────────────
Write-Info "启动配置向导..."
Write-Host ""
Write-Host "  打开浏览器访问: http://localhost:3001/setup" -ForegroundColor Cyan
Write-Host ""

Set-Location "$PSScriptRoot\server"

# 后台启动配置向导
# 注意：必须用 npx.cmd 而不是 npx — Start-Process 使用 Windows CreateProcess，
# 不识别 PATHEXT 之外的扩展名
$ErrorActionPreference = 'Continue'
try {
    $setupProcess = Start-Process -FilePath "npx.cmd" -ArgumentList "tsx", "src/setup/index.ts" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\ourclass-setup.log" -RedirectStandardError "$env:TEMP\ourclass-setup-error.log" -ErrorAction Stop
} catch {
    Write-Warn "配置向导启动失败: $($_.Exception.Message)"
    $setupProcess = $null
}
$ErrorActionPreference = 'Stop'

# 等待 3 秒验证向导已启动
if ($setupProcess) {
    Start-Sleep -Seconds 3
    if (-not $setupProcess.HasExited) {
        Write-Ok "配置向导已启动 (PID: $($setupProcess.Id))"
    } else {
        Write-Warn "配置向导可能未正常启动"
        Write-Host "  查看日志: Get-Content $env:TEMP\ourclass-setup.log"
    }
}

# 自动打开浏览器访问配置向导
$setupUrl = "http://localhost:3001/setup"
Write-Info "正在打开浏览器..."
$ErrorActionPreference = 'Continue'
try {
    Start-Process "msedge" -ArgumentList $setupUrl -ErrorAction Stop
    Write-Ok "已打开 Edge 浏览器"
} catch {
    try {
        Start-Process $setupUrl -ErrorAction Stop
        Write-Ok "已打开默认浏览器"
    } catch {
        Write-Warn "无法自动打开浏览器，请手动访问: $setupUrl"
    }
}
$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "  提示: 安装完成后可关闭此窗口"
Write-Host "        配置向导将继续在后台运行"
Write-Host ""
Write-Host "  按任意键退出此脚本（配置向导仍在后台运行）..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# 恢复工作目录
Set-Location $origDir
