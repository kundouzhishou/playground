# 小金语音 App — 对话循环 BDD 行为规范

## 概述

小金语音 App 实现了完全免视觉的语音交互循环：待机 → 唤醒 → 录音 → 发送 → 等待 → 朗读 → 自动下一轮。用户无需看屏幕即可完成多轮对话，通过音效和呼吸灯提供状态反馈。

---

## 一、BDD 行为规范

### 功能：免视觉交互循环

#### 场景 1：完整对话循环

```gherkin
Feature: 对话循环流程

  Scenario: 从待机到完成一轮对话
    Given App 已连接 Gateway
      And 对话模式未激活（待机状态）
    When 用户唤醒（点击屏幕或摇一摇）
    Then 激活对话模式
      And 播放 "start"（叮）音效
      And 呼吸灯变为橙色
      And 开始录音

    When 用户停止说话，点击麦克风
    Then 停止录音
      And 上传 Whisper 识别
      And 等待 3 秒 VAD 沉默窗口

    When 沉默窗口到期
    Then 播放 "sent"（嘟）音效
      And 发送合并文本到 Gateway（chat.send）
      And 呼吸灯变为蓝色（思考中）
      And 开始思考脉冲提示音（每 3 秒）

    When Agent 开始流式回复
    Then 停止思考提示音
      And 聊天界面逐字显示回复（delta 事件）

    When Agent 返回最终回复
    Then 播放 "received" 音效
      And 呼吸灯变为绿色（朗读中）
      And 口语化转换后 TTS 朗读

    When 朗读结束
    Then 延迟 500ms
      And 播放 "start"（叮）音效
      And 自动开始下一轮录音
      And 启动 30 秒无活动计时器
```

---

#### 场景 2：唤醒方式

```gherkin
Feature: 对话唤醒

  Scenario: 点击屏幕唤醒
    Given 对话模式未激活
      And App 已连接 Gateway
    When 用户点击屏幕任意位置（Pressable 覆盖层）
    Then 激活对话模式
      And 开始录音流程

  Scenario: 摇一摇唤醒
    Given 对话模式未激活
      And App 已连接 Gateway
      And 加速度计检测已启用
    When 设备加速度变化量 > 1.5g
      And 距上次摇晃 > 500ms（防抖）
    Then 激活对话模式
      And 开始录音流程

  Scenario: 已在对话中时摇一摇不触发
    Given 对话模式已激活
    When 用户摇晃手机
    Then 不做任何操作（摇一摇检测已禁用）
```

---

#### 场景 3：结束对话

```gherkin
Feature: 对话结束

  Scenario: 关键词结束
    Given 对话模式已激活
    When 用户说出以下任一关键词：
      | 关键词 |
      | 再见   |
      | 结束   |
      | 拜拜   |
      | 没事了 |
    Then 不发送该消息到 Gateway
      And 播放 "end" 音效
      And 停止呼吸灯动画
      And 退出对话模式
      And 如果正在朗读，停止 TTS

  Scenario: 30 秒无活动超时结束
    Given 对话模式已激活
      And 无活动计时器已启动
    When 30 秒内没有录音、思考、朗读活动
    Then 自动结束对话模式
      And 播放 "end" 音效
      And 停止呼吸灯动画

  Scenario: 有活动时重置无活动计时器
    Given 无活动计时器正在倒计时
    When 用户开始录音、或 Agent 在思考、或 TTS 在朗读
    Then 清除无活动计时器
      And 活动结束后重新启动计时器
```

---

### 功能：音效系统

#### 场景 4：各环节音效

```gherkin
Feature: 音效管理

  Scenario: App 启动时预加载所有音效
    Given App 启动
    When 初始化音效服务
    Then 预加载以下 WAV 音效文件到内存：
      | 音效名称   | 文件                          | 音量 | 用途        |
      | start     | assets/sounds/start.wav      | 0.7  | 开始录音    |
      | received  | assets/sounds/received.wav   | 0.7  | 收到回复    |
      | sent      | assets/sounds/sent.wav       | 0.7  | 发送消息    |
      | thinking  | assets/sounds/thinking.wav   | 0.3  | 思考提示    |
      | error     | assets/sounds/error.wav      | 0.7  | 错误提示    |
      | end       | assets/sounds/end.wav        | 0.7  | 对话结束    |
    And 设置音频模式：playsInSilentModeIOS = true

  Scenario: 播放音效时从头播放
    Given 音效已预加载
    When 触发播放某个音效
    Then 将播放位置重置为 0
      And 播放音效（允许快速重复触发）
```

---

#### 场景 5：思考中脉冲提示音

```gherkin
Feature: 思考提示音

  Scenario: Agent 思考时播放脉冲提示音
    Given 对话模式已激活
      And 消息已发送到 Gateway
    When isThinking 变为 true
    Then 立即播放一次 "thinking" 音效
      And 每 3 秒重复播放 "thinking" 音效
      And 音量为 0.3（极轻）

  Scenario: Agent 开始回复时停止提示音
    Given 思考脉冲提示音正在循环播放
    When isThinking 变为 false（收到流式回复或最终回复）
    Then 清除 3 秒 interval
      And 停止播放思考提示音
```

---

### 功能：呼吸灯效果

#### 场景 6：呼吸灯状态指示

```gherkin
Feature: 呼吸灯动画

  Scenario: 对话中根据状态切换呼吸灯颜色
    Given 对话模式已激活
    When 状态为录音中（isListening = true）
    Then 呼吸灯颜色为橙色（rgba(255, 120, 50)）
    When 状态为思考中（isThinking = true）
    Then 呼吸灯颜色为蓝色（rgba(50, 120, 255)）
    When 状态为朗读中（isSpeaking = true）
    Then 呼吸灯颜色为绿色（rgba(50, 200, 100)）
    When 状态为等待中（以上均为 false）
    Then 呼吸灯颜色为灰色（rgba(100, 100, 100)）

  Scenario: 呼吸灯动画效果
    Given 对话模式已激活
      And 呼吸灯颜色已设定
    Then 背景层以 2 秒周期做透明度呼吸动画
      And 透明度在 0.05 ~ 0.15 之间循环
      And 使用 Animated.loop + Animated.sequence

  Scenario: 对话结束时停止呼吸灯
    Given 呼吸灯动画正在播放
    When 对话模式退出
    Then 停止动画
      And 重置透明度为 0
      And 清除呼吸灯颜色
```

---

### 功能：流式显示回复

#### 场景 7：Delta 事件逐字显示

```gherkin
Feature: 流式文本显示

  Scenario: 收到 delta 事件时实时更新聊天界面
    Given 消息已发送到 Gateway
    When 收到 chat 事件，state=delta
    Then 提取 payload.message.content[0].text（累积文本）
      And 如果是首个 delta：在消息列表末尾添加助手消息占位
      And 如果是后续 delta：更新最后一条助手消息的文本
      And isStreaming 设为 true
      And isThinking 设为 false（停止思考提示音）

  Scenario: 收到 final 事件时完成显示
    Given 流式文本正在显示
    When 收到 chat 事件，state=final
    Then 更新最后一条助手消息为最终文本
      And isStreaming 设为 false
      And 开始 TTS 朗读最终文本
```

---

### 功能：对话模式状态提示

#### 场景 8：界面状态提示

```gherkin
Feature: 对话状态提示

  Scenario: 对话模式中显示状态指示
    Given 对话模式已激活
    Then 界面显示状态提示文字：
      | 状态       | 显示文字      |
      | 录音中     | 🎙 正在听... |
      | 思考中     | 🤔 思考中... |
      | 朗读中     | 🔊 朗读中... |
      | 等待中     | ⏳ 等待中... |
    And 显示副标题："说"再见"或 30 秒无操作自动结束"

  Scenario: 待机状态显示唤醒提示
    Given 对话模式未激活
    Then 显示"点击屏幕或摇一摇开始对话"

  Scenario: 对话模式中显示绿色徽章
    Given 对话模式已激活
    Then 标题栏旁显示"● 对话中"绿色徽章
```

---

## 二、技术实现要点

### 1. 状态机

```
待机 (idle)
  ↓ 点击屏幕 / 摇一摇
唤醒 → 录音 (listening)
  ↓ 停止录音
识别 → VAD 等待 (waiting)
  ↓ 3秒沉默 / ↑ 再次说话（循环回录音）
发送 → 思考 (thinking)
  ↓ 收到 delta
流式显示 (streaming)
  ↓ 收到 final
朗读 (speaking)
  ↓ 朗读结束
自动下一轮 → 录音 (listening)
  ↓ 30秒无活动 / 结束关键词
结束 → 待机 (idle)
```

### 2. 关键计时器

| 计时器 | 时长 | 用途 |
|--------|------|------|
| 沉默窗口 | 3000ms | VAD 多段累积发送 |
| 无活动超时 | 30000ms | 自动结束对话 |
| 思考提示音 | 每 3000ms | 脉冲提示 Agent 在思考 |
| 自动下轮延迟 | 500ms | 朗读结束到下一轮录音间隔 |
| 录音时长显示 | 每 1000ms | 显示已录音秒数 |

### 3. 呼吸灯动画

| 项目 | 说明 |
|------|------|
| 动画库 | React Native `Animated` |
| 周期 | 4 秒（2 秒升 + 2 秒降） |
| 透明度范围 | 0.05 ~ 0.15 |
| 覆盖方式 | `StyleSheet.absoluteFill` + `pointerEvents="none"` |
| 颜色切换 | useEffect 监听 isListening/isThinking/isSpeaking 自动切换 |

### 4. 音效文件

所有音效为 WAV 格式，存放在 `assets/sounds/` 目录，App 启动时一次性预加载到内存。

---

## 三、依赖

| 依赖 | 用途 |
|------|------|
| `expo-av` | 录音、音频播放、音效 |
| `expo-sensors` | 加速度计（摇一摇检测） |
| `react-native` Animated | 呼吸灯动画 |
| Gateway WebSocket | 消息收发、流式事件 |
| Whisper API | 语音识别 |
| ElevenLabs API | TTS 合成 |
