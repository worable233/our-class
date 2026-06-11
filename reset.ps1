# OurClass 状态重置脚本 (Windows PowerShell)
# 清空所有配置和数据，恢复到初始安装状态

# 解除 .ps1 执行限制
$currentPolicy = Get-ExecutionPolicy -Scope CurrentUser
if ($currentPolicy -eq 'Restricted' -or $currentPolicy -eq 'Undefined') {
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction SilentlyContinue
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

# 颜色输出
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Ok { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# 停止 OurClass 相关进程
function Stop-OurClassProcesses {
    $count = 0

    # 方法 1：通过命令行列特征匹配（快速精确）
    try {
        $nodes = Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop
        foreach ($p in $nodes) {
            if ($p.CommandLine -match 'ourclass|our-class|setup/index\.ts|src/index\.ts') {
                $procId = $p.ProcessId
                Write-Warn "检测到 OurClass 进程 (PID: $procId)"
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Write-Ok "已停止进程 (PID: $procId)"
                $count++
            }
        }
    } catch {
        Write-Warn "命令行检测失败，改用端口检测: $($_.Exception.Message)"
    }

    # 方法 2：端口检测（方法 1 没找到时兜底）
    if ($count -eq 0) {
        Write-Info "通过端口检测进程..."
        $foundPids = @()
        foreach ($port in @(3000, 3001)) {
            # 方法 2a: Get-NetTCPConnection
            try {
                $owner = Get-NetTCPConnection -LocalPort $port -ErrorAction Stop |
                    Select-Object -First 1 -ExpandProperty OwningProcess
                if ($owner -and ($foundPids -notcontains $owner)) {
                    $foundPids += $owner
                }
            } catch {
                # Get-NetTCPConnection 可能因权限/系统版本失败
            }

            # 方法 2b: netstat -ano (更兼容的兜底)
            if ($foundPids.Count -eq 0) {
                try {
                    $netstat = netstat -ano | Select-String ":$port\s"
                    if ($netstat) {
                        $owner = $netstat[0] -replace '.*\s+(\d+)$', '$1'
                        if ($owner -and ($foundPids -notcontains $owner)) {
                            $foundPids += $owner
                        }
                    }
                } catch { }
            }
        }

        foreach ($procId in $foundPids) {
            try {
                $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Warn "检测到 OurClass 进程 (PID: $procId, Name: $($proc.ProcessName))"
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                    Write-Ok "已停止进程 (PID: $procId)"
                    $count++
                }
            } catch { }
        }
    }

    if ($count -gt 0) { Start-Sleep -Seconds 1 }
    return ($count -gt 0)
}

function Remove-Safe {
    param(
        [string]$Path,
        [string]$Label,
        [switch]$Recurse
    )

    if (-not (Test-Path $Path)) {
        Write-Info "$Label 不存在，跳过"
        return
    }

    try {
        if ($Recurse) {
            Remove-Item -Path $Path -Force -Recurse -ErrorAction Stop
        }
        else {
            Remove-Item -Path $Path -Force -ErrorAction Stop
        }
        Write-Ok "已删除 $Label"
    }
    catch {
        Write-Err "删除失败: $($_.Exception.Message)"
        if ($_.Exception.Message -match 'being used by another process') {
            Write-Host "  → 文件被占用，尝试停止 OurClass 进程..." -ForegroundColor Yellow
            if (Stop-OurClassProcesses) {
                try {
                    if ($Recurse) {
                        Remove-Item -Path $Path -Force -Recurse -ErrorAction Stop
                    }
                    else {
                        Remove-Item -Path $Path -Force -ErrorAction Stop
                    }
                    Write-Ok "已删除 $Label"
                }
                catch {
                    Write-Err "仍无法删除 $Label，请手动关闭占用程序后重试"
                }
            }
            else {
                Write-Host "  → 未找到 OurClass 进程，请手动关闭占用程序后重试" -ForegroundColor Gray
            }
        }
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "   OurClass 状态重置"
Write-Host "========================================"
Write-Host ""

# ── 0. 先停掉所有 OurClass 进程，避免文件占用 ─────────────────────
Write-Info "检查运行中的 OurClass 进程..."
Stop-OurClassProcesses

# ── 1. 删除数据库 ─────────────────────────────────────────────────
Remove-Safe -Path "server\data.db" -Label "数据库 (server\data.db)"

# ── 2. 删除配置状态 ─────────────────────────────────────────────────
Remove-Safe -Path "server\src\setup\setup-state.json" -Label "配置状态 (setup-state.json)"

# ── 3. 删除环境配置 ─────────────────────────────────────────────────
Remove-Safe -Path "server\.env" -Label "环境配置 (server\.env)"

# ── 4. 清理上传文件 ─────────────────────────────────────────────────
if (Test-Path "server\uploads") {
    $uploadItems = Get-ChildItem "server\uploads" -Force -ErrorAction SilentlyContinue
    if ($uploadItems) {
        Remove-Safe -Path "server\uploads\*" -Label "上传文件 (server\uploads\)"
    }
    else {
        Write-Info "上传目录为空，跳过"
    }
}
else {
    Write-Info "上传目录不存在，跳过"
}

# ── 5. 清理网盘存储目录 ─────────────────────────────────────────────
Remove-Safe -Path "server\storage" -Label "网盘存储 (server\storage\)" -Recurse

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   重置完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# ── 7. 启动配置向导 ─────────────────────────────────────────────────
Write-Info "启动配置向导..."
Set-Location "$ScriptDir\server"
try {
    Start-Process -FilePath "npx.cmd" -ArgumentList "tsx", "src/setup/index.ts" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\ourclass-setup.log" -RedirectStandardError "$env:TEMP\ourclass-setup-error.log" -ErrorAction Stop | Out-Null
    Start-Sleep -Seconds 2
    Write-Ok "配置向导已启动"
    Write-Host ""
    Write-Host "  访问: http://localhost:3001/setup" -ForegroundColor Cyan
}
catch {
    Write-Warn "配置向导启动失败: $($_.Exception.Message)"
    Write-Host "  手动启动: cd server && npx tsx src/setup/index.ts" -ForegroundColor Gray
}
Set-Location $ScriptDir
Write-Host ""
