/**
 * 语音识别服务（原 Whisper，现已切换到 ElevenLabs STT）
 * 使用 expo-av 录音，上传到 ElevenLabs STT API 进行语音转文字
 * 支持中文识别，返回带标点的文本
 */

import { Audio } from 'expo-av';
import { ELEVENLABS_CONFIG } from '../config/apiKeys';
import { rlog } from './remoteLog';

// 录音实例
let recording = null;

/**
 * 开始录音
 * @returns {Promise<void>}
 */
export async function startRecording() {
  try {
    // 请求录音权限
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error('未获得录音权限');
    }

    // 设置音频模式
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    // 创建录音实例，使用高质量 m4a 格式，开启 metering 用于 VAD
    const { recording: newRecording } = await Audio.Recording.createAsync({
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    });

    recording = newRecording;
    rlog('Whisper', '录音已开始');
  } catch (err) {
    rlog('Whisper', 'ERROR', '开始录音失败:', err);
    throw err;
  }
}

/**
 * 停止录音并返回录音文件 URI
 * @returns {Promise<string|null>} 录音文件 URI
 */
export async function stopRecording() {
  if (!recording) {
    rlog('Whisper', 'WARN', '没有正在进行的录音');
    return null;
  }

  try {
    await recording.stopAndUnloadAsync();
    // 恢复音频模式（允许播放）
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    const uri = recording.getURI();
    rlog('Whisper', '录音已停止，文件:', uri);
    recording = null;
    return uri;
  } catch (err) {
    rlog('Whisper', 'ERROR', '停止录音失败:', err);
    recording = null;
    throw err;
  }
}

// 本地 faster-whisper STT 服务地址（ms2 on Tailscale）
const LOCAL_STT_URL = 'http://100.100.159.39:8877/transcribe';

/**
 * 将录音文件上传到本地 faster-whisper 服务进行识别
 * （原 ElevenLabs 实现已注释保留，方便回滚）
 * @param {string} audioUri - 录音文件 URI
 * @returns {Promise<string>} 识别出的文本
 */
export async function transcribeAudio(audioUri) {
  try {
    rlog('STT', '开始上传到本地 faster-whisper 服务', audioUri);

    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    });

    rlog('STT', '发送请求到本地 STT 服务:', LOCAL_STT_URL);

    // 超时控制：30 秒（本地网络快，但 Whisper 推理需要几秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await fetch(LOCAL_STT_URL, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    rlog('STT', '响应状态:', response.status);

    const responseText = await response.text();
    rlog('STT', '响应内容:', responseText.slice(0, 500));

    if (!response.ok) {
      rlog('STT', 'ERROR', '本地 STT 服务错误:', response.status, responseText);
      throw new Error(`本地 STT 服务错误: ${response.status}`);
    }

    const result = JSON.parse(responseText);
    const text = (result.text || '').trim();
    rlog('STT', '识别语言:', result.language, '| 识别文本:', text);
    return text;
  } catch (err) {
    if (err.name === 'AbortError') {
      rlog('STT', 'ERROR', '本地 STT 服务请求超时（30s）');
      throw new Error('语音识别超时，请重试');
    }
    rlog('STT', 'ERROR', err.message);
    throw err;
  }
}

/* ========== 原 ElevenLabs STT 实现（注释保留，方便回滚） ==========
export async function transcribeAudio_elevenlabs(audioUri) {
  try {
    rlog('STT', '开始上传', audioUri);

    const apiKey = ELEVENLABS_CONFIG.apiKey;
    rlog('STT', 'API key长度:', apiKey ? apiKey.length : 'MISSING');

    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    });
    formData.append('language_code', 'zh');
    formData.append('tag_audio_events', 'false');
    formData.append('model_id', 'scribe_v1');

    rlog('STT', '发送请求到 ElevenLabs...');

    const response = await fetch('https://elevenlabs-proxy.kundouzhishou.workers.dev/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: formData,
    });

    rlog('STT', '响应状态:', response.status);

    const responseText = await response.text();
    rlog('STT', '响应内容:', responseText.slice(0, 500));

    if (!response.ok) {
      rlog('STT', 'ERROR', 'ElevenLabs API 错误:', response.status, responseText);
      throw new Error(`ElevenLabs STT API 错误: ${response.status}`);
    }

    const data = JSON.parse(responseText);
    const text = (data.text || '').trim();
    rlog('STT', '识别文本:', text);
    return text;
  } catch (err) {
    rlog('STT', 'ERROR', err.message);
    throw err;
  }
}
========== ElevenLabs STT 实现结束 ========== */

/**
 * 获取当前录音实例（用于 VAD metering 轮询）
 * @returns {Audio.Recording|null}
 */
export function getRecording() {
  return recording;
}

/**
 * 取消当前录音（不识别）
 */
export async function cancelRecording() {
  if (recording) {
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch (err) {
      rlog('Whisper', 'WARN', '取消录音时出错:', err);
    }
    recording = null;
  }
}
