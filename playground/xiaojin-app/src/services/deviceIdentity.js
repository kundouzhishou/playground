/**
 * 设备身份模块
 *
 * 负责 Ed25519 密钥对的生成、存储、加载和签名。
 * 使用 tweetnacl 做 Ed25519 操作（React Native 兼容）。
 * 使用 expo-crypto 做 SHA-256 哈希。
 * 使用 expo-secure-store 做安全持久化存储。
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';

// 存储键名
const STORE_KEY_IDENTITY = 'device-identity';
const STORE_KEY_AUTH_TOKENS = 'device-auth-tokens';

// 存储格式版本
const STORAGE_VERSION = 1;

/**
 * base64url 编码（无填充）
 * @param {Uint8Array} bytes - 要编码的字节数组
 * @returns {string} base64url 编码字符串
 */
export function base64UrlEncode(bytes) {
  // 将 Uint8Array 转为普通 base64
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  // 转换为 base64url 并去掉填充
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * base64url 解码
 * @param {string} str - base64url 编码字符串
 * @returns {Uint8Array} 解码后的字节数组
 */
export function base64UrlDecode(str) {
  // 还原为标准 base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // 补齐填充
  const pad = (4 - (base64.length % 4)) % 4;
  base64 += '='.repeat(pad);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 将字节数组转为 hex 字符串
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 生成新的 Ed25519 密钥对并计算设备 ID
 * @returns {Promise<{deviceId: string, publicKey: Uint8Array, secretKey: Uint8Array}>}
 */
async function generateKeyPair() {
  // 使用 tweetnacl 生成 Ed25519 密钥对
  const keyPair = nacl.sign.keyPair();

  // 设备 ID = SHA-256(原始公钥 32 字节).hex()
  const hashBuffer = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    keyPair.publicKey
  );
  const hashHex = bytesToHex(new Uint8Array(hashBuffer));

  return {
    deviceId: hashHex,
    publicKey: keyPair.publicKey,   // 32 字节原始公钥
    secretKey: keyPair.secretKey,   // 64 字节私钥（tweetnacl 格式：私钥 + 公钥）
  };
}

/**
 * 初始化设备身份：加载已有的或生成新的
 * @returns {Promise<{deviceId: string, publicKey: Uint8Array, secretKey: Uint8Array}>}
 */
export async function initDeviceIdentity() {
  try {
    // 尝试从安全存储加载
    const stored = await SecureStore.getItemAsync(STORE_KEY_IDENTITY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        parsed?.version === STORAGE_VERSION &&
        typeof parsed.deviceId === 'string' &&
        typeof parsed.publicKeyB64 === 'string' &&
        typeof parsed.secretKeyB64 === 'string'
      ) {
        const publicKey = base64UrlDecode(parsed.publicKeyB64);
        const secretKey = base64UrlDecode(parsed.secretKeyB64);

        // 验证设备 ID 与公钥一致
        const derivedBuffer = await Crypto.digest(
          Crypto.CryptoDigestAlgorithm.SHA256,
          publicKey
        );
        const derivedId = bytesToHex(new Uint8Array(derivedBuffer));
        if (derivedId === parsed.deviceId) {
          console.log('[设备身份] 从安全存储加载成功，设备 ID:', parsed.deviceId.substring(0, 8));
          return { deviceId: parsed.deviceId, publicKey, secretKey };
        }
        console.warn('[设备身份] 设备 ID 不匹配，重新生成');
      }
    }
  } catch (e) {
    console.warn('[设备身份] 加载失败，将重新生成:', e.message);
  }

  // 生成新密钥对
  console.log('[设备身份] 生成新的 Ed25519 密钥对');
  const identity = await generateKeyPair();

  // 持久化到安全存储
  const toStore = {
    version: STORAGE_VERSION,
    deviceId: identity.deviceId,
    publicKeyB64: base64UrlEncode(identity.publicKey),
    secretKeyB64: base64UrlEncode(identity.secretKey),
    createdAtMs: Date.now(),
  };
  await SecureStore.setItemAsync(STORE_KEY_IDENTITY, JSON.stringify(toStore));
  console.log('[设备身份] 新密钥对已保存，设备 ID:', identity.deviceId.substring(0, 8));

  return identity;
}

/**
 * 构建签名 payload 字符串
 *
 * 格式：v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce
 *
 * @param {object} params
 * @param {string} params.deviceId - 设备 ID
 * @param {string} params.clientId - 客户端 ID（必须是 "cli"）
 * @param {string} params.clientMode - 客户端模式（必须是 "cli"）
 * @param {string} params.role - 连接角色
 * @param {string[]} params.scopes - 权限范围
 * @param {number} params.signedAtMs - 签名时间戳（毫秒）
 * @param {string} params.token - auth token（gateway token 或 device token）
 * @param {string} params.nonce - Gateway challenge nonce
 * @returns {string} 签名 payload
 */
export function buildSignPayload({
  deviceId,
  clientId,
  clientMode,
  role,
  scopes,
  signedAtMs,
  token,
  nonce,
}) {
  const parts = [
    'v2',
    deviceId,
    clientId,
    clientMode,
    role,
    scopes.join(','),
    String(signedAtMs),
    token || '',
    nonce || '',
  ];
  return parts.join('|');
}

/**
 * 使用 Ed25519 私钥签名 payload
 * @param {Uint8Array} secretKey - tweetnacl 格式的 64 字节私钥
 * @param {string} payload - 要签名的字符串
 * @returns {string} base64url 编码的签名
 */
export function signPayload(secretKey, payload) {
  // 将 payload 转为 UTF-8 字节
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(payload);

  // Ed25519 签名（tweetnacl 返回的是 detached signature，64 字节）
  const signature = nacl.sign.detached(messageBytes, secretKey);

  return base64UrlEncode(signature);
}

/**
 * 保存 device token 到安全存储
 * @param {string} deviceId - 设备 ID
 * @param {string} role - 角色
 * @param {object} auth - hello-ok 中的 auth 字段
 */
export async function saveDeviceToken(deviceId, role, auth) {
  const data = {
    version: STORAGE_VERSION,
    deviceId,
    tokens: {
      [role]: {
        token: auth.deviceToken,
        role: auth.role || role,
        scopes: auth.scopes || [],
        updatedAtMs: Date.now(),
      },
    },
  };
  await SecureStore.setItemAsync(STORE_KEY_AUTH_TOKENS, JSON.stringify(data));
  console.log('[设备身份] device token 已保存，角色:', role);
}

/**
 * 加载已保存的 device token
 * @param {string} role - 角色
 * @returns {Promise<string|null>} device token 或 null
 */
export async function loadDeviceToken(role) {
  try {
    const stored = await SecureStore.getItemAsync(STORE_KEY_AUTH_TOKENS);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed?.version === STORAGE_VERSION && parsed.tokens?.[role]?.token) {
      console.log('[设备身份] 已加载 device token，角色:', role);
      return parsed.tokens[role].token;
    }
  } catch (e) {
    console.warn('[设备身份] 加载 device token 失败:', e.message);
  }
  return null;
}

/**
 * 清除已保存的 device token
 */
export async function clearDeviceToken() {
  await SecureStore.deleteItemAsync(STORE_KEY_AUTH_TOKENS);
  console.log('[设备身份] device token 已清除');
}
