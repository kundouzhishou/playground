#!/bin/bash
# Gateway 健康检查脚本
LOG_FILE="/tmp/health-check.log"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] 开始健康检查" >> $LOG_FILE

# 检查 Gateway
if ! openclaw gateway status 2>/dev/null | grep -q 'running'; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Gateway 异常，尝试重启" >> $LOG_FILE
  openclaw gateway restart
fi

# 检查 ms1
if ssh -o ConnectTimeout=5 -o BatchMode=yes jayson@100.82.248.39 echo ok 2>/dev/null; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ms1 可达" >> $LOG_FILE
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ms1 不可达（正常）" >> $LOG_FILE
fi
