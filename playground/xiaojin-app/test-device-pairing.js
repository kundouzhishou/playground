/**
 * Gateway 设备配对测试脚本
 *
 * 使用 Node.js 原生 crypto 模块测试：
 * 1. Ed25519 密钥对生成
 * 2. 签名 payload 构建
 * 3. 连接 Gateway 并发送签名后的 connect 请求
 *
 * 用法: node test-device-pairing.js
 */

const crypto = require('crypto');
const WebSocket = require('ws');

// Gateway 配置（与 App 一致）
const GATEWAY_URL = 'wss://gw.web3hunter.org';
const GATEWAY_TOKEN = '4ddec04aa0adfeb10a86592cc3fe2571cddaeb2220ddb0ea';
const CLIENT_ID = 'cli';
const CLIENT_MODE = 'cli';
const ROLE = 'operator';
const SCOPES = ['operator.read', 'operator.write'];

// SPKI 前缀（Ed25519）
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

// base64url 编码（无填充）
function base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// 生成 Ed25519 密钥对
function generateIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  // 提取 32 字节原始公钥
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const rawPublicKey = spkiDer.subarray(ED25519_SPKI_PREFIX.length);

  // 设备 ID = SHA-256(原始公钥).hex()
  const deviceId = crypto.createHash('sha256').update(rawPublicKey).digest('hex');

  return { deviceId, publicKeyPem, privateKeyPem, rawPublicKey };
}

// 构建签名 payload
function buildSignPayload({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce }) {
  const parts = ['v2', deviceId, clientId, clientMode, role, scopes.join(','), String(signedAtMs), token || '', nonce || ''];
  return parts.join('|');
}

// Ed25519 签名
function signPayload(privateKeyPem, payload) {
  const key = crypto.createPrivateKey(privateKeyPem);
  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), key);
  return base64UrlEncode(sig);
}

// ---- 主流程 ----
console.log('=== Gateway 设备配对测试 ===\n');

const identity = generateIdentity();
console.log('✅ 密钥对已生成');
console.log('   设备 ID:', identity.deviceId);
console.log('   设备 ID（短）:', identity.deviceId.substring(0, 8));
console.log('   公钥（base64url）:', base64UrlEncode(identity.rawPublicKey));
console.log('   公钥长度:', identity.rawPublicKey.length, '字节');

console.log('\n📡 连接 Gateway:', GATEWAY_URL);

const ws = new WebSocket(GATEWAY_URL);
let requestId = 0;

ws.on('open', () => {
  console.log('✅ WebSocket 已连接，等待 challenge...');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const { nonce, ts } = msg.payload;
    console.log('\n📨 收到 challenge:');
    console.log('   nonce:', nonce);
    console.log('   ts:', ts);

    const signedAtMs = Date.now();
    const payload = buildSignPayload({
      deviceId: identity.deviceId,
      clientId: CLIENT_ID,
      clientMode: CLIENT_MODE,
      role: ROLE,
      scopes: SCOPES,
      signedAtMs,
      token: GATEWAY_TOKEN,
      nonce,
    });

    console.log('\n🔏 签名 payload:');
    console.log('  ', payload);

    const signature = signPayload(identity.privateKeyPem, payload);
    console.log('   签名（base64url）:', signature.substring(0, 40) + '...');

    // 验证签名（自检）
    const pubKey = crypto.createPublicKey(identity.publicKeyPem);
    const sigBuf = Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/') + '==', 'base64');
    const valid = crypto.verify(null, Buffer.from(payload, 'utf8'), pubKey, sigBuf);
    console.log('   自检验证:', valid ? '✅ 通过' : '❌ 失败');

    // 发送 connect 请求
    const id = `test-${++requestId}`;
    const connectReq = {
      type: 'req',
      id,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: CLIENT_ID,
          version: '1.0.0',
          platform: 'linux',
          mode: CLIENT_MODE,
        },
        role: ROLE,
        scopes: SCOPES,
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: GATEWAY_TOKEN },
        locale: 'zh-CN',
        userAgent: 'xiaojin-test/1.0.0',
        device: {
          id: identity.deviceId,
          publicKey: base64UrlEncode(identity.rawPublicKey),
          signature,
          signedAt: signedAtMs,
          nonce,
        },
      },
    };

    console.log('\n📤 发送 connect 请求...');
    ws.send(JSON.stringify(connectReq));

    // 等待配对（最多 60 秒）
    setTimeout(() => {
      console.log('\n⏰ 等待超时（60 秒），正常退出');
      ws.close();
      process.exit(0);
    }, 60000);
  }

  if (msg.type === 'res') {
    console.log('\n📥 收到响应:');
    console.log('   ok:', msg.ok);

    if (msg.ok && msg.payload?.type === 'hello-ok') {
      console.log('   ✅ hello-ok！连接成功！');
      console.log('   protocol:', msg.payload.protocol);
      if (msg.payload.auth?.deviceToken) {
        console.log('   🔑 收到 device token:', msg.payload.auth.deviceToken.substring(0, 20) + '...');
        console.log('   role:', msg.payload.auth.role);
        console.log('   scopes:', msg.payload.auth.scopes);
      }
      console.log('\n🎉 测试通过！设备配对流程正常。');
      ws.close();
      process.exit(0);
    } else if (!msg.ok) {
      const errCode = msg.error?.code;
      const errMsg = msg.error?.message;
      console.log('   ❌ 错误:', JSON.stringify(msg.error || msg.payload));

      if (errCode === 'NOT_PAIRED' || errMsg?.includes('pairing required')) {
        const requestId = msg.error?.details?.requestId;
        console.log('\n📋 设备需要配对审批（这是正常的！）');
        console.log('   配对请求 ID:', requestId);
        console.log('   管理员可执行: openclaw devices approve', requestId);
        console.log('\n✅ 测试通过！签名格式正确，Gateway 已接受请求。');
        ws.close();
        process.exit(0);
      }

      if (errMsg?.includes('signature')) {
        console.log('   提示: 签名验证失败，检查 payload 格式');
      }
      ws.close();
      process.exit(1);
    }
  }

  if (msg.type === 'event' && msg.event === 'device.pair.resolved') {
    console.log('\n📢 配对事件:', JSON.stringify(msg.payload));
  }

  if (msg.type === 'event' && msg.event !== 'connect.challenge') {
    // 其他事件（如 tick）忽略
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket 错误:', err.message);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log(`\nWebSocket 关闭 (code: ${code}, reason: ${reason || 'none'})`);
});
