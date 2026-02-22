/**
 * ElevenLabs TTS 语音合成服务
 * 使用 ElevenLabs API 生成老金声音克隆语音，通过 expo-av 播放
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { ELEVENLABS_CONFIG } from '../config/apiKeys';

// 当前播放的 Sound 实例
let currentSound = null;

/**
 * 使用 ElevenLabs TTS 合成并播放语音
 * @param {string} text - 要朗读的文本
 * @param {object} options - 选项
 * @param {number} options.speed - 语速（暂未使用，ElevenLabs 通过 stability 控制）
 * @param {function} options.onDone - 播放完成回调
 * @param {function} options.onError - 播放错误回调
 */
export async function speakWithOpenAI(text, { speed = 1.0, onDone, onError } = {}) {
  try {
    // 确保音频模式允许播放
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    console.log('[TTS] 请求 ElevenLabs TTS，文本长度:', text.length);

    // 调用 ElevenLabs TTS API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_CONFIG.voiceId}`,
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
      console.error('[TTS] ElevenLabs API 错误:', response.status, errText);
      throw new Error(`ElevenLabs TTS API 错误: ${response.status}`);
    }

    // 将音频数据保存为临时文件
    const audioBlob = await response.blob();
    const reader = new FileReader();
    const base64Data = await new Promise((resolve, reject) => {
      reader.onloadend = () => {
        // data:audio/mpeg;base64,XXXX → 取 base64 部分
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    const tempFile = FileSystem.cacheDirectory + 'tts_output.mp3';
    await FileSystem.writeAsStringAsync(tempFile, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

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
        console.log('[TTS] 播放完成');
        currentSound = null;
        sound.unloadAsync();
        onDone?.();
      }
    });

    console.log('[TTS] 开始播放（ElevenLabs 老金声音）');
  } catch (err) {
    console.error('[TTS] 失败:', err);
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
      console.log('[TTS] 已停止播放');
    } catch (err) {
      console.warn('[TTS] 停止播放时出错:', err);
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
