#!/usr/bin/env bash
set -euo pipefail

# ── OurClass 一键安装脚本 ─────────────────────────────────────────────
# 自动检测 Node.js → 安装依赖 → 启动配置向导 → PM2 部署

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

echo ""
echo "========================================"
echo "   OurClass 班级管理系统 - 一键安装"
echo "========================================"
echo ""

# ── 1. 检测 Node.js ─────────────────────────────────────────────────
info "检查 Node.js..."

install_nodejs() {
  warn "未检测到 Node.js，开始自动安装..."

  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if command -v brew &>/dev/null; then
      info "通过 Homebrew 安装 Node.js..."
      brew install node
    else
      info "下载 Node.js 安装包..."
      curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0.pkg -o /tmp/node-installer.pkg
      sudo installer -pkg /tmp/node-installer.pkg -target /
      rm /tmp/node-installer.pkg
    fi
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v apt &>/dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt install -y nodejs
    elif command -v yum &>/dev/null; then
      curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo -E bash -
      sudo yum install -y nodejs
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

# ── 2. 安装项目依赖 ─────────────────────────────────────────────────
info "安装后端依赖..."
cd "$SCRIPT_DIR/server"
npm install --production 2>&1 | tail -1 && ok "后端依赖安装完成"

info "安装前端依赖..."
cd "$SCRIPT_DIR"
npm install 2>&1 | tail -1 && ok "前端依赖安装完成"

# ── 3. 构建前端 ─────────────────────────────────────────────────────
info "构建前端..."
npm run build-only 2>&1 | tail -1 && ok "前端构建完成"

# ── 4. 启动配置向导 ────────────────────────────────────────────────
info "启动配置向导..."
echo ""
echo -e "  打开浏览器访问: ${CYAN}http://localhost:3001${NC}"
echo ""

cd "$SCRIPT_DIR/server"
npx tsx src/setup/index.ts

echo ""
ok "安装完成！"
