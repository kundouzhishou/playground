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
  const recordingStartTimeRef = useRef(null);
  // 模式
  const listeningModeRef = useRef('auto');

  // 清理
  useEffect(() => {
    return () => {
      cancelRecording();
      stopOpenAITTS();
      clearSilenceTimer();
      clearRecordingTimer();
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
    } catch (e) {
      rlog('Speech', 'ERROR', '启动录音失败:', e);
      setError('无法启动录音: ' + e.message);
    }
  }, [clearSilenceTimer, startRecordingTimer]);

  /**
   * 停止录音并识别
   * 识别完成后进入 VAD 沉默窗口
   */
  const stopListening = useCallback(async () => {
    try {
      setIsListening(false);
      clearRecordingTimer();
      setPartialText('识别中...');

      const audioUri = await stopRecording();
      if (!audioUri) {
        setPartialText('');
        return;
      }

      // 上传 Whisper 识别
      const text = await transcribeAudio(audioUri);

      if (text && text.trim()) {
        // 将识别结果加入待发送队列
        pendingTextsRef.current.push(text.trim());
        rlog('VAD', '累积文本段数:', pendingTextsRef.current.length);
        setPartialText(`已识别: "${text.trim()}" (等待中...)`);

        // 启动沉默计时器
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          // 沉默窗口到期，合并所有文本并发送
          const allTexts = pendingTextsRef.current.join(' ');
          pendingTextsRef.current = [];
          rlog('VAD', '沉默窗口到期，发送合并文本:', allTexts);
          setRecognizedText(allTexts);
          setPartialText('');
        }, SILENCE_WINDOW_MS);
      } else {
        setPartialText('');
        rlog('Speech', '未识别到有效文本');
      }
    } catch (e) {
      rlog('Speech', 'ERROR', '识别失败:', e);
      setError('语音识别失败: ' + e.message);
      setPartialText('');
    }
  }, [clearSilenceTimer, clearRecordingTimer]);

  /**
   * 使用 OpenAI TTS 朗读文本（先口语化转换）
   */
  const speak = useCallback(async (text) => {
    try {
      setIsSpeaking(true);

      // 口语化转换
      const voiceText = await formatForVoice(text);

      // ElevenLabs TTS 朗读（传入选中的声音 ID）
      await speakWithOpenAI(voiceText, {
        speed: speechSpeed,
        voiceId: selectedVoiceId,
        onDone: () => {
          setIsSpeaking(false);
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
  };
};
