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

# ── 5. 删除前端构建产物 ─────────────────────────────────────────────
if [ -d "dist" ]; then
  rm -rf "dist"
  ok "已删除前端构建 (dist/)"
else
  info "前端构建目录不存在，跳过"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   重置完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "下一步："
echo "  1. 启动后端: cd server && npm run dev"
echo "  2. 访问安装向导: http://localhost:3001/setup"
echo ""
