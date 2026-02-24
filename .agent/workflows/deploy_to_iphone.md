---
description: How to install DogPlanet on iPhone
---

# 在 iPhone 上安装 DogPlanet

有两种主要方式可以在您的手机上运行这个 App：

## 方法一：使用 Expo Go (开发调试用 - 最快)

这是开发阶段最常用的方式，不需要苹果开发者账号。

1.  **在 iPhone 上安装 App**：
    *   打开 App Store，搜索并下载安装 **"Expo Go"**。

2.  **连接电脑**：
    *   确保您的 iPhone 和电脑连接在**同一个 Wi-Fi** 网络下。

3.  **运行项目**：
    *   在终端中运行：`npx expo start`
    *   终端会出现一个巨大的二维码。

4.  **扫码运行**：
    *   打开 iPhone 相机（或 Expo Go 应用内的扫码器），扫描终端里的二维码。
    *   App 就会开始在手机上加载运行了！

---

## 方法二：生成安装包 (EAS Build - 体验更接近正式版)

如果您想生成一个独立的 App 图标，或者 Expo Go 无法满足需求，可以使用 EAS Build。这通常需要苹果开发者账号 ($99/年)。

1.  **安装 EAS CLI**：
    ```bash
    npm install -g eas-cli
    ```

2.  **登录 Expo**：
    ```bash
    eas login
    ```

3.  **配置项目** (如果还没配置)：
    ```bash
    eas build:configure
    ```

4.  **构建 iOS 版本**：
    ```bash
    eas build -p ios --profile development
    ```
    *   这会生成一个可以安装在您注册设备上的开发版 App。
    *   构建完成后，扫描终端给出的二维码即可安装。

> **注意**：方法二通常需要您有一个 Apple Developer 账号，并且将设备的 UDID 注册到账号中。如果是为了快速查看效果，强烈建议先使用 **方法一 (Expo Go)**。
