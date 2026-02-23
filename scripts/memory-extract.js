#!/usr/bin/env node
/**
 * memory-extract.js
 * 扫描最新对话 JSONL 文件，增量提取关键信息写入 memory/YYYY-MM-DD.md
 * Cron: 每 30 分钟运行一次
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const WORKSPACE = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const WATERMARK_FILE = path.join(MEMORY_DIR, '.watermark.json');
const SESSIONS_DIR = path.join(process.env.HOME, '.openclaw', 'agents', 'main', 'sessions');

function loadWatermark() {
  try {
    return JSON.parse(fs.readFileSync(WATERMARK_FILE, 'utf8'));
  } catch {
    return { lastExtract: null };
  }
}

function saveWatermark(ts) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(WATERMARK_FILE, JSON.stringify({ lastExtract: ts }, null, 2));
}

function getTodayFile() {
  const now = new Date();
  // UTC+8 offset for 老金
  const cst = new Date(now.getTime() + 8 * 3600 * 1000);
  const date = cst.toISOString().slice(0, 10);
  return path.join(MEMORY_DIR, `${date}.md`);
}

function appendToDaily(content) {
  const file = getTodayFile();
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  const header = fs.existsSync(file) ? '' : `# ${path.basename(file, '.md')} 日志\n\n`;
  fs.appendFileSync(file, header + content + '\n');
}

async function readJsonlMessages(filePath, since) {
  const sinceTs = since ? new Date(since).getTime() : 0;
  const messages = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type !== 'message') continue;

      const ts = new Date(entry.timestamp).getTime();
      if (ts <= sinceTs) continue;

      const msg = entry.message;
      if (!msg) continue;

      // 提取文本内容
      let text = '';
      if (typeof msg.content === 'string') {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') text += block.text + ' ';
        }
      }
      text = text.trim();

      // 跳过系统消息和心跳
      if (text.includes('HEARTBEAT_OK') || text.includes('A new session was started via /new')) continue;
      if (text.startsWith('System:') && text.includes('[cron:')) continue;
      if (text.length < 5) continue;

      messages.push({
        role: msg.role,
        timestamp: entry.timestamp,
        text: text.substring(0, 600)
      });
    } catch {}
  }

  return messages;
}

async function main() {
  console.log('=== 记忆提取开始 ===');
  const watermark = loadWatermark();
  console.log('上次提取时间:', watermark.lastExtract || '(首次运行)');

  const now = new Date();

  // 找最近修改的 JSONL 文件（非 deleted/reset）
  let files;
  try {
    files = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.jsonl') && !f.includes('.deleted') && !f.includes('.reset'))
      .map(f => ({
        name: f,
        path: path.join(SESSIONS_DIR, f),
        mtime: fs.statSync(path.join(SESSIONS_DIR, f)).mtimeMs
      }))
      .filter(f => {
        // 只处理最近 8 小时有活动的 session
        return (now.getTime() - f.mtime) < 8 * 3600 * 1000;
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (err) {
    console.error('读取 sessions 目录失败:', err.message);
    saveWatermark(now.toISOString());
    return;
  }

  if (files.length === 0) {
    console.log('没有近期活跃 session。');
    saveWatermark(now.toISOString());
    console.log('Watermark 更新为:', now.toISOString());
    console.log('\n=== 记忆提取完成 ===');
    return;
  }

  console.log(`发现 ${files.length} 个近期活跃 session`);

  let totalNew = 0;
  const summaryLines = [];

  for (const file of files) {
    try {
      const messages = await readJsonlMessages(file.path, watermark.lastExtract);
      if (messages.length === 0) continue;

      totalNew += messages.length;
      summaryLines.push(`\n### Session ${file.name.slice(0, 8)} (${messages.length} 条新消息)\n`);

      for (const msg of messages) {
        const role = msg.role === 'user' ? '👤' : '🤖';
        const ts = new Date(msg.timestamp).toISOString().slice(11, 16);
        summaryLines.push(`**${role} ${ts}**: ${msg.text.replace(/\n+/g, ' ')}`);
      }
    } catch (err) {
      console.error(`处理文件 ${file.name} 失败:`, err.message);
    }
  }

  if (totalNew === 0) {
    console.log('没有新的对话消息需要存档。');
  } else {
    console.log(`发现 ${totalNew} 条新消息，正在存档...`);
    const content = `\n## 对话摘要 (提取时间: ${now.toISOString()})\n` + summaryLines.join('\n');
    appendToDaily(content);
    console.log('已写入:', getTodayFile());
  }

  saveWatermark(now.toISOString());
  console.log('Watermark 更新为:', now.toISOString());
  console.log('\n=== 记忆提取完成 ===');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(0);
});
