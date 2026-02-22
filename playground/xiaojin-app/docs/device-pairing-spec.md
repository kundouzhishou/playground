# 小金语音 App — 设备配对流程 BDD 行为规范

## 概述

小金语音 App（React Native/Expo）需要通过 OpenClaw Gateway 的设备配对机制获取 `operator.write` scope，才能调用 `chat.send` 发送消息。本文档定义了完整的设备配对流程行为规范和技术实现细节。

---

## 一、BDD 行为规范

### 功能：设备身份管理

#### 场景 1：App 首次启动，生成密钥对并存储

```gherkin
Feature: 设备身份初始化

  Scenario: App 首次启动时生成 Ed25519 密钥对
    Given App 是首次启动
      And 本地安全存储中不存在设备密钥对
    When App 初始化设备身份模块
    Then 应生成一对 Ed25519 密钥对（公钥 + 私钥）
      And 公钥应以 PEM 格式存储（SPKI 编码）
      And 私钥应以 PEM 格式存储（PKCS8 编码）
      And 设备 ID 应为公钥原始字节（32 字节）的 SHA-256 hex 摘要
      And 密钥对和设备 ID 应持久化到本地安全存储
      And 存储格式版本号应为 1

  Scenario: App 非首次启动时加载已有密钥对
    Given App 非首次启动
      And 本地安全存储中已存在有效的设备密钥对
    When App 初始化设备身份模块
    Then 应从安全存储中加载已有的密钥对和设备 ID
      And 应验证存储的设备 ID 与公钥推导的 ID 一致
      And 不应生成新的密钥对

  Scenario: 存储的密钥对数据损坏时重新生成
    Given 本地安全存储中的密钥对数据已损坏或格式无效
    When App 初始化设备身份模块
    Then 应清除损坏的数据
      And 应生成新的 Ed25519 密钥对
      And 应将新密钥对持久化到安全存储
```

---

#### 场景 2：App 连接 Gateway，签名 challenge，发起配对请求

```gherkin
Feature: Gateway 连接与 Challenge 签名

  Scenario: App 首次连接 Gateway（无 device token）
    Given App 已生成设备密钥对
      And 本地不存在已保存的 device token
      And Gateway 地址和 gateway token 已配置
    When App 建立 WebSocket 连接到 Gateway
    Then Gateway 应发送 connect.challenge 事件
      And 事件 payload 应包含 nonce（字符串）和 ts（时间戳）

  Scenario: App 签名 challenge 并发送 connect 请求
    Given App 已收到 connect.challenge 事件，nonce 为 "<nonce>"
      And 设备 ID 为 "<deviceId>"
      And 当前时间戳为 <signedAtMs>
    When App 构建签名 payload
    Then 签名 payload 应为以下字段用 "|" 连接的字符串：
      """
      v2|<deviceId>|xiaojin-app|operator|operator.read,operator.write|<signedAtMs>|<gatewayToken>|<nonce>
      """
      And 应使用 Ed25519 私钥对 payload 的 UTF-8 字节进行签名
      And 签名结果应编码为 base64url 格式（无填充）

  Scenario: App 发送 connect 请求
    Given App 已完成 challenge 签名
    When App 发送 connect 请求
    Then 请求应包含完整的 device 字段：
      | 字段       | 值                                          |
      | id         | 设备 ID（公钥 SHA-256 hex）                  |
      | publicKey  | 公钥原始字节的 base64url 编码（32 字节）      |
      | signature  | 签名的 base64url 编码                        |
      | signedAt   | 签名时的毫秒时间戳                            |
      | nonce      | Gateway 提供的 challenge nonce               |
      And auth.token 应为 Gateway token（如已配置）
      And role 应为 "operator"
      And scopes 应为 ["operator.read", "operator.write"]
      And client.id 应为 "xiaojin-app"
      And client.platform 应为 "ios" 或 "android"
      And client.mode 应为 "operator"

  Scenario: 新设备首次连接触发配对请求
    Given App 发送了包含有效 device 字段的 connect 请求
      And 该设备 ID 未在 Gateway 中注册
      And Gateway 未启用自动批准
    When Gateway 处理 connect 请求
    Then Gateway 应创建一个待处理的配对请求
      And Gateway 应向管理员广播 device.pair.requested 事件
      And 事件应包含 requestId、deviceId、publicKey、platform、clientId 等信息
      And connect 请求应等待配对审批结果
```

---

#### 场景 3：管理员批准配对，App 收到 device token

```gherkin
Feature: 配对审批与 Device Token 颁发

  Scenario: 管理员批准配对请求
    Given 存在一个待处理的配对请求，requestId 为 "<requestId>"
    When 管理员执行 "openclaw devices approve <requestId>"
    Then Gateway 应将配对请求标记为已批准
      And Gateway 应广播 device.pair.resolved 事件
      And 事件 payload 中 decision 应为 "approved"

  Scenario: App 收到配对批准后获得 device token
    Given 管理员已批准 App 的配对请求
    When Gateway 返回 connect 响应（hello-ok）
    Then 响应 payload 应包含 auth 字段：
      | 字段         | 说明                                    |
      | deviceToken  | Gateway 颁发的设备专属 token             |
      | role         | "operator"                              |
      | scopes       | ["operator.read", "operator.write"]     |
      | issuedAtMs   | token 颁发时间戳（可选）                 |
      And App 应将 deviceToken 持久化到本地安全存储
      And 存储应关联 deviceId 和 role

  Scenario: 管理员拒绝配对请求
    Given 存在一个待处理的配对请求，requestId 为 "<requestId>"
    When 管理员执行 "openclaw devices reject <requestId>"
    Then Gateway 应将配对请求标记为已拒绝
      And Gateway 应广播 device.pair.resolved 事件
      And 事件 payload 中 decision 应为 "rejected"
      And App 的 connect 请求应收到错误响应
      And App 应向用户显示"配对被拒绝"的提示
```

---

#### 场景 4：App 用 device token 重新连接，获得完整 scope

```gherkin
Feature: 使用 Device Token 重新连接

  Scenario: App 使用已保存的 device token 连接 Gateway
    Given App 本地存储中存在有效的 device token
      And device token 关联的 role 为 "operator"
    When App 建立 WebSocket 连接到 Gateway
      And 收到 connect.challenge 事件
    Then App 应构建 connect 请求
      And auth.token 应使用已保存的 device token（优先于 gateway token）
      And device 字段应包含完整的签名信息
      And 签名 payload 中的 token 部分应使用 device token

  Scenario: Gateway 验证 device token 并授予完整 scope
    Given App 发送了包含有效 device token 和设备签名的 connect 请求
      And 该设备已通过配对审批
    When Gateway 验证 connect 请求
    Then Gateway 应验证设备签名的有效性
      And Gateway 应验证 device token 的有效性
      And Gateway 应返回 hello-ok 响应
      And 响应中可能包含新的 auth 字段（token 轮换）
      And App 应获得 ["operator.read", "operator.write"] scope
```

---

#### 场景 5：App 后续启动，直接用已存储的 device token 连接

```gherkin
Feature: 后续启动的自动连接

  Scenario: App 后续启动时自动使用已存储凭证连接
    Given App 非首次启动
      And 本地安全存储中存在有效的设备密钥对
      And 本地安全存储中存在有效的 device token
    When App 启动并初始化 Gateway 连接
    Then App 应从安全存储加载设备密钥对
      And App 应从安全存储加载 device token
      And App 应自动建立 WebSocket 连接
      And connect 请求中 auth.token 应使用已保存的 device token
      And 不应触发新的配对请求
      And 连接应直接成功，获得完整 scope

  Scenario: 已保存的 device token 已被撤销
    Given App 本地存储中存在 device token
      And 该 token 已被管理员通过 "openclaw devices revoke" 撤销
    When App 使用该 token 连接 Gateway
    Then connect 请求应失败
      And App 应清除本地存储的无效 token
      And App 应重新发起配对流程（无 token 的 connect）
      And 用户应看到"需要重新配对"的提示

  Scenario: Gateway 返回新的 device token（token 轮换）
    Given App 使用已保存的 device token 连接成功
      And hello-ok 响应中包含新的 auth.deviceToken
    When App 处理 hello-ok 响应
    Then App 应用新的 deviceToken 覆盖本地存储的旧 token
      And 后续连接应使用新 token
```

---

#### 场景 6：chat.send 成功发送消息

```gherkin
Feature: 通过 Gateway 发送聊天消息

  Scenario: 已配对设备成功发送 chat.send
    Given App 已通过设备配对连接到 Gateway
      And 当前连接拥有 "operator.write" scope
      And 存在一个活跃的会话，sessionKey 为 "<sessionKey>"
    When App 发送 chat.send 请求：
      """json
      {
        "type": "req",
        "id": "<requestId>",
        "method": "chat.send",
        "params": {
          "sessionKey": "<sessionKey>",
          "message": "你好，小金",
          "idempotencyKey": "<uuid>"
        }
      }
      """
    Then Gateway 应接受请求
      And Gateway 应返回成功响应
      And 消息应被投递到对应的会话

  Scenario: 未配对设备尝试 chat.send 被拒绝
    Given App 连接到 Gateway 但未完成设备配对
      And 当前连接不拥有 "operator.write" scope
    When App 发送 chat.send 请求
    Then Gateway 应返回权限错误
      And 错误信息应指示缺少 operator.write scope

  Scenario: 使用幂等键防止重复发送
    Given App 已成功发送一条 chat.send 请求，idempotencyKey 为 "<key>"
    When App 因网络重试使用相同的 idempotencyKey 再次发送
    Then Gateway 应识别重复请求
      And 不应重复投递消息
```

---

## 二、技术实现细节

### 1. 密钥对生成

| 项目 | 说明 |
|------|------|
| 算法 | Ed25519 |
| 公钥格式 | PEM（SPKI 编码），传输时提取 32 字节原始公钥并编码为 base64url |
| 私钥格式 | PEM（PKCS8 编码），仅本地存储，不传输 |
| 库选择 | React Native 环境推荐 `react-native-quick-crypto`（提供 Node.js crypto 兼容 API）或 `expo-crypto` + `tweetnacl` |

生成伪代码：

```typescript
import { generateKeyPairSync, createHash } from 'crypto'; // 或 react-native-quick-crypto

function generateDeviceIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  // 从 SPKI DER 中提取 32 字节原始公钥
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
  const rawPublicKey = spkiDer.subarray(ED25519_SPKI_PREFIX.length); // 32 bytes

  // 设备 ID = SHA-256(原始公钥).hex()
  const deviceId = createHash('sha256').update(rawPublicKey).digest('hex');

  return { deviceId, publicKeyPem, privateKeyPem };
}
```

### 2. 签名格式

签名 payload 是一个由 `|` 分隔的字符串，包含以下字段（按顺序）：

```
v2|{deviceId}|{clientId}|{clientMode}|{role}|{scopes}|{signedAtMs}|{token}|{nonce}
```

各字段说明：

| 字段 | 值 | 示例 |
|------|------|------|
| version | `"v2"`（当有 nonce 时） | `v2` |
| deviceId | 公钥 SHA-256 hex | `a1b2c3d4...` |
| clientId | App 标识 | `xiaojin-app` |
| clientMode | 客户端模式 | `operator` |
| role | 连接角色 | `operator` |
| scopes | 逗号分隔的 scope 列表 | `operator.read,operator.write` |
| signedAtMs | 签名时的毫秒时间戳 | `1737264000000` |
| token | auth token（无则为空字符串） | `gw_xxx...` 或 `""` |
| nonce | Gateway challenge nonce | `abc123...` |

签名过程：

```typescript
import { createPrivateKey, sign } from 'crypto';

function signPayload(privateKeyPem: string, payload: string): string {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(payload, 'utf8'), key);
  return base64UrlEncode(signature);
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}
```

### 3. device.id 的生成方式

```
device.id = SHA-256(Ed25519 公钥原始字节 32 bytes).hex()
```

- 从 PEM 公钥中提取 SPKI DER 编码
- 去掉 SPKI 前缀（`302a300506032b6570032100`，12 字节），得到 32 字节原始公钥
- 对原始公钥计算 SHA-256，输出 hex 字符串（64 字符）
- 这个 ID 是设备的唯一标识，在 Gateway 中用于识别和管理设备

### 4. device token 的本地存储

存储结构（JSON）：

```json
{
  "version": 1,
  "deviceId": "a1b2c3d4e5f6...",
  "tokens": {
    "operator": {
      "token": "dt_xxxxxxxxxxxx",
      "role": "operator",
      "scopes": ["operator.read", "operator.write"],
      "updatedAtMs": 1737264000000
    }
  }
}
```

React Native 存储方案：

| 方案 | 说明 |
|------|------|
| `expo-secure-store` | 推荐。使用 iOS Keychain / Android Keystore 加密存储 |
| `react-native-keychain` | 备选。同样使用系统级安全存储 |

存储项：

| Key | 内容 | 安全级别 |
|-----|------|---------|
| `device-identity` | `{ version, deviceId, publicKeyPem, privateKeyPem }` | 高（含私钥） |
| `device-auth-tokens` | `{ version, deviceId, tokens: { [role]: { token, role, scopes, updatedAtMs } } }` | 高（含 token） |

### 5. connect 请求的完整参数格式

```json
{
  "type": "req",
  "id": "unique-request-id",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "xiaojin-app",
      "version": "1.0.0",
      "platform": "ios",
      "mode": "operator"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.write"],
    "caps": [],
    "commands": [],
    "permissions": {},
    "auth": {
      "token": "<gateway-token 或 device-token>"
    },
    "locale": "zh-CN",
    "userAgent": "xiaojin-app/1.0.0",
    "device": {
      "id": "<SHA-256 hex of raw public key>",
      "publicKey": "<base64url of 32-byte raw public key>",
      "signature": "<base64url of Ed25519 signature>",
      "signedAt": 1737264000000,
      "nonce": "<challenge nonce from Gateway>"
    }
  }
}
```

### 6. 完整连接流程时序

```
App                                    Gateway
 |                                        |
 |--- WebSocket 连接 ---------------------->|
 |                                        |
 |<-- event: connect.challenge ------------|
 |    { nonce: "xxx", ts: 1234567890 }    |
 |                                        |
 |    [构建签名 payload]                    |
 |    [Ed25519 签名]                       |
 |                                        |
 |--- req: connect ----------------------->|
 |    { device: { id, publicKey,          |
 |      signature, signedAt, nonce },     |
 |      auth: { token }, role, scopes }   |
 |                                        |
 |    [首次连接：Gateway 创建配对请求]       |
 |    [Gateway 通知管理员]                  |
 |                                        |
 |    ... 等待管理员审批 ...                |
 |                                        |
 |<-- res: hello-ok ----------------------|
 |    { auth: { deviceToken: "dt_xxx",    |
 |      role: "operator",                 |
 |      scopes: ["operator.read",        |
 |               "operator.write"] } }    |
 |                                        |
 |    [保存 deviceToken 到安全存储]         |
 |                                        |
 |--- req: chat.send -------------------->|
 |    { sessionKey, message,              |
 |      idempotencyKey }                  |
 |                                        |
 |<-- res: ok ----------------------------|
```

### 7. 错误处理要点

| 场景 | 处理方式 |
|------|---------|
| WebSocket 连接失败 | 指数退避重试（初始 1s，最大 30s） |
| challenge 超时 | 关闭连接，重新建立 |
| 签名验证失败 | 检查密钥对完整性，必要时重新生成 |
| 配对被拒绝 | 提示用户联系管理员 |
| device token 无效/已撤销 | 清除本地 token，重新发起配对 |
| connect 超时 | 关闭连接，退避重试 |
| chat.send 缺少 scope | 检查配对状态，引导用户完成配对 |

### 8. React Native 技术选型建议

| 功能 | 推荐库 | 说明 |
|------|--------|------|
| Ed25519 密钥对 | `react-native-quick-crypto` | 提供 Node.js crypto 兼容 API，支持 Ed25519 |
| WebSocket | React Native 内置 `WebSocket` | 原生支持，无需额外库 |
| 安全存储 | `expo-secure-store` | Expo 生态，iOS Keychain / Android Keystore |
| UUID 生成 | `expo-crypto` 的 `randomUUID()` | 用于 idempotencyKey 和请求 ID |
| Base64url | 手写工具函数 | 简单的 base64 ↔ base64url 转换 |
