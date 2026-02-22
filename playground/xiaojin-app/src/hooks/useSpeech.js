import { useState, useEffect, useRef, useCallback } from 'react';
import Voice from '@react-native-voice/voice';
import * as Speech from 'expo-speech';

export const useSpeech = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [error, setError] = useState(null);
  const listeningModeRef = useRef('auto'); // 'auto' or 'manual'

  useEffect(() => {
    // 设置语音识别回调
    Voice.onSpeechStart = () => {
      setIsListening(true);
      setError(null);
    };

    Voice.onSpeechEnd = () => {
      setIsListening(false);
    };

    Voice.onSpeechResults = (e) => {
      if (e.value && e.value.length > 0) {
        setRecognizedText(e.value[0]);
      }
    };

    Voice.onSpeechError = (e) => {
      console.error('Speech recognition error:', e);
      setError(e.error?.message || '语音识别错误');
      setIsListening(false);
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
      Speech.stop();
    };
  }, []);

  const startListening = useCallback(async (mode = 'auto') => {
    try {
      listeningModeRef.current = mode;
      setError(null);
      setRecognizedText('');
      
      await Voice.start('zh-CN');
    } catch (e) {
      console.error('Start listening error:', e);
      setError('无法启动语音识别');
    }
  }, []);

  const stopListening = useCallback(async () => {
    try {
      await Voice.stop();
      setIsListening(false);
    } catch (e) {
      console.error('Stop listening error:', e);
    }
  }, []);

  const speak = useCallback(async (text) => {
    try {
      setIsSpeaking(true);
      
      await Speech.speak(text, {
        language: 'zh-CN',
        pitch: 1.0,
        rate: 0.9,
        onDone: () => {
          setIsSpeaking(false);
        },
        onError: (error) => {
          console.error('TTS error:', error);
          setIsSpeaking(false);
        }
      });
    } catch (e) {
      console.error('Speak error:', e);
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(async () => {
    try {
      await Speech.stop();
      setIsSpeaking(false);
    } catch (e) {
      console.error('Stop speaking error:', e);
    }
  }, []);

  return {
    isListening,
    isSpeaking,
    recognizedText,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking
  };
};
