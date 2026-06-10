#!/usr/bin/env bash
set -euo pipefail

# ── OurClass 一键安装脚本 ─────────────────────────────────────────────
# 自动检测 Node.js → 安装依赖 → 启动配置向导 → PM2 部署
# 使用国内镜像加速：GitHub ghfast、npm 淘宝源、Node.js 淘宝源

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ── 重试机制 ─────────────────────────────────────────────────────────
retry() {
  local max_retries=2
  local retry=0
  local cmd="$1"
  local desc="${2:-命令执行}"

  while [ $retry -lt $max_retries ]; do
    if eval "$cmd"; then
      return 0
    fi
    retry=$((retry + 1))
    if [ $retry -lt $max_retries ]; then
      warn "${desc}失败，正在重试 ($retry/$max_retries)..."
      sleep 2
    fi
  done
  err "${desc}失败，已重试 $max_retries 次"
  return 1
}

echo ""
echo "========================================"
echo "   OurClass 班级管理系统 - 一键安装"
echo "========================================"
echo ""
info "使用国内镜像加速安装..."
echo ""

# ── 1. 检测 Node.js ─────────────────────────────────────────────────
info "检查 Node.js..."

install_nodejs() {
  warn "未检测到 Node.js，开始自动安装..."

  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - 优先使用 Homebrew（会自动使用国内镜像如果配置了）
    if command -v brew &>/dev/null; then
      info "通过 Homebrew 安装 Node.js..."
      retry "brew install node" "Homebrew 安装 Node.js"
    else
      info "下载 Node.js 安装包（使用淘宝镜像）..."
      # 使用淘宝 Node.js 镜像
      local node_url="https://npmmirror.com/mirrors/node/v22.14.0/node-v22.14.0.pkg"
      if ! retry "curl -fsSL '$node_url' -o /tmp/node-installer.pkg" "下载 Node.js"; then
        err "下载失败，请检查网络连接或手动安装 Node.js 22+"
        exit 1
      fi
      sudo installer -pkg /tmp/node-installer.pkg -target /
      rm -f /tmp/node-installer.pkg
    fi
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux - 使用国内镜像
    if command -v apt &>/dev/null; then
      info "使用阿里云镜像安装 Node.js..."
      retry "curl -fsSL https://mirrors.aliyun.com/nodesource/setup_22.x | sudo -E bash -" "配置 Node.js 源"
      retry "sudo apt install -y nodejs" "安装 Node.js"
    elif command -v yum &>/dev/null; then
      info "使用阿里云镜像安装 Node.js..."
      retry "curl -fsSL https://mirrors.aliyun.com/nodesource/setup_22.x | sudo -E bash -" "配置 Node.js 源"
      retry "sudo yum install -y nodejs" "安装 Node.js"
    else
      err "不支持的 Linux 发行版，请手动安装 Node.js 22+"
      exit 1
    fi
  else
    err "不支持的操作系统: $OSTYPE"
    exit 1
  fi
}

if command -v node &>/dev/null; then
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    warn "Node.js 版本过低 ($(node -v))，需要 18+"
    install_nodejs
  else
    ok "Node.js $(node -v)"
  fi
else
  install_nodejs
fi

# ── 2. 配置 npm 镜像源 ─────────────────────────────────────────────
info "配置 npm 淘宝镜像源..."
npm config set registry https://registry.npmmirror.com
ok "npm 镜像源已设置为淘宝源"

# ── 3. 安装项目依赖 ─────────────────────────────────────────────────
info "安装后端依赖..."
cd "$SCRIPT_DIR/server"
if retry "npm install 2>&1" "后端依赖安装"; then
  ok "后端依赖安装完成"
else
  err "后端依赖安装失败，请检查网络连接"
  exit 1
fi

info "安装前端依赖..."
cd "$SCRIPT_DIR"
if retry "npm install 2>&1" "前端依赖安装"; then
  ok "前端依赖安装完成"
else
  err "前端依赖安装失败，请检查网络连接"
  exit 1
fi

# ── 4. 构建前端 ─────────────────────────────────────────────────────
info "构建前端..."
if retry "npm run build-only 2>&1" "前端构建"; then
  ok "前端构建完成"
else
  warn "前端构建失败，部分功能可能不可用"
  echo "  可在安装后手动运行: cd $SCRIPT_DIR && npm run build"
fi

# ── 5. 启动配置向导 ────────────────────────────────────────────────
info "启动配置向导..."
echo ""
echo -e "  打开浏览器访问: ${CYAN}http://localhost:3001/setup${NC}"
echo ""

cd "$SCRIPT_DIR/server"
# 后台启动配置向导，避免阻塞终端
nohup npx tsx src/setup/index.ts > /tmp/ourclass-setup.log 2>&1 &
SETUP_PID=$!

# 等待 3 秒验证向导已启动
sleep 3
if kill -0 "$SETUP_PID" 2>/dev/null; then
  ok "配置向导已启动 (PID: $SETUP_PID)"
else
  warn "配置向导可能未正常启动，查看日志: cat /tmp/ourclass-setup.log"
fi

# 自动打开 Edge 浏览器访问配置向导
SETUP_URL="http://localhost:3001/setup"
info "正在打开 Edge 浏览器..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  if open -a "Microsoft Edge" "$SETUP_URL" 2>/dev/null; then
    ok "已打开 Edge 浏览器"
  else
    warn "未找到 Edge，尝试使用默认浏览器"
    open "$SETUP_URL" 2>/dev/null || true
  fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Linux
  if command -v microsoft-edge &>/dev/null; then
    microsoft-edge "$SETUP_URL" &>/dev/null &
    ok "已打开 Edge 浏览器"
  elif command -v microsoft-edge-stable &>/dev/null; then
    microsoft-edge-stable "$SETUP_URL" &>/dev/null &
    ok "已打开 Edge 浏览器"
  else
    warn "未找到 Edge，尝试使用默认浏览器"
    xdg-open "$SETUP_URL" 2>/dev/null || true
  fi
fi

echo -e "  提示: 安装完成后可按 Ctrl+C 退出此脚本"
echo -e "        配置向导将继续在后台运行"
echo ""

# 等待用户按 Ctrl+C 或 SIGTERM
echo "  按 Ctrl+C 退出此脚本（配置向导仍在后台运行）"
echo ""
cleanup() {
  echo ""
  ok "配置向导已在后台运行"
  echo "  如需停止: kill ${SETUP_PID}"
  echo "  日志文件: /tmp/ourclass-setup.log"
  exit 0
}
trap cleanup INT TERM
while true; do
  sleep 10
done
