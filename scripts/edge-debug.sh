#!/bin/bash
# 一键启动 Edge 调试模式（供 Claude 连接）
# 运行: ! ./scripts/edge-debug.sh

EDGE="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
PORT=9222
USER_DATA="/tmp/edge-debug"

echo "🔍 检查端口 $PORT..."
if lsof -i :$PORT -P 2>/dev/null | grep -q LISTEN; then
  echo "✅ 端口 $PORT 已被占用，Edge 可能已在调试模式运行"
  echo "   试试在对话中对 Claude 说: 帮我看下页面"
  exit 0
fi

echo "🚀 启动 Edge (调试端口 $PORT)..."
open -n -a "Microsoft Edge" --args --remote-debugging-port=$PORT --user-data-dir="$USER_DATA"

echo "⏳ 等待连接就绪..."
for i in $(seq 1 15); do
  sleep 1
  if curl -s http://127.0.0.1:$PORT/json/version > /dev/null 2>&1; then
    echo "✅ Edge 调试模式已启动！端口: $PORT"
    echo "   现在对 Claude 说: 帮我看下页面"
    exit 0
  fi
done

echo "❌ 连接超时，请手动启动 Edge"
echo "   $EDGE --remote-debugging-port=$PORT --user-data-dir=\"$USER_DATA\""
