#!/bin/bash
# 一键截图给 Claude 看
#
# 用法:
#   ./scripts/screenshot.sh         — 等 3 秒后截全屏 (赶紧切到浏览器)
#   ./scripts/screenshot.sh -i      — 交互模式: 拖动选区域 或 点击窗口
#
# 截图自动保存到项目目录，我直接用 Read 工具读取

DIR="$(cd "$(dirname "$0")/.." && pwd)"
FILENAME="_screenshot.png"
FILEPATH="$DIR/$FILENAME"

if [ "$1" = "-i" ]; then
  screencapture -i "$FILEPATH"
else
  echo "⏳ 3 秒后截图... 请切换到你要截图的窗口"
  screencapture -T 3 -x "$FILEPATH"
fi

if [ -f "$FILEPATH" ]; then
  SIZE=$(du -h "$FILEPATH" | cut -f1)
  echo "✅ 截图已保存 ($SIZE): $FILEPATH"
  echo "现在告诉 Claude 查看截图，我会用 Read 读取它。"
else
  echo "❌ 截图被取消或失败"
fi
