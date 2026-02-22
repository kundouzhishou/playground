/**
 * Gateway 连接 Hook
 *
 * 实现完整的设备配对连接流程：
 * 1. 初始化设备身份（Ed25519 密钥对）
 * 2. 连接 WebSocket
 * 3. 收到 connect.challenge → 签名 → 发送 connect 请求
 * 4. 新设备等待管理员配对审批
 * 5. 收到 hello-ok 后保存 device token
 * 6. 后续连接优先使用 device token
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import uuid from 'react-native-uuid';
import { GATEWAY_CONFIG } from '../config/gateway';
import { initRemoteLog } from '../services/remoteLog';
import {
  initDeviceIdentity,
  buildSignPayload,
  signPayload,
  base64UrlEncode,
  saveDeviceToken,
  loadDeviceToken,
  clearDeviceToken,
} from '../services/deviceIdentity';

// 连接状态枚举
export const GatewayStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  WAITING_CHALLENGE: 'waiting_challenge',
  SIGNING: 'signing',
  WAITING_PAIRING: 'waiting_pairing',
  CONNECTED: 'connected',
  ERROR: 'error',
};

export const useGateway = () => {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(GatewayStatus.DISCONNECTED);
  const [lastMessage, setLastMessage] = useState(null);
  const [streamingText, setStreamingText] = useState(''); // 当前流式文本
  const [isStreaming, setIsStreaming] = useState(false);   // 是否正在流式接收
  const [pairingInfo, setPairingInfo] = useState(null); // 配对等待信息
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const pendingRequestsRef = useRef(new Map());
  const reconnectTimeoutRef = useRef(null);
  const reconnectDelayRef = useRef(1000); // 指数退避初始值
  const onMessageRef = useRef(null);
  const identityRef = useRef(null);       // 设备身份缓存
  const deviceTokenRef = useRef(null);    // device token 缓存
  const connectIdRef = useRef(null);      // 当前 connect 请求的 ID

  const generateId = () => uuid.v4();

  /**
   * 发送 WebSocket 请求并等待响应
   */
  const sendRequest = useCallback((method, params) => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket 未连接'));
        return;
      }

      const id = generateId();
      const request = { type: 'req', id, method, params };

      pendingRequestsRef.current.set(id, { resolve, reject });
      wsRef.current.send(JSON.stringify(request));

      // 配对请求可能需要很长时间等待审批，超时设为 5 分钟
      const timeout = method === 'connect' ? 300000 : 30000;
      setTimeout(() => {
        if (pendingRequestsRef.current.has(id)) {
          pendingRequestsRef.current.delete(id);
          reject(new Error(`请求超时: ${method}`));
        }
      }, timeout);

      // 记录 connect 请求 ID，用于识别 hello-ok 响应
      if (method === 'connect') {
        connectIdRef.current = id;
      }
    });
  }, []);

  /**
   * 处理 connect.challenge 事件：签名并发送 connect 请求
   */
  const handleChallenge = useCallback(async (challengePayload) => {
    const { nonce } = challengePayload;
    const identity = identityRef.current;

    if (!identity) {
      console.error('[Gateway] 设备身份未初始化');
      setStatus(GatewayStatus.ERROR);
      setError('设备身份未初始化');
      return;
    }

    setStatus(GatewayStatus.SIGNING);

    try {
      // 确定使用哪个 token（优先 device token）
      const authToken = deviceTokenRef.current || GATEWAY_CONFIG.token;
      const signedAtMs = Date.now();

      // 构建签名 payload
      // 格式：v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce
      const payload = buildSignPayload({
        deviceId: identity.deviceId,
        clientId: GATEWAY_CONFIG.client.id,       // "cli"
        clientMode: GATEWAY_CONFIG.client.mode,   // "cli"
        role: GATEWAY_CONFIG.role,                 // "operator"
        scopes: GATEWAY_CONFIG.scopes,
        signedAtMs,
        token: authToken,
        nonce,
      });

      // Ed25519 签名
      const signature = signPayload(identity.secretKey, payload);

      // 构建 connect 请求参数
      const connectParams = {
        minProtocol: GATEWAY_CONFIG.protocol.min,
        maxProtocol: GATEWAY_CONFIG.protocol.max,
        client: GATEWAY_CONFIG.client,
        role: GATEWAY_CONFIG.role,
        scopes: GATEWAY_CONFIG.scopes,
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: authToken },
        locale: 'zh-CN',
        userAgent: `xiaojin-app/${GATEWAY_CONFIG.client.version}`,
        device: {
          id: identity.deviceId,
          publicKey: base64UrlEncode(identity.publicKey),
          signature,
          signedAt: signedAtMs,
          nonce,
        },
      };

      console.log('[Gateway] 发送 connect 请求，设备 ID:', identity.deviceId.substring(0, 8));
      setStatus(GatewayStatus.WAITING_PAIRING);
      setPairingInfo({
        deviceId: identity.deviceId,
        shortId: identity.deviceId.substring(0, 8),
      });

      const result = await sendRequest('connect', connectParams);

      // connect 成功（hello-ok）
      if (result?.type === 'hello-ok') {
        console.log('[Gateway] 连接成功（hello-ok）');
        setConnected(true);
        setStatus(GatewayStatus.CONNECTED);
        setPairingInfo(null);
        setError(null);
        reconnectDelayRef.current = 1000; // 重置退避

        // 初始化远程日志
        initRemoteLog((msg) => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
          }
        });

        // 保存 device token（如果返回了）
        if (result.auth?.deviceToken) {
          deviceTokenRef.current = result.auth.deviceToken;
          await saveDeviceToken(
            identity.deviceId,
            GATEWAY_CONFIG.role,
            result.auth
          );
        }
      }
    } catch (err) {
      console.error('[Gateway] connect 失败:', err.message);

      // NOT_PAIRED — 新设备需要管理员批准，保持配对等待状态
      if (err.message?.includes('pairing required') || err.message?.includes('NOT_PAIRED')) {
        console.log('[Gateway] 等待管理员配对审批...');
        setStatus(GatewayStatus.WAITING_PAIRING);
        // 配对等待界面已显示，等关闭后会自动重连
        return;
      }

      // 如果是 device token 无效，清除并用 gateway token 重试
      if (
        deviceTokenRef.current &&
        (err.message?.includes('invalid') ||
          err.message?.includes('revoked') ||
          err.message?.includes('unauthorized'))
      ) {
        console.log('[Gateway] device token 可能已失效，清除并重试');
        deviceTokenRef.current = null;
        await clearDeviceToken();
        setError('设备 token 已失效，需要重新配对');
      } else if (err.message?.includes('rejected') || err.message?.includes('denied')) {
        setError('配对请求被拒绝，请联系管理员');
        setPairingInfo(null);
      } else {
        setError(err.message);
      }
      setStatus(GatewayStatus.ERROR);
    }
  }, [sendRequest]);

  /**
   * 处理收到的 WebSocket 消息
   */
  const handleMessage = useCallback((event) => {
    try {
      const message = JSON.parse(event.data);

      // 处理 connect.challenge 事件
      if (message.type === 'event' && message.event === 'connect.challenge') {
        handleChallenge(message.payload);
        return;
      }

      // 处理响应
      if (message.type === 'res') {
        const pending = pendingRequestsRef.current.get(message.id);
        if (pending) {
          pendingRequestsRef.current.delete(message.id);
          if (!message.ok) {
            pending.reject(
              new Error(message.error?.message || message.payload?.message || '请求失败')
            );
          } else {
            pending.resolve(message.payload);
          }
        }
        return;
      }

      // 处理聊天事件（支持流式 delta 和 final）
      if (message.type === 'event' && message.event === 'chat') {
        const payload = message.payload;
        
        // 只处理属于本 session 的消息，忽略其他 session（如 Telegram）的消息
        const msgSession = payload?.sessionKey || payload?.session;
        if (msgSession && msgSession !== GATEWAY_CONFIG.sessionKey) {
          return;
        }

        if (payload?.state === 'delta') {
          // 流式增量：提取当前累积文本
          const text = payload?.message?.content?.[0]?.text || '';
          setStreamingText(text);
          setIsStreaming(true);
          if (onMessageRef.current) {
            onMessageRef.current({ ...payload, _isDelta: true });
          }
        } else if (payload?.state === 'final') {
          // 最终消息
          setStreamingText('');
          setIsStreaming(false);
          setLastMessage(payload);
          if (onMessageRef.current) {
            onMessageRef.current(payload);
          }
        }
        return;
      }

      // 处理配对相关事件
      if (message.type === 'event' && message.event === 'device.pair.resolved') {
        const { decision } = message.payload || {};
        if (decision === 'rejected') {
          setError('配对请求被拒绝');
          setPairingInfo(null);
        }
      }
    } catch (err) {
      console.error('[Gateway] 消息解析错误:', err);
    }
  }, [handleChallenge]);

  /**
   * 建立 WebSocket 连接
   */
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus(GatewayStatus.CONNECTING);
    setError(null);

    // 初始化设备身份（首次会生成密钥对）
    if (!identityRef.current) {
      try {
        identityRef.current = await initDeviceIdentity();
      } catch (err) {
        console.error('[Gateway] 设备身份初始化失败:', err);
        setStatus(GatewayStatus.ERROR);
        setError('设备身份初始化失败');
        return;
      }
    }

    // 加载已保存的 device token
    if (!deviceTokenRef.current) {
      deviceTokenRef.current = await loadDeviceToken(GATEWAY_CONFIG.role);
    }

    console.log('[Gateway] 连接到', GATEWAY_CONFIG.url);
    let ws;
    try {
      ws = new WebSocket(GATEWAY_CONFIG.url);
      console.log('[Gateway] WebSocket 对象已创建, readyState:', ws.readyState);
    } catch (e) {
      console.error('[Gateway] WebSocket 创建失败:', e.message);
      setStatus(GatewayStatus.ERROR);
      setError('WebSocket 创建失败: ' + e.message);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Gateway] WebSocket 已连接，等待 challenge');
      setStatus(GatewayStatus.WAITING_CHALLENGE);
    };

    ws.onmessage = (event) => {
      console.log('[Gateway] 收到消息:', typeof event.data === 'string' ? event.data.substring(0, 200) : '(非文本)');
      handleMessage(event);
    };

    ws.onerror = (err) => {
      console.error('[Gateway] WebSocket 错误:', JSON.stringify(err));
      setStatus(GatewayStatus.ERROR);
      setError('连接错误');
    };

    ws.onclose = (event) => {
      console.log('[Gateway] WebSocket 关闭，code:', event.code, 'reason:', event.reason);
      setConnected(false);
      setStatus(GatewayStatus.DISCONNECTED);
      wsRef.current = null;

      // 清理所有 pending 请求
      for (const [id, pending] of pendingRequestsRef.current) {
        pending.reject(new Error('连接已关闭'));
      }
      pendingRequestsRef.current.clear();

      // 指数退避重连（最大 30 秒）
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, 30000);
      console.log(`[Gateway] ${delay}ms 后重连`);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [handleMessage]);

  /**
   * 断开连接
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setStatus(GatewayStatus.DISCONNECTED);
    setPairingInfo(null);
  }, []);

  /**
   * 发送聊天消息
   */
  const sendMessage = useCallback(async (text, sessionKeyOverride = null) => {
    try {
      const actualSessionKey = sessionKeyOverride || GATEWAY_CONFIG.sessionKey;
      console.log(`[Session] 发送消息到会话: ${actualSessionKey}`);
      const result = await sendRequest('chat.send', {
        sessionKey: actualSessionKey,
        message: text,
        idempotencyKey: generateId(),
      });
      return result;
    } catch (err) {
      console.error('[Session] 发送消息失败:', err.message);
      throw err;
    }
  }, [sendRequest]);

  /**
   * 设置消息回调
   */
  const setOnMessage = useCallback((callback) => {
    onMessageRef.current = callback;
  }, []);

  // 组件挂载时自动连接
  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  return {
    connected,
    status,
    lastMessage,
    streamingText,
    isStreaming,
    pairingInfo,
    error,
    connect,
    disconnect,
    sendMessage,
    setOnMessage,
  };
};
