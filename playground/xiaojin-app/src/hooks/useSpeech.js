/**
 * 语音 Hook（Expo Go 调试版 — mock 实现）
 * 原生语音模块不兼容 Expo Go，调试阶段用 mock 替代
 */

import { useState, useCallback } from 'react';

export const useSpeech = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [error, setError] = useState(null);

  const startListening = useCallback((mode) => {
    console.log('[Speech Mock] startListening:', mode);
    setIsListening(true);
    // 模拟 2 秒后识别出文字
    setTimeout(() => {
      setRecognizedText('你好小金');
      setIsListening(false);
    }, 2000);
  }, []);

  const stopListening = useCallback(() => {
    console.log('[Speech Mock] stopListening');
    setIsListening(false);
  }, []);

  const speak = useCallback(async (text) => {
    console.log('[Speech Mock] speak:', text);
    setIsSpeaking(true);
    // 模拟朗读时间
    await new Promise(r => setTimeout(r, 1000));
    setIsSpeaking(false);
  }, []);

  const stopSpeaking = useCallback(() => {
    console.log('[Speech Mock] stopSpeaking');
    setIsSpeaking(false);
  }, []);

  return {
    isListening,
    isSpeaking,
    recognizedText,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
};
