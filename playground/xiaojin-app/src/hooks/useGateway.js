import { useState, useEffect, useRef, useCallback } from 'react';
import uuid from 'react-native-uuid';
import { GATEWAY_CONFIG } from '../config/gateway';

export const useGateway = () => {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const pendingRequestsRef = useRef(new Map());
  const reconnectTimeoutRef = useRef(null);
  const onMessageRef = useRef(null);

  const generateId = () => uuid.v4();

  const sendRequest = useCallback((method, params) => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = generateId();
      const request = {
        type: 'req',
        id,
        method,
        params
      };

      pendingRequestsRef.current.set(id, { resolve, reject });
      wsRef.current.send(JSON.stringify(request));

      // 超时处理
      setTimeout(() => {
        if (pendingRequestsRef.current.has(id)) {
          pendingRequestsRef.current.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    const ws = new WebSocket(GATEWAY_CONFIG.url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'event' && message.event === 'connect.challenge') {
          // 收到挑战，发送连接请求
          const connectParams = {
            minProtocol: GATEWAY_CONFIG.protocol.min,
            maxProtocol: GATEWAY_CONFIG.protocol.max,
            client: GATEWAY_CONFIG.client,
            caps: [],
            auth: {
              token: GATEWAY_CONFIG.token
            },
            role: GATEWAY_CONFIG.role,
            scopes: GATEWAY_CONFIG.scopes
          };

          await sendRequest('connect', connectParams);
        } else if (message.type === 'res') {
          // 处理响应
          const pending = pendingRequestsRef.current.get(message.id);
          if (pending) {
            pendingRequestsRef.current.delete(message.id);
            if (!message.ok) {
              pending.reject(new Error(message.payload?.message || 'Request failed'));
            } else {
              pending.resolve(message.payload);
              
              // 如果是 connect 响应且成功
              if (message.payload?.type === 'hello-ok') {
                setConnected(true);
                setStatus('connected');
              }
            }
          }
        } else if (message.type === 'event' && message.event === 'chat') {
          // 聊天事件，通过 state 和 callback 通知
          if (message.payload?.state === 'final') {
            setLastMessage(message.payload);
            if (onMessageRef.current) {
              onMessageRef.current(message.payload);
            }
          }
        }
      } catch (error) {
        console.error('Message parse error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus('error');
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      setConnected(false);
      setStatus('disconnected');
      wsRef.current = null;

      // 自动重连
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [sendRequest]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setStatus('disconnected');
  }, []);

  const sendMessage = useCallback(async (text) => {
    try {
      const result = await sendRequest('chat.send', {
        sessionKey: GATEWAY_CONFIG.sessionKey,
        text
      });
      return result;
    } catch (error) {
      console.error('Send message error:', error);
      throw error;
    }
  }, [sendRequest]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, []);

  // 设置消息回调
  const setOnMessage = useCallback((callback) => {
    onMessageRef.current = callback;
  }, []);

  return {
    connected,
    status,
    lastMessage,
    connect,
    disconnect,
    sendMessage,
    setOnMessage
  };
};
