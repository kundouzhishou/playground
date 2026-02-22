#!/usr/bin/env node
// 媒体文件关联索引脚本：扫描 inbound 媒体文件，通过 Gateway 对话历史建立关联

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const nacl = require('tweetnacl');
const crypto = require('crypto');

const MEDIA_DIR = path.join(process.env.HOME, '.openclaw', 'media', 'inbound');
const INDEX_PATH = path.join(MEDIA_DIR, '_index.json');

// MIME 类型映射
const MIME_MAP = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf',
};

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

// 从文件名提取 UUID 部分
function extractUUID(filename) {
  const match = filename.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : null;
}

// 扫描媒体目录
function scanMediaFiles() {
  if (!fs.existsSync(MEDIA_DIR)) {
    console.log('媒体目录不存在，跳过');
    return [];
  }

  const files = fs.readdirSync(MEDIA_DIR).filter(f => !f.startsWith('_') && !f.startsWith('.'));
  return files.map(filename => {
    const filePath = path.join(MEDIA_DIR, filename);
    const stat = fs.statSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    return {
      file: filename,
      type: MIME_MAP[ext] || 'application/octet-stream',
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
      uuid: extractUUID(filename),
    };
  });
}

// 在消息内容中搜索文件引用（递归搜索字符串和数组内容）
function messageContainsRef(content, uuid, filename) {
  if (!content) return false;
  if (typeof content === 'string') {
    return content.includes(uuid) || content.includes(filename);
  }
  if (Array.isArray(content)) {
    return content.some(item => {
      if (typeof item === 'string') return item.includes(uuid) || item.includes(filename);
      if (item && typeof item === 'object') {
        // 检查 content block 的各种字段
        const fields = [item.text, item.url, item.source, item.path, item.file_id, item.data];
        return fields.some(f => f && typeof f === 'string' && (f.includes(uuid) || f.includes(filename)));
      }
      return false;
    });
  }
  if (typeof content === 'object') {
    return Object.values(content).some(v => messageContainsRef(v, uuid, filename));
  }
  return false;
}

// 从消息中提取上下文描述
function extractContext(msg) {
  if (typeof msg.content === 'string') {
    // 截取消息文本前 100 字符作为上下文
    const text = msg.content.trim();
    return text.length > 100 ? text.slice(0, 100) + '...' : text;
  }
  if (Array.isArray(msg.content)) {
    // 找文本部分
    for (const block of msg.content) {
      if (block && typeof block === 'object' && block.type === 'text' && block.text) {
        const text = block.text.trim();
        return text.length > 100 ? text.slice(0, 100) + '...' : text;
      }
    }
  }
  return '关联消息（无文本内容）';
}

async function main() {
  console.log('=== 媒体文件索引开始 ===');

  // 扫描文件
  const mediaFiles = scanMediaFiles();
  console.log(`找到 ${mediaFiles.length} 个媒体文件`);

  if (mediaFiles.length === 0) {
    fs.writeFileSync(INDEX_PATH, '[]', 'utf-8');
    console.log('无文件，已写入空索引');
    return;
  }

  // 连接 Gateway 获取对话历史
  let ws;
  let allMessages = []; // { sessionKey, msg }

  try {
    ws = await connectGateway();
    console.log('Gateway 连接成功');

    // 获取 session 列表
    const sessionsResult = await wsRequest(ws, 's1', 'sessions.list');
    const sessions = sessionsResult.sessions || sessionsResult || [];
    console.log(`找到 ${Array.isArray(sessions) ? sessions.length : 0} 个 session`);

    if (Array.isArray(sessions)) {
      for (const session of sessions) {
        const sessionKey = session.key || session.sessionKey || session.id;
        if (!sessionKey) continue;

        try {
          const historyResult = await wsRequest(ws, `h-${sessionKey}`, 'chat.history', { sessionKey });
          const messages = historyResult.messages || historyResult || [];
          if (Array.isArray(messages)) {
            for (const msg of messages) {
              allMessages.push({ sessionKey, msg });
            }
          }
        } catch (err) {
          console.error(`  session ${sessionKey} 历史获取失败: ${err.message}`);
        }
      }
    }

    ws.close();
    console.log(`共获取 ${allMessages.length} 条消息`);
  } catch (err) {
    console.error(`Gateway 连接失败: ${err.message}`);
    console.log('将生成无关联的索引');
  }

  // 建立关联
  const index = mediaFiles.map(fileInfo => {
    const { uuid, ...entry } = fileInfo;
    let matched = false;

    if (uuid && allMessages.length > 0) {
      for (const { sessionKey, msg } of allMessages) {
        if (messageContainsRef(msg.content, uuid, fileInfo.file)) {
          entry.session = sessionKey;
          entry.context = extractContext(msg);
          entry.messageTimestamp = msg.ts || msg.timestamp || null;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      entry.session = null;
      entry.context = '未关联';
      entry.messageTimestamp = null;
    }

    return entry;
  });

  // 写入索引
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`索引已写入 ${INDEX_PATH}（${index.length} 个文件）`);

  const linked = index.filter(e => e.context !== '未关联').length;
  console.log(`关联: ${linked}，未关联: ${index.length - linked}`);
  console.log('=== 媒体文件索引完成 ===');
}

main().catch(err => {
  console.error(`致命错误: ${err.message}`);
  process.exit(1);
});
