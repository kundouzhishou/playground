# 开发注意事项

## 首次运行

1. **安装依赖**
   ```bash
   cd /home/jayson/openclaw/workspace/playground/xiaojin-app
   npm install
   ```

2. **准备图标资源**
   - 需要创建 `assets/icon.png` (1024x1024)
   - 需要创建 `assets/splash.png` (1242x2436)
   - 需要创建 `assets/adaptive-icon.png` (Android)
   - 需要创建 `assets/favicon.png` (Web)

3. **运行项目**
   ```bash
   # 使用快速启动脚本
   ./start.sh
   
   # 或手动运行
   npm run ios      # iOS
   npm run android  # Android
   npm run web      # Web 测试
   ```

## 已知问题和解决方案

### 1. WebSocket 在 React Native 中的兼容性

当前实现使用了浏览器的 `window` 对象来分发自定义事件。在 React Native 环境中需要调整：

**解决方案**：使用 EventEmitter 或 React Context 替代 window 事件

```javascript
// 创建 src/utils/eventEmitter.js
import { EventEmitter } from 'events';
export const chatEventEmitter = new EventEmitter();

// 在 useGateway.js 中使用
chatEventEmitter.emit('chat', message.payload);

// 在 App.js 中监听
chatEventEmitter.on('chat', handleChatEvent);
```

### 2. UUID 生成

`react-native-uuid` 可能需要额外配置。如果遇到问题，可以使用简单的 UUID 生成函数：

```javascript
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
```

### 3. 语音识别权限

iOS 需要在首次使用时请求权限。确保 `app.json` 中的权限描述清晰友好。

### 4. 自动重连逻辑

当前实现在 WebSocket 断开后 3 秒自动重连。可以根据需要调整重连策略：
- 指数退避
- 最大重连次数限制
- 用户手动重连选项

## 优化建议

### 1. 添加 EventEmitter

创建 `src/utils/eventEmitter.js`：

```javascript
import { EventEmitter } from 'events';

class ChatEventEmitter extends EventEmitter {}
export const chatEvents = new ChatEventEmitter();
```

然后在 `useGateway.js` 中替换 window 事件。

### 2. 添加错误边界

创建 `src/components/ErrorBoundary.js` 来捕获和显示错误。

### 3. 添加加载状态

在连接 Gateway 时显示加载动画。

### 4. 持久化聊天记录

使用 AsyncStorage 保存聊天历史。

### 5. 语音打断

检测用户说话时自动停止 TTS 播放。

## 测试清单

- [ ] WebSocket 连接成功
- [ ] 发送消息到 Gateway
- [ ] 接收 Gateway 回复
- [ ] 语音识别（自动模式）
- [ ] 语音识别（按住说话模式）
- [ ] TTS 播放回复
- [ ] 模式切换
- [ ] 断线重连
- [ ] 权限请求
- [ ] 聊天记录滚动

## 下一步

1. 修复 WebSocket 事件分发（使用 EventEmitter）
2. 添加真实的 App 图标
3. 测试真机运行
4. 优化 UI 动画
5. 添加错误处理和用户反馈
