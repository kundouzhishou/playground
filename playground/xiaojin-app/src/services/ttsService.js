/**
 * ElevenLabs TTS 语音合成服务
 * 使用 ElevenLabs API 生成语音，支持多声音切换，通过 expo-av 播放
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { ELEVENLABS_CONFIG, DEFAULT_VOICE_ID } from '../config/apiKeys';
import { rlog } from './remoteLog';

// 当前播放的 Sound 实例
let currentSound = null;

/**
 * 使用 ElevenLabs TTS 合成并播放语音
 * @param {string} text - 要朗读的文本
 * @param {object} options - 选项
 * @param {number} options.speed - 语速（暂未使用，ElevenLabs 通过 stability 控制）
 * @param {string} options.voiceId - 声音 ID（不传则使用默认声音）
 * @param {function} options.onDone - 播放完成回调
 * @param {function} options.onError - 播放错误回调
 */
export async function speakWithOpenAI(text, { speed = 1.0, voiceId, onDone, onError } = {}) {
  // 使用传入的 voiceId，否则用默认值
  const activeVoiceId = voiceId || DEFAULT_VOICE_ID;
  try {
    // 确保音频模式允许播放
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    rlog('TTS', '请求 ElevenLabs TTS，文本长度:', text.length);

    // 调用 ElevenLabs TTS API
    const response = await fetch(
      `https://elevenlabs-proxy.kundouzhishou.workers.dev/v1/text-to-speech/${activeVoiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_CONFIG.apiKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: ELEVENLABS_CONFIG.modelId,
          voice_settings: {
            stability: ELEVENLABS_CONFIG.stability,
            similarity_boost: ELEVENLABS_CONFIG.similarityBoost,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      rlog('TTS', 'ERROR', 'ElevenLabs API 错误:', response.status, errText);
      throw new Error(`ElevenLabs TTS API 错误: ${response.status}`);
    }

    // 将音频数据保存为临时文件（用 arrayBuffer → base64，兼容 React Native）
    rlog('TTS', '下载音频数据...');
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);
    rlog('TTS', '音频 base64 长度:', base64Data.length);

    const tempFile = FileSystem.cacheDirectory + 'tts_output_' + Date.now() + '.mp3';
    await FileSystem.writeAsStringAsync(tempFile, base64Data, {
      encoding: 'base64',
    });
    rlog('TTS', '音频已保存:', tempFile);

    // 停止之前的播放
    await stopOpenAITTS();

    // 创建并播放 Sound
    const { sound } = await Audio.Sound.createAsync(
      { uri: tempFile },
      { shouldPlay: true }
    );
    currentSound = sound;

    // 监听播放状态
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) {
        rlog('TTS', '播放完成');
        currentSound = null;
        sound.unloadAsync();
        onDone?.();
      }
    });

    rlog('TTS', '开始播放，声音 ID:', activeVoiceId);
  } catch (err) {
    rlog('TTS', 'ERROR', '失败:', err?.message || err?.toString() || JSON.stringify(err));
    currentSound = null;
    onError?.(err);
  }
}

/**
 * 停止当前 TTS 播放
 */
export async function stopOpenAITTS() {
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
      rlog('TTS', '已停止播放');
    } catch (err) {
      rlog('TTS', 'WARN', '停止播放时出错:', err);
    }
    currentSound = null;
  }
}

/**
 * 检查是否正在播放
 * @returns {boolean}
 */
export function isPlaying() {
  return currentSound !== null;
}
