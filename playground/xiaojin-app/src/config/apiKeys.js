/**
 * API 配置统一管理
 * 
 * API keys 从 expo-constants 读取（通过 app.config.js 的 extra 字段注入）
 * EAS 构建时通过 EAS Secrets 环境变量注入
 * 本地开发时通过 .env 文件注入（或直接设置环境变量）
 */

import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || {};

export const OPENAI_CONFIG = {
  apiKey: extra.openaiApiKey || '',
  whisperModel: 'whisper-1',
  ttsModel: 'tts-1-hd',
  miniModel: 'gpt-4o-mini',
};

export const ELEVENLABS_CONFIG = {
  apiKey: extra.elevenlabsApiKey || '',
  modelId: 'eleven_multilingual_v2',
  stability: 0.75,
  similarityBoost: 0.75,
};

// 可选声音列表（仅 Chris 和 Jessica，老金声音通过语音指令激活）
export const VOICE_OPTIONS = [
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', label: '男声 · 温暖随和' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', label: '女声 · 活泼明亮' },
];

// 默认声音：Chris
export const DEFAULT_VOICE_ID = 'iP95p4xoKVk53GoZ742B';

// 老金声音 ID（仅通过语音指令"老金模式"激活）
export const LAOJIN_VOICE_ID = 'C8otL3VoqHTolV9MV6ox';
