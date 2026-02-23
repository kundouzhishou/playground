#!/bin/bash
# 自动压缩脚本：检测 main session context 占比，超过阈值则触发 /compact
export PATH=$HOME/.npm-global/bin:$PATH

THRESHOLD=80  # context 占比超过 80% 就触发压缩

# 获取 main session 的 context 占比
CTX_LINE=$(openclaw sessions 2>/dev/null | grep "agent:main:main" | head -1)

if [ -z "$CTX_LINE" ]; then
    echo "[$(date)] main session 未找到，跳过"
    exit 0
fi

# 提取百分比数字，格式如 "149k/150k (99%)"
PCT=$(echo "$CTX_LINE" | grep -oP '\(\K[0-9]+(?=%\))')

if [ -z "$PCT" ]; then
    echo "[$(date)] 无法解析 context 百分比，跳过"
    exit 0
fi

echo "[$(date)] main session context: ${PCT}%"

if [ "$PCT" -ge "$THRESHOLD" ]; then
    echo "[$(date)] context ${PCT}% >= ${THRESHOLD}%，触发 /compact"
    openclaw agent -m "/compact" --timeout 120 2>&1
    echo "[$(date)] compact 完成"
else
    echo "[$(date)] context ${PCT}% < ${THRESHOLD}%，无需压缩"
fi
