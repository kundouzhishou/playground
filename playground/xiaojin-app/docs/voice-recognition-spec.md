# 小金语音 App — 语音识别 BDD 行为规范

## 概述

使用 OpenAI Whisper API 将用户语音转为文字，替代原生语音识别。结合 VAD（Voice Activity Detection）沉默窗口机制，支持多段语音累积发送，提供带标点的中文识别结果。

---

## 一、BDD 行为规范

### 功能：录音与语音识别

#### 场景 1：用户开始录音

```gherkin
Feature: 录音启动

  Scenario: 用户点击屏幕唤醒后开始录音
    Given App 已连接 Gateway
      And 对话模式未激活（待机状态）
    When 用户点击屏幕
    Then 应激活对话模式
      And 播放 "start"（叮）音效
      And 开始录音
      And 显示录音时长计时器（每秒更新：正在录音... 0s、1s、2s...）

  Scenario: 用户摇一摇唤醒后开始录音
    Given App 已连接 Gateway
      And 对话模式未激活（待机状态）
      And 加速度计检测已启用
    When 用户摇晃手机（加速度变化量 > 1.5g）
    Then 应激活对话模式
      And 播放 "start"（叮）音效
      And 开始录音
      And 显示录音时长计时器

  Scenario: 对话中朗读结束后自动开始下一轮录音
    Given 对话模式已激活
      And TTS 朗读刚结束
      And 当前未在录音、未在思考
    When 延迟 500ms 后状态仍然空闲
    Then 播放 "start"（叮）音效
      And 自动开始录音
```

---

#### 场景 2：录音结束并识别

```gherkin
Feature: Whisper 语音识别

  Scenario: 用户停止录音并上传识别
    Given 用户正在录音
    When 用户点击麦克风按钮停止录音
    Then 停止录音，获取音频文件 URI
      And 显示"识别中..."
      And 将音频文件读取为 base64
      And 构建 FormData，包含：
        | 字段             | 值              |
        | file             | recording.m4a   |
        | model            | whisper-1       |
        | language         | zh              |
        | response_format  | text            |
      And 上传到 OpenAI Whisper API（https://api.openai.com/v1/audio/transcriptions）
      And 返回带标点的中文文本

  Scenario: 录音权限未授权
    Given 用户未授予录音权限
    When 用户尝试开始录音
    Then 应请求录音权限
      And 如果用户拒绝，显示错误提示"未获得录音权限"

  Scenario: Whisper API 调用失败
    Given 用户已完成录音
    When 上传到 Whisper API 时返回非 200 状态码
    Then 应显示错误提示"语音识别失败"
      And 播放 "error" 音效
      And 不发送任何消息到 Gateway
```

---

#### 场景 3：VAD 累积发送

```gherkin
Feature: VAD 沉默窗口累积发送

  Scenario: 识别完一句后进入沉默等待
    Given 用户完成一段录音
      And Whisper 返回有效文本
    When 识别结果返回
    Then 将文本加入待发送队列
      And 播放 "sent"（嘟）音效
      And 显示已识别文本和"等待中..."
      And 启动 3 秒沉默计时器

  Scenario: 沉默窗口内用户继续说话
    Given 沉默计时器正在倒计时（3 秒内）
      And 待发送队列中已有一段或多段文本
    When 用户再次开始录音
    Then 清除沉默计时器
      And 继续录音
      And 新识别结果追加到待发送队列

  Scenario: 沉默窗口到期，合并发送
    Given 沉默计时器正在倒计时
      And 待发送队列中有一段或多段文本
    When 3 秒内无新录音输入
    Then 播放 "sent"（咚）音效
      And 将队列中所有文本用空格合并
      And 清空待发送队列
      And 将合并文本发送到 Gateway（chat.send）
```

---

#### 场景 4：静音检测（待实现）

```gherkin
Feature: 静音自动取消

  Scenario: 录音开始后持续无人声
    Given 用户已开始录音
    When 录音开始后 2-3 秒内未检测到人声
    Then 自动取消录音
      And 不上传 Whisper API
      And 不发送任何消息到 Gateway
```

---

#### 场景 5：最短录音过滤（待实现）

```gherkin
Feature: 短录音过滤

  Scenario: 录音时长不到 0.5 秒
    Given 用户已开始录音
    When 用户在 0.5 秒内停止录音
    Then 丢弃该录音
      And 不上传 Whisper API
      And 不显示识别结果
```

---

#### 场景 6：空结果过滤（待实现）

```gherkin
Feature: 空识别结果过滤

  Scenario: Whisper 返回空字符串或纯标点
    Given 用户已完成录音并上传 Whisper
    When Whisper 返回空字符串、空白字符或纯标点符号
    Then 不将结果加入待发送队列
      And 不发送到 Gateway
      And 日志记录"未识别到有效文本"
```

---

## 二、技术实现要点

### 1. 录音配置

| 项目 | 说明 |
|------|------|
| 录音库 | `expo-av`（`Audio.Recording`） |
| 录音质量 | `Audio.RecordingOptionsPresets.HIGH_QUALITY` |
| 输出格式 | m4a（Whisper 支持的格式） |
| 音频模式 | 录音时 `allowsRecordingIOS: true`，结束后恢复为 `false` |

### 2. Whisper API 调用

| 项目 | 说明 |
|------|------|
| 端点 | `POST https://api.openai.com/v1/audio/transcriptions` |
| 模型 | `whisper-1` |
| 语言 | `zh`（中文） |
| 响应格式 | `text`（纯文本，非 JSON） |
| 认证 | `Authorization: Bearer <OPENAI_API_KEY>` |

### 3. VAD 沉默窗口

| 项目 | 说明 |
|------|------|
| 窗口时长 | 3000ms（`SILENCE_WINDOW_MS`） |
| 累积方式 | 数组存储多段文本，超时后用空格合并 |
| 计时器管理 | 每次新识别结果到达时重置计时器 |

### 4. 录音时长显示

| 项目 | 说明 |
|------|------|
| 更新频率 | 每秒更新一次 |
| 显示格式 | "正在录音... Ns" |
| 识别中 | 显示"识别中..." |
| 识别后 | 显示"已识别: "文本" (等待中...)" |

---

## 三、依赖

| 依赖 | 用途 |
|------|------|
| `expo-av` | 录音和音频播放 |
| `expo-file-system` | 读取录音文件为 base64 |
| OpenAI Whisper API | 语音转文字 |
| `expo-sensors`（`Accelerometer`） | 摇一摇检测 |
