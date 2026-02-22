#!/bin/bash

# 小金语音 App 快速启动脚本

echo "🔧 小金语音 App - 快速启动"
echo "================================"
echo ""

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
  echo "📦 首次运行，正在安装依赖..."
  npm install
  echo ""
fi

echo "请选择运行平台："
echo "1) iOS"
echo "2) Android"
echo "3) Web (测试用)"
echo ""
read -p "请输入选项 (1-3): " choice

case $choice in
  1)
    echo "🍎 启动 iOS..."
    npm run ios
    ;;
  2)
    echo "🤖 启动 Android..."
    npm run android
    ;;
  3)
    echo "🌐 启动 Web..."
    npm run web
    ;;
  *)
    echo "❌ 无效选项"
    exit 1
    ;;
esac
