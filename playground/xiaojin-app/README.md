# 小金语音 App

一个基于 Expo (React Native) 的语音聊天应用，通过 WebSocket 直连 OpenClaw Gateway。

## 项目信息

- **Bundle ID**: com.yilian.xiaojin
- **App 名称**: 小金语音
- **框架**: Expo (React Native)

## 核心功能

1. **语音对话（中文）**
   - STT: iOS 原生语音识别 (@react-native-voice/voice)
   - TTS: iOS 原生 TTS (expo-speech)

2. **两种交互模式**
   - 自动检测说话（默认）：打开后持续监听，检测到说话自动识别
   - 按住说话：长按按钮录音，松手发送

3. **文字聊天记录显示**
   - 用户消息靠右（蓝色气泡）
   - 小金回复靠左（灰色气泡）

4. **WebSocket 直连 OpenClaw Gateway**
   - 实时双向通信
   - 自动重连机制

## 项目结构

```
xiaojin-app/
├── App.js                          # 主应用组件
├── app.json                        # Expo 配置
├── package.json                    # 依赖配置
├── babel.config.js                 # Babel 配置
├── src/
│   ├── config/
│   │   └── gateway.js              # Gateway 配置（URL、Token）
│   ├── hooks/
│   │   ├── useGateway.js           # Gateway WebSocket 连接 Hook
│   │   └── useSpeech.js            # 语音识别和 TTS Hook
│   └── components/
│       ├── ChatHistory.js          # 聊天记录组件
│       ├── MicrophoneButton.js     # 麦克风按钮组件
│       ├── StatusBar.js            # 状态指示组件
│       └── ModeSwitch.js           # 模式切换组件
└── README.md                       # 项目说明
```

## 安装和运行

### 1. 安装依赖

```bash
cd /home/jayson/openclaw/workspace/playground/xiaojin-app
npm install
```

### 2. 运行项目

```bash
# iOS
npm run ios

# Android
npm run android

# Web (测试用)
npm run web
```

## 配置说明

### Gateway 配置

在 `src/config/gateway.js` 中修改：

```javascript
export const GATEWAY_CONFIG = {
  url: 'wss://gw.web3hunter.org',
  token: '你的 Token',
  sessionKey: 'xiaojin-voice',
  // ...
};
```

## 使用说明

1. **启动 App**：自动连接到 Gateway
2. **自动模式**（默认）：
   - 点击麦克风按钮开始监听
   - 说话后自动识别并发送
   - 再次点击停止监听
3. **按住说话模式**：
   - 切换开关到"按住说话"
   - 长按麦克风按钮开始录音
   - 松手自动发送
4. **接收回复**：小金的回复会自动朗读并显示在聊天记录中

## 权限说明

### iOS

- 麦克风权限：用于语音识别
- 语音识别权限：用于 STT

### Android

- RECORD_AUDIO：用于录音和语音识别

## 技术栈

- **Expo**: React Native 开发框架
- **@react-native-voice/voice**: 语音识别
- **expo-speech**: 文字转语音
- **WebSocket**: 实时通信
- **React Hooks**: 状态管理

## 注意事项

1. 需要真机测试（语音功能在模拟器上可能不可用）
2. 确保设备已授予麦克风和语音识别权限
3. 需要网络连接才能与 Gateway 通信
4. iOS 需要在 Info.plist 中配置权限说明

## 开发计划

- [ ] 添加语音波形可视化
- [ ] 支持多轮对话上下文
- [ ] 添加聊天记录持久化
- [ ] 支持语音打断（说话时停止 TTS）
- [ ] 添加设置页面（调整语速、音量等）
