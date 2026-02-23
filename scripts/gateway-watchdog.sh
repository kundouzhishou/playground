#!/bin/bash
# Gateway 内存监控：超过阈值自动重启，防止内存膨胀导致 Telegram/Discord 断连
export PATH=$HOME/.npm-global/bin:$PATH
# cron 环境缺少 DBus/XDG 变量，手动设置才能让 systemctl --user 正常工作
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus

MAX_MEM_MB=800  # 内存超过 800MB 就重启

RESTART_HOUR=3 # 每天凌晨 3 点重启
CURRENT_HOUR=$(date +%H)

if [ "$CURRENT_HOUR" -eq "$RESTART_HOUR" ]; then
    echo "[$(date)] 定时重启：每天凌晨 ${RESTART_HOUR} 点重启 Gateway 和 Node"
    systemctl --user restart openclaw-gateway.service
    systemctl --user restart openclaw-node.service
    sleep 5
    echo "[$(date)] 定时重启完成"
    exit 0 # 定时重启后直接退出，避免后续内存检查
fi

# 获取 gateway 进程的 RSS 内存（KB）
GW_PID=$(systemctl --user show openclaw-gateway.service -p MainPID --value 2>/dev/null)

if [ -z "$GW_PID" ] || [ "$GW_PID" = "0" ]; then
    echo "[$(date)] Gateway 未运行，尝试启动"
    systemctl --user start openclaw-gateway.service
    exit 0
fi

# 获取内存（KB 转 MB）
MEM_KB=$(ps -o rss= -p "$GW_PID" 2>/dev/null | tr -d ' ')

if [ -z "$MEM_KB" ]; then
    echo "[$(date)] 无法获取内存信息，跳过"
    exit 0
fi

MEM_MB=$((MEM_KB / 1024))
echo "[$(date)] Gateway PID=$GW_PID 内存: ${MEM_MB}MB (阈值: ${MAX_MEM_MB}MB)"

if [ "$MEM_MB" -ge "$MAX_MEM_MB" ]; then
    echo "[$(date)] 内存 ${MEM_MB}MB >= ${MAX_MEM_MB}MB，重启 Gateway 和 Node"
    systemctl --user restart openclaw-gateway.service
    systemctl --user restart openclaw-node.service
    sleep 5
    echo "[$(date)] 重启完成"
    # 验证重启后状态
    NEW_PID=$(systemctl --user show openclaw-gateway.service -p MainPID --value 2>/dev/null)
    NEW_MEM_KB=$(ps -o rss= -p "$NEW_PID" 2>/dev/null | tr -d ' ')
    NEW_MEM_MB=$((NEW_MEM_KB / 1024))
    echo "[$(date)] 重启后 Gateway PID=$NEW_PID 内存: ${NEW_MEM_MB}MB"
else
    echo "[$(date)] 内存正常，无需重启"
fi
