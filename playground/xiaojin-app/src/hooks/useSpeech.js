/**
 * 语音 Hook（升级版）
 * - Whisper 语音识别替代原生 Voice
 * - OpenAI TTS 替代 expo-speech
 * - VAD 累积发送：3 秒沉默窗口，多段文本拼接
 * - 口语化转换：Agent 回复经 GPT-4o-mini 转换后朗读
 * - 支持语速调节
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  startRecording,
  stopRecording,
  transcribeAudio,
  cancelRecording,
  getRecording,
} from '../services/whisperService';
import { speakWithOpenAI, stopOpenAITTS } from '../services/ttsService';
import { formatForVoice } from '../services/voiceFormatter';
import { rlog } from '../services/remoteLog';

// 沉默窗口时长（毫秒）
const SILENCE_WINDOW_MS = 3000;

export const useSpeech = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [partialText, setPartialText] = useState(''); // 录音中显示状态
  const [error, setError] = useState(null);
  const [speechSpeed, setSpeechSpeed] = useState(1.0); // 语速（0.25-4.0）
  // 当前选中的声音 ID（由外部传入设置）
  const [selectedVoiceId, setSelectedVoiceId] = useState(null);

  // VAD 累积发送相关
  const pendingTextsRef = useRef([]);
  const silenceTimerRef = useRef(null);
  // 录音时长计时器
  const recordingTimerRef = useRef(null);
  // 最大录音时长计时器（60秒自动停止）
  const maxRecordingTimerRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  // VAD metering interval
  const meteringIntervalRef = useRef(null);
  // stopListening ref（避免 startListening 与 stopListening 的循环依赖）
  const stopListeningRef = useRef(null);
  // 模式
  const listeningModeRef = useRef('auto');

  // 清理
  useEffect(() => {
    return () => {
      cancelRecording();
      stopOpenAITTS();
      clearSilenceTimer();
      clearRecordingTimer();
      clearMaxRecordingTimer();
      clearMeteringInterval();
    };
  }, []);

  // 清除沉默计时器
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // 清除录音时长计时器
  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  // 清除最大录音时长计时器
  const clearMaxRecordingTimer = useCallback(() => {
    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
  }, []);

  // 清除 VAD metering interval
  const clearMeteringInterval = useCallback(() => {
    if (meteringIntervalRef.current) {
      clearInterval(meteringIntervalRef.current);
      meteringIntervalRef.current = null;
    }
  }, []);

  // 启动录音时长显示
  const startRecordingTimer = useCallback(() => {
    recordingStartTimeRef.current = Date.now();
    setPartialText('正在录音... 0s');
    recordingTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
      setPartialText(`正在录音... ${elapsed}s`);
    }, 1000);
  }, []);

  /**
   * 开始录音
   */
  const startListening = useCallback(async (mode = 'auto') => {
    try {
      listeningModeRef.current = mode;
      setError(null);
      // 清除沉默计时器（用户在沉默窗口内再次说话）
      clearSilenceTimer();

      await startRecording();
      setIsListening(true);
      startRecordingTimer();

      // VAD：启动音量轮询，静音超过 1.5s 自动停止
      const SILENCE_THRESHOLD = -40; // dB，低于此值视为静音
      const SILENCE_DURATION = 1500; // 1.5秒静音后自动停止
      const MIN_RECORD_MS = 500;     // 最短录音时长保护
      const recordStart = Date.now();
      let silenceStart = null;
      let hadSound = false; // 只在检测到声音后才开始静音计时

      clearMeteringInterval();
      meteringIntervalRef.current = setInterval(async () => {
        const rec = getRecording();
        if (!rec) {
          clearMeteringInterval();
          return;
        }
        try {
          const status = await rec.getStatusAsync();
          if (!status.isRecording) {
            clearMeteringInterval();
            return;
          }
          // 最短录音时长保护
          if (Date.now() - recordStart < MIN_RECORD_MS) return;

          const db = status.metering ?? -160;
          if (db >= SILENCE_THRESHOLD) {
            hadSound = true;
            silenceStart = null; // 有声音，重置静音计时
          } else if (hadSound) {
            // 已经有过声音，开始计静音时长
            if (!silenceStart) silenceStart = Date.now();
            else if (Date.now() - silenceStart >= SILENCE_DURATION) {
              clearMeteringInterval();
              stopListeningRef.current?.(); // 自动停止（通过 ref 避免循环依赖）
            }
          }
        } catch (_) {
          clearMeteringInterval();
        }
      }, 100);
    } catch (e) {
      rlog('Speech', 'ERROR', '启动录音失败:', e);
      setError('无法启动录音: ' + e.message);
    }
  }, [clearSilenceTimer, startRecordingTimer, clearMeteringInterval]);

  /**
   * 停止录音并识别
   * 识别完成后进入 VAD 沉默窗口
   */
  const stopListening = useCallback(async () => {
    try {
      setIsListening(false);
      clearMaxRecordingTimer();
      clearRecordingTimer();
      clearMeteringInterval();
      setPartialText('识别中...');

      const audioUri = await stopRecording();
      if (!audioUri) {
        setPartialText('');
        return;
      }

      // 上传 Whisper 识别
      const text = await transcribeAudio(audioUri);

      if (text && text.trim()) {
        // 识别成功，立刻发送（不再等待 VAD 沉默窗口）
        rlog('VAD', '识别完成，立刻发送:', text.trim());
        setRecognizedText(text.trim() + ' ' + Date.now()); // 加时间戳确保每次都触发更新
        setPartialText('');
      } else {
        setPartialText('');
        rlog('Speech', '未识别到有效文本');
      }
    } catch (e) {
      rlog('Speech', 'ERROR', '识别失败:', e);
      setError('语音识别失败: ' + e.message);
      setPartialText('');
    }
  }, [clearSilenceTimer, clearRecordingTimer, clearMaxRecordingTimer, clearMeteringInterval]);

  // 更新 stopListeningRef，供 startListening 的 setInterval 回调使用
  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  /**
   * 使用 OpenAI TTS 朗读文本（先口语化转换）
   * @param {string} text
   * @param {{ voiceId?: string, onDone?: () => void }} [options]
   */
  const speak = useCallback(async (text, options = {}) => {
    try {
      setIsSpeaking(true);

      // 口语化转换
      const voiceText = await formatForVoice(text);

      // ElevenLabs TTS 朗读（传入选中的声音 ID）
      await speakWithOpenAI(voiceText, {
        speed: speechSpeed,
        voiceId: options.voiceId ?? selectedVoiceId,
        onDone: () => {
          setIsSpeaking(false);
          options.onDone?.();
        },
        onError: (err) => {
          rlog('TTS', 'ERROR', '播放错误:', err);
          setIsSpeaking(false);
        },
      });
    } catch (e) {
      rlog('TTS', 'ERROR', '失败:', e);
      setIsSpeaking(false);
    }
  }, [speechSpeed, selectedVoiceId]);

  /**
   * 停止 TTS 播放
   */
  const stopSpeaking = useCallback(async () => {
    try {
      await stopOpenAITTS();
      setIsSpeaking(false);
    } catch (e) {
      rlog('TTS', 'ERROR', '停止失败:', e);
    }
  }, []);

  return {
    isListening,
    isSpeaking,
    recognizedText,
    partialText,
    error,
    speechSpeed,
    setSpeechSpeed,
    selectedVoiceId,
    setSelectedVoiceId,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    clearRecognizedText: () => setRecognizedText(''),
  };
};
