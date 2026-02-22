# 小金语音 App — 版本显示 BDD 行为规范

## 概述

App 在标题下方显示版本号、构建 ID 和 OTA 更新 ID，用于快速核对当前运行的代码版本，确认 EAS OTA 推送是否生效。

---

## 一、BDD 行为规范

### 功能：版本信息显示

#### 场景 1：显示版本号和 Build ID

```gherkin
Feature: 版本信息显示

  Scenario: 本地构建时显示版本号和 buildId
    Given App 通过 EAS Build 或本地构建安装
      And app.json 中 expo.version 为 "<version>"
      And app.config.js extra.buildId 已设置为构建时间戳
    When App 启动并渲染标题栏
    Then 在"🔧 小金语音"标题下方显示：
      """
      v{version} · build:{buildId}
      """
    And 文字颜色为 #666666
    And 字号为 12

  Scenario: OTA 更新后显示 OTA Update ID
    Given App 收到 EAS OTA 更新
      And Constants.manifest2.id 存在
    When App 启动并渲染标题栏
    Then 显示 OTA update ID 的前 8 位：
      """
      v{version} · OTA:{updateId前8位}
      """
    And OTA ID 优先于 buildId 显示

  Scenario: 开发模式下显示 dev 标识
    Given App 在 Expo Go 或开发服务器中运行
      And extra.buildId 未设置
      And manifest2.id 不存在
    When App 启动
    Then 显示：
      """
      v{version} · build:dev
      """
```

---

#### 场景 2：版本信息来源优先级

```gherkin
Feature: 版本信息来源

  Scenario: OTA 更新 ID 优先于 Build ID
    Given Constants.manifest2.id 存在
      And extra.buildId 也存在
    When 计算显示文本
    Then 显示 OTA update ID（前 8 位）
      And 不显示 buildId

  Scenario: 无 OTA 时使用 Build ID
    Given Constants.manifest2.id 不存在
      And extra.buildId 为 "20250222"
    When 计算显示文本
    Then 显示 buildId

  Scenario: 两者都不存在时显示 dev
    Given Constants.manifest2.id 不存在
      And extra.buildId 不存在
    When 计算显示文本
    Then 显示 "dev"
```

---

#### 场景 3：核对更新是否生效

```gherkin
Feature: OTA 更新确认

  Scenario: 推送 OTA 后核对版本
    Given 开发者执行 eas update
      And EAS 返回 update ID "abc12345-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    When 用户打开 App（或 App 自动重载）
    Then 版本行应显示 "OTA:abc12345"
      And 开发者可对比 EAS 返回的 ID 确认更新已生效

  Scenario: OTA 未生效时仍显示旧信息
    Given App 未成功下载或应用 OTA 更新
    Then 版本行仍显示旧的 buildId 或旧的 OTA ID
      And 开发者可据此判断更新未生效
```

---

## 二、技术实现要点

### 1. 版本信息获取

```javascript
import appJson from './app.json';
import Constants from 'expo-constants';

const APP_VERSION = appJson.expo.version;
const BUILD_ID = Constants.expoConfig?.extra?.buildId || 'dev';
const UPDATE_ID = Constants.manifest2?.id?.slice(0, 8)
               || Constants.manifest?.id?.slice(0, 8)
               || null;
```

### 2. 显示逻辑

```javascript
// 显示文本
const versionText = `v${APP_VERSION} · ${UPDATE_ID ? `OTA:${UPDATE_ID}` : `build:${BUILD_ID}`}`;
```

### 3. buildId 生成

在 `app.config.js` 中通过构建时间戳生成：

```javascript
extra: {
  buildId: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
  // 或更精确的时间戳
}
```

### 4. 界面位置

版本信息显示在标题栏内，标题"🔧 小金语音"正下方，水平居中。与对话模式徽章"● 对话中"并排显示在同一行。

---

## 三、依赖

| 依赖 | 用途 |
|------|------|
| `expo-constants` | 读取 manifest、expoConfig.extra |
| `app.json` | 读取 expo.version |
| EAS Build / EAS Update | 注入 buildId 和 update ID |
