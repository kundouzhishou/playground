// app.config.js - Dynamic Expo config
// Reads API keys from environment variables for EAS builds

const { execSync } = require('child_process');

// 获取 git commit hash 作为 buildId
let buildId = 'unknown';
try {
  buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch (e) {
  // 构建环境可能没有 git
}

export default {
  expo: {
    name: "小金语音",
    slug: "xiaojin-voice-app",
    owner: "notjayson",
    version: "0.4.1",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#1a1a1a",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.yilian.xiaojin",
      infoPlist: {
        NSSpeechRecognitionUsageDescription: "小金需要使用语音识别来理解你说的话",
        NSMicrophoneUsageDescription: "小金需要使用麦克风来录制你的语音",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1a1a1a",
      },
      package: "com.yilian.xiaojin",
      permissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    extra: {
      eas: {
        projectId: "ba6bd7ef-c634-4630-a7d1-881bb32e630f",
      },
      // API keys injected from environment variables (EAS Secrets)
      buildId,
      openaiApiKey: process.env.OPENAI_API_KEY || "",
      elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || "",
    },
    plugins: [
      [
        "expo-av",
        {
          microphonePermission: "小金需要使用麦克风来录制你的语音",
        },
      ],
    ],
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: "https://u.expo.dev/ba6bd7ef-c634-4630-a7d1-881bb32e630f",
    },
  },
};
