// Gateway 配置
// client.id 和 client.mode 必须是 "cli" — 这是 Gateway schema 的硬性要求
export const GATEWAY_CONFIG = {
  // Gateway WebSocket 地址
  url: 'wss://gw.web3hunter.org',

  // Gateway token（首次连接时使用，配对成功后改用 device token）
  token: '4ddec04aa0adfeb10a86592cc3fe2571cddaeb2220ddb0ea',

  // 默认会话标识
  sessionKey: 'xiaojin-voice-v2',

  // 协议版本
  protocol: {
    min: 3,
    max: 3,
  },

  // 客户端标识（Gateway schema 限制 id 和 mode 只能是枚举值）
  client: {
    id: 'cli',           // 必须是 "cli"，Gateway 只接受枚举值
    version: '1.0.0',
    platform: 'ios',
    mode: 'cli',         // 必须是 "cli"，Gateway schema 限制
  },

  // 连接角色和权限范围
  role: 'operator',
  scopes: ['operator.read', 'operator.write'],
};
