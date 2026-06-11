#!/usr/bin/env bash
set -euo pipefail

# ── OurClass 状态重置脚本 ─────────────────────────────────────────────
# 清空所有配置和数据，恢复到初始安装状态

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo ""
echo "========================================"
echo "   OurClass 状态重置"
echo "========================================"
echo ""

# ── 0. 停止运行中的 OurClass 进程 ────────────────────────────────
info "检查运行中的 OurClass 进程..."
stopped=0
for port in 3000 3001; do
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    warn "检测到端口 $port 被占用 (PID: $pid)"
    kill "$pid" 2>/dev/null && ok "已停止进程 (PID: $pid)" && stopped=$((stopped + 1))
  fi
done
[ "$stopped" -gt 0 ] && sleep 1

# ── 1. 删除数据库 ─────────────────────────────────────────────────
if [ -f "server/data.db" ]; then
  rm -f "server/data.db"
  ok "已删除数据库 (server/data.db)"
else
  info "数据库文件不存在，跳过"
fi

# ── 2. 删除配置状态 ─────────────────────────────────────────────────
if [ -f "server/src/setup/setup-state.json" ]; then
  rm -f "server/src/setup/setup-state.json"
  ok "已删除配置状态 (setup-state.json)"
else
  info "配置状态文件不存在，跳过"
fi

# ── 3. 删除环境配置 ─────────────────────────────────────────────────
if [ -f "server/.env" ]; then
  rm -f "server/.env"
  ok "已删除环境配置 (server/.env)"
else
  info "环境配置文件不存在，跳过"
fi

# ── 4. 清理上传文件 ─────────────────────────────────────────────────
if [ -d "server/uploads" ] && [ "$(ls -A server/uploads 2>/dev/null)" ]; then
  rm -rf server/uploads/*
  ok "已清理上传文件 (server/uploads/)"
else
  info "上传目录为空，跳过"
fi

# ── 5. 清理网盘存储 ─────────────────────────────────────────────────
if [ -d "server/storage" ] && [ "$(ls -A server/storage 2>/dev/null)" ]; then
  rm -rf server/storage/*
  ok "已清理网盘存储 (server/storage/)"
else
  info "网盘存储目录为空，跳过"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   重置完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# ── 7. 启动配置向导 ─────────────────────────────────────────────────
info "启动配置向导..."
cd "$SCRIPT_DIR/server"
nohup npx tsx src/setup/index.ts > /tmp/ourclass-setup.log 2>&1 &
SETUP_PID=$!
sleep 3
if kill -0 "$SETUP_PID" 2>/dev/null; then
  ok "配置向导已启动 (PID: $SETUP_PID)"
else
  warn "配置向导可能未正常启动，查看日志: cat /tmp/ourclass-setup.log"
fi

# 尝试打开浏览器
SETUP_URL="http://localhost:3001/setup"
if [[ "$OSTYPE" == "darwin"* ]]; then
  open "$SETUP_URL" 2>/dev/null || true
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  xdg-open "$SETUP_URL" 2>/dev/null || true
fi

echo ""
echo "  访问: $SETUP_URL"
echo ""
