#!/bin/bash
# 媒体文件备份脚本：通过 Tailscale SSH 同步到 ms1

set -euo pipefail

MS1_IP="100.82.248.39"
MS1_USER="jayson"
MS1_DEST="/Users/jayson/openclaw-backup/media/"
LOCAL_SRC="$HOME/.openclaw/media/"
LOG_FILE="$HOME/.openclaw/media/backup.log"
SSH_OPTS="-o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o BatchMode=yes"

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" | tee -a "$LOG_FILE"
}

# 检查本地源目录
if [ ! -d "$LOCAL_SRC" ]; then
  log "错误: 本地媒体目录不存在 ($LOCAL_SRC)"
  exit 0
fi

log "=== 媒体备份开始 ==="

# 测试 SSH 连通性
if ! ssh $SSH_OPTS "${MS1_USER}@${MS1_IP}" "echo ok" >/dev/null 2>&1; then
  log "警告: 无法连接 ms1 (${MS1_IP})，跳过备份"
  log "=== 媒体备份跳过（SSH 不可达）==="
  exit 0
fi

# 确保远程目录存在
ssh $SSH_OPTS "${MS1_USER}@${MS1_IP}" "mkdir -p '${MS1_DEST}'"

# rsync 增量同步
log "开始同步: ${LOCAL_SRC} → ${MS1_USER}@${MS1_IP}:${MS1_DEST}"
rsync_output=$(rsync \
  --archive \
  --compress \
  --partial \
  --delete \
  --stats \
  -e "ssh ${SSH_OPTS}" \
  "${LOCAL_SRC}" \
  "${MS1_USER}@${MS1_IP}:${MS1_DEST}" 2>&1) || {
    log "警告: rsync 同步失败"
    log "$rsync_output"
    exit 0
  }

# 提取传输统计
transferred=$(echo "$rsync_output" | grep "Number of regular files transferred" | awk '{print $NF}' || echo "?")
total_size=$(echo "$rsync_output" | grep "Total transferred file size" | awk '{print $5, $6}' || echo "?")

log "同步完成: 传输 ${transferred} 个文件, 大小 ${total_size}"
log "=== 媒体备份完成 ==="
