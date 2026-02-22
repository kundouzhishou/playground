# 小金语音 App — 语音合成（TTS）BDD 行为规范

## 概述

使用 ElevenLabs TTS API 将文字转为语音朗读。支持多声音切换（Chris/Jessica/老金克隆）、语速调节、口语化转换（gpt-4o-mini 将书面文字转为自然口语），以及 TTS 可打断（用户开始说话时自动停止朗读）。

---

## 一、BDD 行为规范

### 功能：ElevenLabs TTS 语音合成

#### 场景 1：Agent 回复文本朗读

```gherkin
Feature: TTS 语音合成

  Scenario: 收到 Agent 最终回复后朗读
    Given 对话模式已激活
      And Agent 返回最终回复文本
    When App 收到 state=final 的聊天事件
    Then 播放 "received" 音效
      And 将回复文本传入口语化转换服务
      And 将口语化文本发送到 ElevenLabs TTS API
      And 将返回的 MP3 音频保存为临时文件
      And 使用 expo-av 播放音频
      And 播放完成后 isSpeaking 状态设为 false

  Scenario: TTS API 调用失败
    Given Agent 回复需要朗读
    When ElevenLabs TTS API 返回错误
    Then 应记录错误日志
      And isSpeaking 状态设为 false
      And 不阻断对话流程（用户仍可继续录音）
```

---

#### 场景 2：口语化转换

```gherkin
Feature: 文字口语化转换

  Scenario: Agent 回复经 GPT-4o-mini 转为口语
    Given Agent 回复文本长度 >= 10 个字符
    When 调用口语化转换服务
    Then 使用 GPT-4o-mini 模型
      And 系统提示词为：
        """
        将以下文字转换为适合语音朗读的口语化中文。去掉 emoji、代码块、列表符号、markdown 格式。
        用自然的口语表达，简洁明了。如果内容包含技术细节或代码，用通俗语言描述。
        直接输出转换后的文字，不要加任何前缀。
        """
      And temperature 设为 0.3
      And 返回口语化版本用于 TTS
      And 原始文本仍然在聊天界面显示（不替换）

  Scenario: 短文本跳过口语化转换
    Given Agent 回复文本长度 < 10 个字符
    When 需要朗读
    Then 直接使用原文朗读，跳过口语化转换

  Scenario: 口语化转换失败时 fallback
    Given Agent 回复需要口语化转换
    When GPT-4o-mini API 调用失败（网络错误或返回空结果）
    Then 使用原始文本朗读
      And 不抛出错误
      And 记录警告日志
```

---

#### 场景 3：声音选择

```gherkin
Feature: 多声音切换

  Scenario: 用户在声音选择器中切换声音
    Given 声音选择器显示当前声音名称
    When 用户点击声音选择器
    Then 弹出声音选项列表：
      | 声音 ID                         | 名称     | 标签           |
      | iP95p4xoKVk53GoZ742B          | Chris    | 男声 · 温暖随和 |
      | cgSgspJ2msm6clMCkdW9          | Jessica  | 女声 · 活泼明亮 |
    When 用户选择一个声音
    Then 更新 selectedVoiceId
      And 后续 TTS 使用新声音
      And 将选择持久化到 AsyncStorage（key: @xiaojin_voice_id）

  Scenario: App 启动时恢复上次选择的声音
    Given App 启动
    When 初始化声音设置
    Then 从 AsyncStorage 读取已保存的声音 ID
      And 如果存在，使用已保存的声音
      And 如果不存在，使用默认声音（Chris: iP95p4xoKVk53GoZ742B）

  Scenario: 老金模式激活时声音选择器禁用
    Given 老金模式已激活
    When 声音选择器渲染
    Then 显示"🎭 老金模式"标签
      And 声音选择器不可点击
      And TTS 使用老金声音（C8otL3VoqHTolV9MV6ox）
```

---

#### 场景 4：语速调节

```gherkin
Feature: TTS 语速调节

  Scenario: 用户调节语速
    Given 语速显示区域显示当前语速（默认 1.0x）
    When 用户点击"+"按钮
    Then 语速增加 0.1（四舍五入到一位小数）
      And 最大不超过 2.0x
    When 用户点击"−"按钮
    Then 语速减少 0.1
      And 最小不低于 0.5x

  Scenario: 语速应用到 TTS
    Given 用户已设置语速为 <speed>
    When TTS 朗读时
    Then speakWithOpenAI 函数接收 speed 参数
```

---

#### 场景 5：TTS 可打断

```gherkin
Feature: TTS 打断

  Scenario: 用户在朗读中点击屏幕打断
    Given 对话模式已激活
      And TTS 正在朗读（isSpeaking = true）
    When 用户点击屏幕
    Then 立即停止 TTS 播放
      And 卸载当前 Sound 实例
      And isSpeaking 设为 false
      And 播放 "start" 音效
      And 开始新一轮录音

  Scenario: 用户点击麦克风按钮打断
    Given TTS 正在朗读
    When 用户点击麦克风按钮
    Then 停止 TTS 播放
      And 开始录音
```

---

## 二、技术实现要点

### 1. ElevenLabs TTS API

| 项目 | 说明 |
|------|------|
| 端点 | `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}` |
| 模型 | `eleven_multilingual_v2` |
| 认证 | `xi-api-key: <ELEVENLABS_API_KEY>` |
| 输出格式 | `audio/mpeg`（MP3） |
| voice_settings.stability | 0.75 |
| voice_settings.similarity_boost | 0.75 |

### 2. 音频播放流程

```
ElevenLabs API 返回 → Blob → base64 → 写入临时文件 → expo-av Sound 播放
```

- 临时文件路径：`FileSystem.cacheDirectory + 'tts_output.mp3'`
- 播放前先停止并卸载上一个 Sound 实例
- 播放完成回调中卸载 Sound 并通知状态更新

### 3. 口语化转换

| 项目 | 说明 |
|------|------|
| 模型 | `gpt-4o-mini` |
| 用途 | 将 markdown/代码/emoji 等书面内容转为自然口语 |
| 失败策略 | fallback 到原文，不影响朗读 |

### 4. 声音 ID 映射

| 名称 | ElevenLabs Voice ID | 备注 |
|------|---------------------|------|
| Chris | `iP95p4xoKVk53GoZ742B` | 默认声音，男声 |
| Jessica | `cgSgspJ2msm6clMCkdW9` | 女声 |
| 老金 | `C8otL3VoqHTolV9MV6ox` | 老金声音克隆，仅老金模式使用 |

---

## 三、依赖

| 依赖 | 用途 |
|------|------|
| `expo-av` | 音频播放（Sound） |
| `expo-file-system` | 临时文件写入 |
| ElevenLabs API | 文字转语音合成 |
| OpenAI GPT-4o-mini API | 口语化转换 |
| `@react-native-async-storage/async-storage` | 声音选择持久化 |
