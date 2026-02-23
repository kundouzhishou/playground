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

// 确保目录存在
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

// 读取 watermark
function readWatermark() {
  try {
    const data = JSON.parse(fs.readFileSync(WATERMARK_PATH, 'utf-8'));
    return data.lastExtractMs || 0;
  } catch (e) {
    console.log(`无法读取或解析 watermark 文件 ${WATERMARK_PATH}，将从 0 开始。`);
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

// 从 Gateway 获取 agent:main:main session 的历史消息，并进行过滤
async function getAgentMainHistory(ws, watermarkMs) {
  const agentMainSessionKey = 'agent:main:main';
  const conversationsToSave = [];

  try {
    console.log(`正在获取 session: ${agentMainSessionKey} 的历史消息...`);
    // 获取完整的历史消息，之后再过滤。limit 可以根据需要调整
    const historyResult = await wsRequest(ws, `h-${agentMainSessionKey}`, 'chat.history', { sessionKey: agentMainSessionKey, limit: 200 });
    const messages = historyResult.messages || historyResult || [];

    if (!Array.isArray(messages) || messages.length === 0) {
      console.log(`Session: ${agentMainSessionKey} 没有找到历史消息。`);
      return { conversations: [], newWatermark: watermarkMs };
    }

    let latestMessageTime = watermarkMs;

    // 过滤消息，只保留 watermark 之后的老金用户消息和我的助手回复
    const filteredMessages = messages.filter(msg => {
      const msgTime = msg.ts || msg.timestamp || 0;
      // 排除 watermark 之前的消息
      if (msgTime <= watermarkMs) return false;

      // 排除系统消息
      if (msg.role === 'system') return false;

      // 排除 subagent 内部消息
      // subagent 消息通常在 meta.subagent 中有信息
      if (msg.meta?.subagent) return false;

      // 排除工具调用和结果消息
      // 工具调用可能表现为 role=assistant, content 是一个对象或特定格式的字符串
      // Gateway 的 chat.history 可能会返回不同 `kind` 的消息
      if (msg.kind === 'tool_code' || msg.kind === 'tool_result' || msg.kind === 'tool_error') return false;

      // 排除 message.type 为 'event' 的消息，这些通常是内部事件
      if (msg.type === 'event') return false;

      // 过滤 role=user 消息
      if (msg.role === 'user') {
        const senderId = msg.meta?.user?.id || msg.senderId;
        // 假设老金的 sender_id 是 271939480
        const GOLD_SENDER_ID = '271939480';
        if (senderId === GOLD_SENDER_ID) {
          // 确保 content 是字符串且非空
          if (typeof msg.content === 'string' && msg.content.trim().length > 0) {
            return true;
          }
        }
      }

      // 过滤 role=assistant 消息 (我的回复)
      if (msg.role === 'assistant') {
        // 排除 content 为空或明显是工具、命令执行相关的信息
        if (typeof msg.content !== 'string' || msg.content.trim().length === 0) return false;
        // 排除明显是命令执行或工具调用的输出
        // 例如，如果消息内容以 "Running command:" 开头，或者包含多行代码块
        if (msg.content.includes('Running command:') || (msg.content.startsWith('```') && msg.content.endsWith('```'))) {
          return false;
        }
        return true;
      }

      return false; // 其他类型的消息不包含
    });

    for (const msg of filteredMessages) {
      conversationsToSave.push(msg);
      const msgTime = msg.ts || msg.timestamp || 0;
      if (msgTime > latestMessageTime) {
        latestMessageTime = msgTime;
      }
    }

    // 确保 newWatermark 至少是当前脚本运行时的最新消息时间，避免未来重复处理
    return { conversations: conversationsToSave, newWatermark: latestMessageTime };

  } catch (err) {
    console.error(`获取 session: ${agentMainSessionKey} 历史消息失败: ${err.message}`);
    return { conversations: [], newWatermark: watermarkMs };
  }
}

// 将对话追加到当天的存档文件 (JSON 格式)
function appendToRawConversationLog(messages) {
  if (messages.length === 0) return;

  const byDate = {};
  for (const msg of messages) {
    const date = new Date(msg.ts || msg.timestamp || 0).toISOString().slice(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(msg);
  }

  for (const [date, dateMessages] of Object.entries(byDate)) {
    const logDir = path.join(MEMORY_DIR, 'conversations', 'raw');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, `${date}.json`);

    let existingMessages = [];
    if (fs.existsSync(logPath)) {
      try {
        existingMessages = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        if (!Array.isArray(existingMessages)) {
          console.warn(`WARN: 现有文件 ${logPath} 不是有效的 JSON 数组，将清空并重新开始。`);
          existingMessages = [];
        }
      } catch (e) {
        console.warn(`WARN: 解析文件 ${logPath} 失败 (${e.message})，将清空并重新开始。`);
        existingMessages = [];
      }
    }

    // 使用 Map 来去重并保持插入顺序
    const uniqueMessagesMap = new Map();
    // 先加入已有的消息
    existingMessages.forEach(msg => {
      // 使用 msg.id 作为唯一键，或者组合 ts 和 content 的哈希值
      const key = msg.id || `${msg.ts}-${msg.role}-${crypto.createHash('md5').update(JSON.stringify(msg)).digest('hex')}`;
      uniqueMessagesMap.set(key, msg);
    });

    let addedCount = 0;
    // 再加入新的消息，如果重复则覆盖（保持最新）
    dateMessages.forEach(msg => {
      const key = msg.id || `${msg.ts}-${msg.role}-${crypto.createHash('md5').update(JSON.stringify(msg)).digest('hex')}`;
      if (!uniqueMessagesMap.has(key)) {
        addedCount++;
      }
      uniqueMessagesMap.set(key, msg);
    });

    if (addedCount > 0) {
      const allMessages = Array.from(uniqueMessagesMap.values()).sort((a, b) => (a.ts || a.timestamp) - (b.ts || b.timestamp));
      fs.writeFileSync(logPath, JSON.stringify(allMessages, null, 2), 'utf-8');
      console.log(`  已追加 ${addedCount} 条新消息到 ${logPath}`);
    } else {
      console.log(`  ${logPath} 没有新消息需要追加。`);
    }
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
    const { conversations, newWatermark: latestTime } = await getAgentMainHistory(ws, watermarkMs);
    if (conversations.length > 0) {
      appendToRawConversationLog(conversations);
      newWatermark = latestTime;
    } else {
      console.log('没有新的对话消息需要存档。');
    }
  } catch (err) {
    console.error(`处理 agent:main:main 对话历史失败: ${err.message}`);
  } finally {
    // 关闭连接
    ws.close();
  }

  // 更新 watermark
  const finalWatermark = newWatermark > watermarkMs ? newWatermark : Date.now();
  saveWatermark(finalWatermark);
  console.log(`Watermark 更新为: ${new Date(finalWatermark).toISOString()}`);

  console.log('\n=== 记忆提取完成 ===');
}

main().catch(err => {
  console.error(`致命错误: ${err.message}`);
  process.exit(1);
});

