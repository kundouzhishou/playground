/**
 * API 配置统一管理
 * 
 * 优先级：
 * 1. EAS 构建时通过 Constants.expoConfig.extra 注入
 * 2. .env 文件通过 react-native-dotenv 在打包时内联
 */

import Constants from 'expo-constants';
import { OPENAI_API_KEY as ENV_OPENAI_KEY, ELEVENLABS_API_KEY as ENV_ELEVENLABS_KEY } from '@env';

const extra = Constants.expoConfig?.extra || {};

export const OPENAI_CONFIG = {
  apiKey: extra.openaiApiKey || ENV_OPENAI_KEY || '',
  whisperModel: 'whisper-1',
  ttsModel: 'tts-1-hd',
  miniModel: 'gpt-4o-mini',
};

export const ELEVENLABS_CONFIG = {
  apiKey: extra.elevenlabsApiKey || ENV_ELEVENLABS_KEY || '',
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
