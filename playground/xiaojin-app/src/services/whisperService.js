/**
 * Whisper 语音识别服务
 * 使用 expo-av 录音，上传到 OpenAI Whisper API 进行语音转文字
 * 支持中文识别，返回带标点的文本
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { OPENAI_CONFIG } from '../config/apiKeys';
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

    // 创建录音实例，使用高质量 m4a 格式（Whisper 支持）
    const { recording: newRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

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

/**
 * 将录音文件上传到 Whisper API 进行识别
 * @param {string} audioUri - 录音文件 URI
 * @returns {Promise<string>} 识别出的文本
 */
export async function transcribeAudio(audioUri) {
  try {
    rlog('Whisper', '开始上传识别...');

    // 使用 fetch + FormData 上传（FileSystem.uploadAsync 的 MULTIPART 在部分环境不可用）
    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    });
    formData.append('model', OPENAI_CONFIG.whisperModel);
    formData.append('language', 'zh');
    formData.append('response_format', 'text');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errBody = await response.text();
      rlog('Whisper', 'ERROR', 'API 错误:', response.status, errBody);
      throw new Error(`Whisper API 错误: ${response.status}`);
    }

    const text = (await response.text()).trim();
    rlog('Whisper', '识别结果:', text);
    return text;
  } catch (err) {
    rlog('Whisper', 'ERROR', '识别失败:', err);
    throw err;
  }
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
