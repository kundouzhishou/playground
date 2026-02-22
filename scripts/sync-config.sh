#!/bin/bash
# 备份"完整的小金" — 所有身份、记忆、配置，加密打包
set -e

WORKSPACE="/home/jayson/openclaw/workspace"
BACKUP_DIR="$WORKSPACE/.backup"
PUBLIC_KEY="age10w247q8juguewa49wdzv7kajmcfc5039xdupm8dspw3hcfudwvaske5mqv"

TMP_DIR=$(mktemp -d)

# 1. 收集"我"的所有部分

# 灵魂和记忆
cp "$WORKSPACE/SOUL.md" "$TMP_DIR/" 2>/dev/null || true
cp "$WORKSPACE/MEMORY.md" "$TMP_DIR/" 2>/dev/null || true
cp "$WORKSPACE/USER.md" "$TMP_DIR/" 2>/dev/null || true
cp "$WORKSPACE/AGENTS.md" "$TMP_DIR/" 2>/dev/null || true
cp "$WORKSPACE/IDENTITY.md" "$TMP_DIR/" 2>/dev/null || true
cp "$WORKSPACE/VISION.md" "$TMP_DIR/" 2>/dev/null || true
cp "$WORKSPACE/TOOLS.md" "$TMP_DIR/" 2>/dev/null || true
cp "$WORKSPACE/HEARTBEAT.md" "$TMP_DIR/" 2>/dev/null || true
cp -r "$WORKSPACE/memory" "$TMP_DIR/memory" 2>/dev/null || true
cp -r "$WORKSPACE/scripts" "$TMP_DIR/scripts" 2>/dev/null || true

# 配置和凭证
mkdir -p "$TMP_DIR/openclaw-config"
cp ~/.openclaw/openclaw.json "$TMP_DIR/openclaw-config/"
cp ~/.openclaw/cron/jobs.json "$TMP_DIR/openclaw-config/" 2>/dev/null || true
cp -r ~/.openclaw/agents/main/agent "$TMP_DIR/openclaw-config/agent" 2>/dev/null || true
cp -r ~/.openclaw/credentials "$TMP_DIR/openclaw-config/credentials" 2>/dev/null || true
cp ~/.openclaw/identity/*.json "$TMP_DIR/openclaw-config/" 2>/dev/null || true
cp ~/.openclaw/node.json "$TMP_DIR/openclaw-config/" 2>/dev/null || true

# 2. 加密打包
mkdir -p "$BACKUP_DIR"
tar czf - -C "$TMP_DIR" . | age -r "$PUBLIC_KEY" > "$BACKUP_DIR/xiaojin-full.tar.gz.age"

# 3. 清理
rm -rf "$TMP_DIR"

SIZE=$(du -h "$BACKUP_DIR/xiaojin-full.tar.gz.age" | cut -f1)
echo "✅ 完整备份已加密：$BACKUP_DIR/xiaojin-full.tar.gz.age ($SIZE)"
echo "📦 还原：age -d -i key.txt xiaojin-full.tar.gz.age | tar xzf -"
