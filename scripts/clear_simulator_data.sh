#!/bin/bash

# 清理 iOS 模拟器上 Gouda 应用的本地数据
# 用法: ./scripts/clear_simulator_data.sh

APP_BUNDLE_ID="com.yilian.gouda"

echo "🧹 清理 Gouda 模拟器数据..."

# 获取已启动的模拟器
BOOTED_DEVICE=$(xcrun simctl list devices | grep "Booted" | head -1)

if [ -z "$BOOTED_DEVICE" ]; then
    echo "❌ 没有找到正在运行的模拟器"
    echo "   请先启动模拟器后再运行此脚本"
    exit 1
fi

# 提取设备 UDID
DEVICE_UDID=$(xcrun simctl list devices | grep "Booted" | head -1 | grep -oE '[A-F0-9-]{36}')
DEVICE_NAME=$(echo "$BOOTED_DEVICE" | sed 's/ (Booted)//' | xargs)

echo "📱 找到模拟器: $DEVICE_NAME"
echo "   UDID: $DEVICE_UDID"

# 方法1: 使用 simctl 卸载并重装（最彻底）
echo ""
echo "🗑️  正在清理应用数据..."

# 终止应用（如果正在运行）
xcrun simctl terminate "$DEVICE_UDID" "$APP_BUNDLE_ID" 2>/dev/null

# 清理应用数据（保留应用本身）
# 找到应用数据目录并删除
APP_DATA_PATH=$(xcrun simctl get_app_container "$DEVICE_UDID" "$APP_BUNDLE_ID" data 2>/dev/null)

if [ -n "$APP_DATA_PATH" ] && [ -d "$APP_DATA_PATH" ]; then
    echo "   数据目录: $APP_DATA_PATH"

    # 删除 Documents, Library, tmp 目录内容
    rm -rf "$APP_DATA_PATH/Documents/"* 2>/dev/null
    rm -rf "$APP_DATA_PATH/Library/"* 2>/dev/null
    rm -rf "$APP_DATA_PATH/tmp/"* 2>/dev/null

    echo "   ✅ 已清理 Documents, Library, tmp 目录"
else
    echo "   ⚠️  未找到应用数据目录，可能应用未安装"
    echo "   尝试查找 Expo 开发应用..."

    # Expo 开发版本可能使用不同的 bundle ID
    EXPO_APP_DATA=$(find ~/Library/Developer/CoreSimulator/Devices/"$DEVICE_UDID"/data/Containers/Data/Application -name ".expo" -type d 2>/dev/null | head -1)

    if [ -n "$EXPO_APP_DATA" ]; then
        APP_ROOT=$(dirname "$EXPO_APP_DATA")
        echo "   找到 Expo 应用: $APP_ROOT"
        rm -rf "$APP_ROOT/Documents/"* 2>/dev/null
        rm -rf "$APP_ROOT/Library/"* 2>/dev/null
        rm -rf "$APP_ROOT/tmp/"* 2>/dev/null
        echo "   ✅ 已清理 Expo 应用数据"
    fi
fi

# 清理 AsyncStorage (React Native 存储)
ASYNC_STORAGE_PATH="$APP_DATA_PATH/Library/Application Support"
if [ -d "$ASYNC_STORAGE_PATH" ]; then
    rm -rf "$ASYNC_STORAGE_PATH/"* 2>/dev/null
    echo "   ✅ 已清理 AsyncStorage"
fi

echo ""
echo "✨ 清理完成！请重新打开 Gouda 应用。"
