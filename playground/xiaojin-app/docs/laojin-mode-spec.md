# 小金语音 App — 老金模式 BDD 行为规范

## 概述

老金模式允许老金的家人/朋友直接与小金对话，小金会使用老金的声音克隆回复，并以老金的语气和身份说话。通过语音指令激活/退出，支持按对话者隔离独立 session，确保不同家人的对话历史互不干扰。

---

## 一、BDD 行为规范

### 功能：老金模式激活

#### 场景 1：语音指令激活老金模式

```gherkin
Feature: 老金模式激活

  Scenario: 用户说"小金，接下来我儿子MC跟你说话"
    Given 对话模式已激活
      And 老金模式未激活
    When 用户的语音识别文本匹配以下任一模式：
      | 模式正则                  | 示例                        |
      | /接下来(.+?)跟你说/      | "接下来我儿子MC跟你说话"     |
      | /切换到老金/              | "切换到老金模式"             |
      | /用老金的声音/            | "用老金的声音说话"           |
    Then 从匹配文本中提取关系和名字
      And 保存当前声音 ID 到 previousVoiceIdRef
      And 将 TTS 声音切换为老金声音（C8otL3VoqHTolV9MV6ox）
      And 设置 isLaojinMode = true
      And 设置 laojinTarget（对话者标识）
      And 清空当前消息列表
      And 显示系统提示："已进入老金模式，对话者：{displayLabel}"
      And 用老金声音播放确认语音："好的，已切换到老金模式"
      And 该条语音指令不发送到 Gateway

  Scenario: 提取关系和名字
    Given 用户说"接下来我儿子MC跟你说话"
    When 解析激活指令中的捕获组
    Then 匹配"我+关系+名字"模式
      And 关系 = "儿子"
      And 名字 = "MC"
      And displayLabel = "儿子 MC"
      And sessionId = "MC"

  Scenario: 只有关系没有名字
    Given 用户说"接下来我老婆跟你说话"
    When 解析激活指令
    Then 关系 = "老婆"
      And 名字 = null
      And displayLabel = "老婆"
      And sessionId = "老婆"

  Scenario: 没有匹配到关系词
    Given 用户说"接下来张垚跟你说话"
    When 解析激活指令
    Then 关系 = null
      And 名字 = "张垚"
      And displayLabel = "张垚"
      And sessionId = "张垚"

  Scenario: 支持的关系词列表
    Then 以下关系词均可被识别：
      | 关系词 |
      | 儿子、女儿、老婆、老公、妻子、丈夫 |
      | 爸爸、妈妈、哥哥、姐姐、弟弟、妹妹 |
      | 爷爷、奶奶、外公、外婆 |
      | 叔叔、阿姨、朋友、同事、同学、室友、闺蜜、兄弟 |
```

---

#### 场景 2：独立 Session 隔离

```gherkin
Feature: 对话者 Session 隔离

  Scenario: 老金模式使用独立 sessionKey
    Given 默认 sessionKey 为 "xiaojin-voice-v2"
      And 老金模式已激活，对话者标识为 "MC"
    When 发送消息到 Gateway
    Then 使用 sessionKey = "xiaojin-voice-v2-laojin-MC"
      And 与默认 session 的对话历史完全隔离

  Scenario: 不同对话者使用不同 session
    Given 老金模式下对话者为 "MC"
      And sessionKey = "xiaojin-voice-v2-laojin-MC"
    When 退出老金模式后重新激活，对话者为 "老婆"
    Then sessionKey = "xiaojin-voice-v2-laojin-老婆"
      And 与 MC 的对话历史互不影响
```

---

#### 场景 3：上下文注入

```gherkin
Feature: 老金模式上下文注入

  Scenario: 消息前注入身份提示
    Given 老金模式已激活
      And 当前对话者标识为 "MC"
    When 用户发送消息"你好"
    Then 在消息前注入系统提示前缀：
      """
      [系统提示：当前与你对话的是老金的MC，不是老金本人。
      请用老金的语气回复——温暖、直接、务实、不废话。你在代表老金说话。
      根据对话者的身份调整你的态度，比如对小孩要耐心温柔。]
      """
      And 实际发送到 Gateway 的消息 = 上下文前缀 + "\n\n" + 原始消息

  Scenario: 如果对话者标识为空
    Given 老金模式已激活
      And laojinTarget 为 null
    When 注入上下文
    Then 上下文中使用"老金的家人"作为默认描述
```

---

### 功能：老金模式退出

#### 场景 4：语音指令退出

```gherkin
Feature: 老金模式退出

  Scenario: 用户说"退出老金"或"我回来了"
    Given 老金模式已激活
    When 用户的语音识别文本匹配以下任一模式：
      | 模式正则          | 示例         |
      | /退出老金/        | "退出老金"   |
      | /我回来了/        | "我回来了"   |
      | /结束老金模式/    | "结束老金模式" |
    Then 恢复之前保存的声音 ID（previousVoiceIdRef）
      And 将恢复的声音 ID 保存到 AsyncStorage
      And 设置 isLaojinMode = false
      And 设置 laojinTarget = null
      And 清除 previousVoiceIdRef
      And 清空当前消息列表
      And 显示系统提示："已退出老金模式"
      And 用恢复后的声音播放确认语音："好的，已退出老金模式"
      And 切换回默认 sessionKey（"xiaojin-voice-v2"）
      And 该条语音指令不发送到 Gateway

  Scenario: 非老金模式下说退出指令无效
    Given 老金模式未激活
    When 用户说"退出老金"
    Then 不做任何处理
      And 正常发送该消息到 Gateway
```

---

#### 场景 5：声音选择器状态

```gherkin
Feature: 老金模式下声音选择器

  Scenario: 老金模式激活时声音选择器显示模式标签
    Given 老金模式已激活
    Then 声音选择器显示"🎭 老金模式"
      And 选择器不可点击（disabled = true）
      And 背景色为暖色调（#3a2a1a）

  Scenario: 老金模式退出后声音选择器恢复
    Given 老金模式已退出
    Then 声音选择器恢复正常功能
      And 显示当前声音名称
      And 选择器可点击
```

---

#### 场景 6：界面提示

```gherkin
Feature: 老金模式界面提示

  Scenario: 显示老金模式提示条
    Given 老金模式已激活
      And 对话者标识为 "MC"
    Then 在标题栏下方显示橙色提示条：
      """
      🎭 老金模式 · 对话者：MC
      """
      And 背景色为 rgba(255, 152, 0, 0.15)
      And 文字颜色为 #FFB74D

  Scenario: 无对话者标识时不显示对话者
    Given 老金模式已激活
      And laojinTarget 为 null
    Then 提示条显示："🎭 老金模式"
```

---

## 二、技术实现要点

### 1. 模式切换指令检测

`detectModeSwitch(text)` 函数在每次语音识别结果返回后调用，优先于消息发送：

```
语音识别 → detectModeSwitch() → 如果 action=activate/deactivate → 处理模式切换，return
                               → 如果 action=null → 正常发送消息
```

### 2. Session 隔离机制

```
默认 session: xiaojin-voice-v2
老金模式 session: xiaojin-voice-v2-laojin-{target}
```

- `target` 来自对话者名字或关系词
- 消息列表在模式切换时清空，仅显示当前 session 的消息
- Gateway 端 session 持久化，切换回同一对话者时历史仍在

### 3. 声音切换流程

```
激活：保存当前 voiceId → 切换到 LAOJIN_VOICE_ID → 禁用选择器
退出：从 ref 恢复 voiceId → 保存到 AsyncStorage → 恢复选择器
```

### 4. 关系词正则

```javascript
/^(?:我)?(?:的)?(儿子|女儿|老婆|老公|妻子|丈夫|爸爸|妈妈|朋友|同事|...)(.*)$/
```

- 可选"我"和"的"前缀
- 关系词匹配后，剩余部分作为名字
- 未匹配关系词时，整段作为名字

---

## 三、依赖

| 依赖 | 用途 |
|------|------|
| ElevenLabs API（老金声音 ID） | 老金声音克隆 TTS |
| `@react-native-async-storage/async-storage` | 声音选择持久化 |
| Gateway `chat.send` | 使用隔离 sessionKey 发送消息 |
