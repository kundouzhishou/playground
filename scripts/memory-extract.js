#!/usr/bin/env node
// 记忆提取脚本：从 Gateway 获取对话历史，提取关键信息写入日志

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const nacl = require('tweetnacl');
const crypto = require('crypto');
const { execSync } = require('child_process');

const MEMORY_DIR = path.join(__dirname, '..', 'memory');
const WATERMARK_PATH = path.join(MEMORY_DIR, '.extract-watermark.json');
const SCRIPTS_DIR = __dirname;

// 确保目录存在
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

// 读取 watermark（上次处理时间戳）
function readWatermark() {
  try {
    const data = JSON.parse(fs.readFileSync(WATERMARK_PATH, 'utf-8'));
    return data.lastExtractMs || 0;
  } catch {
    return 0;
  }
}

// 保存 watermark
function saveWatermark(ms) {
  fs.writeFileSync(WATERMARK_PATH, JSON.stringify({ lastExtractMs: ms, updated: new Date().toISOString() }, null, 2), 'utf-8');
}

// base64url 编码
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 连接 Gateway WebSocket
function connectGateway() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:18789');
    const keyPair = nacl.sign.keyPair();
    const deviceId = crypto.createHash('sha256').update(keyPair.publicKey).digest('hex');

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Gateway 连接超时'));
    }, 15000);

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        const nonce = msg.payload.nonce;
        const signedAtMs = Date.now();
        const token = '4ddec04aa0adfeb10a86592cc3fe2571cddaeb2220ddb0ea';
        const scopes = 'operator.read,operator.write,operator.admin';
        const payload = ['v2', deviceId, 'cli', 'cli', 'operator', scopes, signedAtMs, token, nonce].join('|');
        const sig = b64url(nacl.sign.detached(new TextEncoder().encode(payload), keyPair.secretKey));

        ws.send(JSON.stringify({
          type: 'req', id: 'c1', method: 'connect',
          params: {
            minProtocol: 3, maxProtocol: 3,
            client: { id: 'cli', version: '1.0.0', platform: 'linux', mode: 'cli' },
            role: 'operator', scopes: ['operator.read', 'operator.write', 'operator.admin'],
            auth: { token },
            device: { id: deviceId, publicKey: b64url(keyPair.publicKey), signature: sig, signedAt: signedAtMs, nonce },
          },
        }));
      }

      if (msg.type === 'res' && msg.id === 'c1') {
        clearTimeout(timeout);
        if (msg.ok) {
          resolve(ws);
        } else {
          ws.close();
          reject(new Error(`Gateway 认证失败: ${JSON.stringify(msg.error)}`));
        }
      }
    });
  });
}

// 发送请求并等待响应
function wsRequest(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`请求 ${method} 超时`)), 10000);

    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'res' && msg.id === id) {
        clearTimeout(timeout);
        ws.off('message', handler);
        if (msg.ok) {
          resolve(msg.payload);
        } else {
          reject(new Error(`${method} 失败: ${JSON.stringify(msg.error)}`));
        }
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
  });
}

// 从对话消息中提取关键信息
function extractKeyInfo(messages, watermarkMs) {
  const entries = [];

  for (const msg of messages) {
    // 只处理 watermark 之后的消息
    const msgTime = msg.ts || msg.timestamp || 0;
    if (msgTime <= watermarkMs) continue;

    // 只提取用户消息和助手的文本回复，跳过 tool 调用
    if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.trim()) {
      const text = msg.content.trim();
      // 跳过太短的消息（如 "ok"、"好"）
      if (text.length < 5) continue;
      entries.push({ time: msgTime, role: 'user', text });
    } else if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
      // 助手回复只保留较长的（可能包含决策/总结）
      const text = msg.content.trim();
      if (text.length < 50) continue;
      // 跳过明显的 tool 输出
      if (text.startsWith('{') || text.startsWith('[')) continue;
      entries.push({ time: msgTime, role: 'assistant', text: text.slice(0, 500) });
    }
  }

  return entries;
}

// 将提取的信息追加到日期日志文件
function appendToLog(sessionName, entries) {
  if (entries.length === 0) return;

  // 按日期分组
  const byDate = {};
  for (const entry of entries) {
    const date = new Date(entry.time).toISOString().slice(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(entry);
  }

  for (const [date, dateEntries] of Object.entries(byDate)) {
    const logPath = path.join(MEMORY_DIR, `${date}.md`);

    // 构建追加内容
    let content = `\n## ${sessionName} 对话摘要\n\n`;
    for (const entry of dateEntries) {
      const prefix = entry.role === 'user' ? '👤' : '🤖';
      // 截取关键部分
      const text = entry.text.length > 300 ? entry.text.slice(0, 300) + '...' : entry.text;
      content += `- ${prefix} ${text}\n`;
    }

    // 如果文件不存在，先创建标题
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, `# ${date} 日志\n`, 'utf-8');
    }

    fs.appendFileSync(logPath, content, 'utf-8');
    console.log(`  已追加到 ${date}.md（${dateEntries.length} 条）`);
  }
}

// 主流程
async function main() {
  console.log('=== 记忆提取开始 ===');
  const watermarkMs = readWatermark();
  console.log(`上次提取时间: ${watermarkMs ? new Date(watermarkMs).toISOString() : '从未提取'}`);

  let ws;
  try {
    ws = await connectGateway();
    console.log('Gateway 连接成功');
  } catch (err) {
    console.error(`Gateway 连接失败: ${err.message}`);
    process.exit(1);
  }

  let newWatermark = watermarkMs;

  try {
    // 获取 session 列表
    const sessionsResult = await wsRequest(ws, 's1', 'sessions.list');
    const sessions = sessionsResult.sessions || sessionsResult || [];
    console.log(`找到 ${Array.isArray(sessions) ? sessions.length : 0} 个 session`);

    if (Array.isArray(sessions)) {
      for (const session of sessions) {
        const sessionKey = session.key || session.sessionKey || session.id;
        const sessionName = session.label || session.name || sessionKey;
        if (!sessionKey) continue;

        try {
          console.log(`处理 session: ${sessionName}`);
          const historyResult = await wsRequest(ws, `h-${sessionKey}`, 'chat.history', { sessionKey });
          const messages = historyResult.messages || historyResult || [];

          if (!Array.isArray(messages) || messages.length === 0) continue;

          // 提取关键信息
          const entries = extractKeyInfo(messages, watermarkMs);
          if (entries.length > 0) {
            appendToLog(sessionName, entries);
            // 更新 watermark 为最新消息时间
            const maxTime = Math.max(...entries.map(e => e.time));
            if (maxTime > newWatermark) newWatermark = maxTime;
          }
        } catch (err) {
          console.error(`  session ${sessionName} 处理失败: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`获取 session 列表失败: ${err.message}`);
  }

  // 关闭连接
  ws.close();

  // 更新 watermark（即使没有新消息也更新为当前时间，避免重复扫描）
  const finalWatermark = newWatermark > watermarkMs ? newWatermark : Date.now();
  saveWatermark(finalWatermark);
  console.log(`Watermark 更新为: ${new Date(finalWatermark).toISOString()}`);

  // 更新索引
  console.log('\n更新索引...');
  try {
    execSync(`node ${path.join(SCRIPTS_DIR, 'memory-index.js')}`, { stdio: 'inherit' });
    execSync(`node ${path.join(SCRIPTS_DIR, 'memory-search-db.js')} build`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`索引更新失败: ${err.message}`);
  }

  console.log('\n=== 记忆提取完成 ===');
}

main().catch(err => {
  console.error(`致命错误: ${err.message}`);
  process.exit(1);
});
