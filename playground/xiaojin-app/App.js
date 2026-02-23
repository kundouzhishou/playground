import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Alert,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PairingScreen } from './src/components/PairingScreen';
import { useGateway, GatewayStatus } from './src/hooks/useGateway';
import { useSpeech } from './src/hooks/useSpeech';
import { useShake } from './src/hooks/useShake';
import { preloadSounds, playSound, unloadSounds, startThinkingLoop, stopThinkingLoop } from './src/services/soundEffects';
import { DEFAULT_VOICE_ID, LAOJIN_VOICE_ID } from './src/config/apiKeys';
import { speakWithOpenAI } from './src/services/ttsService';
import { GATEWAY_CONFIG } from './src/config/gateway';
import { useRemoteLogs, clearLogs } from './src/services/remoteLog';

import Constants from 'expo-constants';
import appJson from './app.json';

const APP_VERSION = appJson.expo.version;
const BUILD_ID = Constants.expoConfig?.extra?.buildId || 'dev';
const UPDATE_ID = Constants.manifest2?.id?.slice(0, 8) || Constants.manifest?.id?.slice(0, 8) || null;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BALL_SIZE = Math.min(SCREEN_WIDTH * 0.55, 260);

// 状态机：disconnected → connecting → idle → listening → thinking → speaking → idle
const UI_STATE = {
  disconnected: 'disconnected',
  connecting: 'connecting',
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
};

// 结束关键词
const EXIT_KEYWORDS = ['再见', '结束', '拜拜', '没事了'];

/**
 * 检测老金模式切换指令
 */
function detectModeSwitch(text) {
  if (!text) return { action: null, target: null };

  const activatePatterns = [
    /接下来(.+?)跟你说/,
    /切换到老金/,
    /用老金的声音/,
  ];

  for (const pattern of activatePatterns) {
    const match = text.match(pattern);
    if (match) {
      let relation = null;
      let name = null;
      const raw = match[1] ? match[1].trim() : null;
      if (raw) {
        const relationMatch = raw.match(/^(?:我)?(?:的)?(儿子|女儿|老婆|老公|妻子|丈夫|爸爸|妈妈|朋友|同事|哥哥|姐姐|弟弟|妹妹|爷爷|奶奶|外公|外婆|叔叔|阿姨|同学|室友|闺蜜|兄弟)(.*)$/);
        if (relationMatch) {
          relation = relationMatch[1];
          name = relationMatch[2] ? relationMatch[2].trim() : null;
        } else {
          name = raw;
        }
      }
      const displayLabel = relation && name ? `${relation} ${name}` : (relation || name || '访客');
      const sessionId = name || relation || 'guest';
      return { action: 'activate', target: sessionId, relation, name, displayLabel };
    }
  }

  const deactivatePatterns = [
    /退出老金/,
    /我回来了/,
    /结束老金模式/,
  ];

  for (const pattern of deactivatePatterns) {
    if (pattern.test(text)) {
      return { action: 'deactivate', target: null };
    }
  }

  return { action: null, target: null };
}

// ============================================================
// 球体组件
// ============================================================
function OrbisBall({ uiState, size }) {
  const breathAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const colorProgress = useRef(new Animated.Value(0)).current;
  const rippleScale = useRef(new Animated.Value(1)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;

  const breathLoopRef = useRef(null);
  const floatLoopRef = useRef(null);
  const rippleLoopRef = useRef(null);

  const stopAll = useCallback(() => {
    if (breathLoopRef.current) { breathLoopRef.current.stop(); breathLoopRef.current = null; }
    if (floatLoopRef.current) { floatLoopRef.current.stop(); floatLoopRef.current = null; }
    if (rippleLoopRef.current) { rippleLoopRef.current.stop(); rippleLoopRef.current = null; }
  }, []);

  useEffect(() => {
    stopAll();
    scaleAnim.stopAnimation();
    rotateAnim.stopAnimation();

    switch (uiState) {
      case UI_STATE.disconnected:
        // 黑色球，慢呼吸
        Animated.timing(colorProgress, { toValue: 0, duration: 800, useNativeDriver: false }).start();
        scaleAnim.setValue(1);
        breathLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(breathAnim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(breathAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        );
        breathLoopRef.current.start();
        break;

      case UI_STATE.connecting:
        // 黑→蓝渐变，1.5秒
        Animated.timing(colorProgress, { toValue: 0.5, duration: 1500, useNativeDriver: false }).start();
        breathLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(breathAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(breathAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        );
        breathLoopRef.current.start();
        break;

      case UI_STATE.idle:
        // 蓝白渐变，上下浮动
        Animated.timing(colorProgress, { toValue: 1, duration: 1000, useNativeDriver: false }).start();
        floatLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(floatAnim, { toValue: -12, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(floatAnim, { toValue: 12, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        );
        floatLoopRef.current.start();
        break;

      case UI_STATE.listening:
        // 声波扩散，蓝色
        Animated.timing(colorProgress, { toValue: 1, duration: 500, useNativeDriver: false }).start();
        rippleScale.setValue(1);
        rippleOpacity.setValue(0.6);
        rippleLoopRef.current = Animated.loop(
          Animated.parallel([
            Animated.timing(rippleScale, { toValue: 1.6, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(rippleOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
          ])
        );
        rippleLoopRef.current.start();
        // 球体轻微呼吸
        breathLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(breathAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(breathAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        );
        breathLoopRef.current.start();
        break;

      case UI_STATE.thinking:
        // 收缩+旋转感，紫蓝
        Animated.timing(colorProgress, { toValue: 0.6, duration: 600, useNativeDriver: false }).start();
        Animated.timing(scaleAnim, { toValue: 0.85, duration: 500, useNativeDriver: true }).start();
        Animated.loop(
          Animated.timing(rotateAnim, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true })
        ).start();
        break;

      case UI_STATE.speaking:
        // 节奏性扩张，绿蓝
        Animated.timing(colorProgress, { toValue: 1, duration: 400, useNativeDriver: false }).start();
        breathLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(breathAnim, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(breathAnim, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        );
        breathLoopRef.current.start();
        break;
    }

    return () => { stopAll(); };
  }, [uiState]);

  // 球体缩放（呼吸）
  const ballScale = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  // 旋转（思考状态）
  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // 颜色插值：黑 → 深蓝 → 蓝白
  const outerColor = colorProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#111111', '#1a3a8a', '#1a5fc8'],
  });
  const innerColor = colorProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#333333', '#2255cc', '#64b5f6'],
  });

  const ballTransform = [
    { scale: Animated.multiply(ballScale, scaleAnim) },
    { translateY: floatAnim },
    ...(uiState === UI_STATE.thinking ? [{ rotate: rotation }] : []),
  ];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* 声波扩散圆圈（listening 状态） */}
      {uiState === UI_STATE.listening && (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: 'rgba(64, 148, 240, 0.3)',
            transform: [{ scale: rippleScale }],
            opacity: rippleOpacity,
          }}
        />
      )}
      {/* 球体外层 */}
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: outerColor,
          transform: ballTransform,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#4090ff',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 20,
          elevation: 12,
        }}
      >
        {/* 内部高光 */}
        <Animated.View
          style={{
            width: size * 0.55,
            height: size * 0.55,
            borderRadius: (size * 0.55) / 2,
            backgroundColor: innerColor,
            opacity: 0.7,
            position: 'absolute',
            top: size * 0.12,
            left: size * 0.15,
          }}
        />
        {/* 小高光点 */}
        <View
          style={{
            width: size * 0.18,
            height: size * 0.18,
            borderRadius: size * 0.09,
            backgroundColor: 'rgba(255,255,255,0.55)',
            position: 'absolute',
            top: size * 0.15,
            left: size * 0.22,
          }}
        />
      </Animated.View>
    </View>
  );
}

// ============================================================
// 圆形按钮（线稿风格，纯 View 实现）
// ============================================================
function CircleButton({ onPress, disabled, size = 64, bgColor = '#f0f0f0', children, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.35 : 1,
        },
        style,
      ]}
    >
      {children}
    </TouchableOpacity>
  );
}

// 麦克风图标（线稿，Text 模拟）
function MicIcon({ muted, size = 28 }) {
  if (muted) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size, color: '#e53935', lineHeight: size + 4 }}>🎙</Text>
        {/* 斜线 */}
        <View
          style={{
            position: 'absolute',
            width: 2,
            height: size + 8,
            backgroundColor: '#e53935',
            borderRadius: 1,
            transform: [{ rotate: '45deg' }],
          }}
        />
      </View>
    );
  }
  return <Text style={{ fontSize: size, lineHeight: size + 4 }}>🎙</Text>;
}

// 拍照/上传图标
function CameraIcon({ size = 26 }) {
  return <Text style={{ fontSize: size, lineHeight: size + 4 }}>📷</Text>;
}

// 关闭图标
function CloseIcon({ size = 26 }) {
  return <Text style={{ fontSize: size, lineHeight: size + 4, color: '#555' }}>✕</Text>;
}

// CC字幕按钮
function CCButton({ ccEnabled, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: ccEnabled ? '#1a5fc8' : '#cccccc',
        backgroundColor: ccEnabled ? 'rgba(26, 95, 200, 0.08)' : 'transparent',
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: ccEnabled ? '#1a5fc8' : '#aaaaaa', letterSpacing: 1 }}>CC</Text>
    </TouchableOpacity>
  );
}

// ============================================================
// 主 App
// ============================================================
export default function App() {
  const [messages, setMessages] = useState([]);
  const [isAutoMode] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  // 对话模式状态
  const [isConversationActive, setIsConversationActive] = useState(false);
  // 麦克风静音状态（新UI）
  const [micMuted, setMicMuted] = useState(false);
  // CC 字幕开关（新UI）
  const [ccEnabled, setCcEnabled] = useState(true);
  // 老金模式状态
  const [isLaojinMode, setIsLaojinMode] = useState(false);
  const [laojinTarget, setLaojinTarget] = useState(null);
  // 调试日志
  const debugLogs = useRemoteLogs();
  const previousVoiceIdRef = useRef(null);

  // 当前 AI 回复文字（用于 CC 显示）
  const [lastAiText, setLastAiText] = useState('');
  // 当前状态标签文字
  const [statusLabel, setStatusLabel] = useState('');

  const currentSessionKey = isLaojinMode
    ? `${GATEWAY_CONFIG.sessionKey}-laojin-${laojinTarget || 'guest'}`
    : GATEWAY_CONFIG.sessionKey;

  const streamingMsgAddedRef = useRef(false);
  const prevGatewayStatusRef = useRef(null);

  const {
    connected,
    status: gatewayStatus,
    sendMessage,
    lastMessage,
    streamingText,
    isStreaming,
    pairingInfo,
    error: gatewayError,
  } = useGateway();

  const {
    isListening,
    isSpeaking,
    recognizedText,
    clearRecognizedText,
    partialText,
    error: speechError,
    speechSpeed,
    setSpeechSpeed,
    selectedVoiceId,
    setSelectedVoiceId,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  } = useSpeech();

  // ========== 计算 UI 状态 ==========
  const uiState = (() => {
    if (!connected) {
      if (gatewayStatus === GatewayStatus.CONNECTING) return UI_STATE.connecting;
      return UI_STATE.disconnected;
    }
    if (isListening && !micMuted) return UI_STATE.listening;
    if (isThinking) return UI_STATE.thinking;
    if (isSpeaking) return UI_STATE.speaking;
    return UI_STATE.idle;
  })();

  // ========== 状态标签 ==========
  useEffect(() => {
    switch (uiState) {
      case UI_STATE.disconnected: setStatusLabel('未连接'); break;
      case UI_STATE.connecting: setStatusLabel('正在连接...'); break;
      case UI_STATE.idle: setStatusLabel(isConversationActive ? '等待中...' : '点击麦克风开始'); break;
      case UI_STATE.listening: setStatusLabel('正在听...'); break;
      case UI_STATE.thinking: setStatusLabel('小金正在思考...'); break;
      case UI_STATE.speaking: setStatusLabel('小金正在说话...'); break;
      default: setStatusLabel('');
    }
  }, [uiState, isConversationActive]);

  // ========== 音效预加载 ==========
  useEffect(() => {
    preloadSounds();
    return () => { unloadSounds(); };
  }, []);

  // ========== 声音选择持久化 ==========
  const VOICE_STORAGE_KEY = '@xiaojin_voice_id';
  useEffect(() => {
    AsyncStorage.getItem(VOICE_STORAGE_KEY).then((stored) => {
      setSelectedVoiceId(stored || DEFAULT_VOICE_ID);
    }).catch(() => {
      setSelectedVoiceId(DEFAULT_VOICE_ID);
    });
  }, []);

  const handleVoiceChange = useCallback((voiceId) => {
    setSelectedVoiceId(voiceId);
    AsyncStorage.setItem(VOICE_STORAGE_KEY, voiceId).catch(() => {});
  }, [setSelectedVoiceId]);

  // ========== Gateway 连接状态音效 ==========
  useEffect(() => {
    if (prevGatewayStatusRef.current === GatewayStatus.CONNECTING && gatewayStatus === GatewayStatus.CONNECTED) {
      playSound('start');
    }
    prevGatewayStatusRef.current = gatewayStatus;
  }, [gatewayStatus]);

  // ========== 思考提示音 ==========
  useEffect(() => {
    if (isThinking && isConversationActive) {
      startThinkingLoop();
    } else {
      stopThinkingLoop();
    }
  }, [isThinking, isConversationActive]);

  // ========== 对话模式控制 ==========
  const startConversation = useCallback(async () => {
    if (isConversationActive) return;
    setIsConversationActive(true);
    if (isSpeaking) await stopSpeaking();
    await playSound('start');
    if (!micMuted) startListening('auto');
  }, [isConversationActive, isSpeaking, stopSpeaking, startListening, micMuted]);

  const endConversation = useCallback(async () => {
    setIsConversationActive(false);
    await playSound('end');
    if (isSpeaking) stopSpeaking();
    if (isListening) stopListening();
    setLastAiText('');
  }, [isSpeaking, stopSpeaking, isListening, stopListening]);

  // ========== 关键词检测 ==========
  const checkExitKeyword = useCallback((text) => {
    if (!text) return false;
    return EXIT_KEYWORDS.some((kw) => text.includes(kw));
  }, []);

  // ========== 监听语音识别结果 ==========
  useEffect(() => {
    if (recognizedText && !isListening) {
      const cleanText = recognizedText.replace(/\s+\d{13}$/, '');
      clearRecognizedText();
      if (!cleanText.trim()) return;

      if (isConversationActive && checkExitKeyword(cleanText)) {
        endConversation();
        return;
      }

      const modeSwitch = detectModeSwitch(cleanText);
      if (modeSwitch.action === 'activate' && !isLaojinMode) {
        previousVoiceIdRef.current = selectedVoiceId;
        setSelectedVoiceId(LAOJIN_VOICE_ID);
        setIsLaojinMode(true);
        setLaojinTarget(modeSwitch.target);
        const displayLabel = modeSwitch.displayLabel || '访客';
        setMessages([{ text: `已进入老金模式，对话者：${displayLabel}`, isUser: false, isSystem: true, timestamp: Date.now() }]);
        speakWithOpenAI('好的，已切换到老金模式', { voiceId: LAOJIN_VOICE_ID, onDone: () => {} });
        return;
      }
      if (modeSwitch.action === 'deactivate' && isLaojinMode) {
        const restoredVoice = previousVoiceIdRef.current || DEFAULT_VOICE_ID;
        setSelectedVoiceId(restoredVoice);
        AsyncStorage.setItem(VOICE_STORAGE_KEY, restoredVoice).catch(() => {});
        setIsLaojinMode(false);
        setLaojinTarget(null);
        previousVoiceIdRef.current = null;
        setMessages([{ text: '已退出老金模式', isUser: false, isSystem: true, timestamp: Date.now() }]);
        speakWithOpenAI('好的，已退出老金模式', { voiceId: restoredVoice, onDone: () => {} });
        return;
      }

      handleUserMessage(cleanText);
    }
  }, [recognizedText, isListening]);

  // ========== 监听流式文本 ==========
  useEffect(() => {
    if (isStreaming && streamingText) {
      setLastAiText(streamingText);
      setMessages((prev) => {
        if (!streamingMsgAddedRef.current) {
          streamingMsgAddedRef.current = true;
          return [...prev, { text: streamingText, isUser: false, timestamp: Date.now() }];
        }
        const updated = [...prev];
        if (updated.length > 0) {
          updated[updated.length - 1] = { ...updated[updated.length - 1], text: streamingText };
        }
        return updated;
      });
      setIsThinking(false);
    }
  }, [isStreaming, streamingText]);

  // ========== 监听 Gateway 最终消息 ==========
  useEffect(() => {
    if (lastMessage && lastMessage.state === 'final' && lastMessage.message?.content?.[0]?.text) {
      const finalText = lastMessage.message.content[0].text;
      handleAssistantFinal(finalText);
    }
  }, [lastMessage]);

  // ========== 监听语音错误 ==========
  useEffect(() => {
    if (speechError) {
      playSound('error');
      Alert.alert('语音错误', speechError, [
        { text: '分享', onPress: () => require('react-native').Share.share({ message: speechError }) },
        { text: '关闭', style: 'cancel' },
      ]);
    }
  }, [speechError]);

  // ========== 消息处理 ==========
  const handleUserMessage = useCallback(async (text) => {
    if (!text.trim()) return;
    if (isConversationActive) await playSound('sent');
    const userMessage = { text, isUser: true, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMessage]);
    streamingMsgAddedRef.current = false;

    let messageToSend = text;
    if (isLaojinMode) {
      const contextPrefix = `[系统提示：当前与你对话的是老金的${laojinTarget || '家人'}，不是老金本人。请用老金的语气回复——温暖、直接、务实、不废话。你在代表老金说话。根据对话者的身份调整你的态度，比如对小孩要耐心温柔。]\n\n`;
      messageToSend = contextPrefix + text;
    }

    try {
      setIsThinking(true);
      await sendMessage(messageToSend, currentSessionKey);
    } catch (error) {
      playSound('error');
      Alert.alert('发送失败', error.message);
      setIsThinking(false);
    }
  }, [sendMessage, isConversationActive, isLaojinMode, laojinTarget, currentSessionKey]);

  const handleAssistantFinal = useCallback(async (text) => {
    setIsThinking(false);
    setLastAiText(text);
    if (isConversationActive) await playSound('received');

    setMessages((prev) => {
      if (streamingMsgAddedRef.current) {
        const updated = [...prev];
        if (updated.length > 0 && !updated[updated.length - 1].isUser) {
          updated[updated.length - 1] = { ...updated[updated.length - 1], text };
        }
        return updated;
      }
      return [...prev, { text, isUser: false, timestamp: Date.now() }];
    });
    streamingMsgAddedRef.current = false;

    await speak(text, {
      voiceId: selectedVoiceId,
      onDone: () => {
        if (isConversationActive && !micMuted) {
          startListening('auto');
        }
      },
    });
  }, [speak, isConversationActive, selectedVoiceId, startListening, micMuted]);

  // ========== 摇一摇唤醒 ==========
  useShake({
    onShake: () => {
      if (!isConversationActive && connected && !isThinking) {
        startConversation();
      }
    },
    enabled: connected && !isConversationActive,
  });

  // ========== 麦克风按钮逻辑 ==========
  const handleMicPress = useCallback(() => {
    if (!isConversationActive) {
      // 启动对话
      startConversation();
      return;
    }
    // 对话中：切换静音
    const newMuted = !micMuted;
    setMicMuted(newMuted);
    if (newMuted) {
      // 静音：停止当前录音
      if (isListening) stopListening();
    } else {
      // 取消静音：如果不在思考或说话，开始录音
      if (!isThinking && !isSpeaking) {
        playSound('start');
        startListening('auto');
      }
    }
  }, [isConversationActive, micMuted, isListening, isThinking, isSpeaking, startConversation, stopListening, startListening]);

  // ========== 拍照/上传按钮逻辑 ==========
  const handleCameraPress = useCallback(() => {
    const options = ['上传照片', '拍照', '取消'];
    const cancelIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, title: '选择图片方式' },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            // 上传照片：调用系统图片选择器
            Alert.alert('上传照片', '此功能正在开发中，敬请期待');
          } else if (buttonIndex === 1) {
            // 拍照：调用系统相机
            Alert.alert('拍照', '此功能正在开发中，敬请期待');
          }
        }
      );
    } else {
      Alert.alert(
        '选择图片方式',
        '',
        [
          { text: '上传照片', onPress: () => Alert.alert('上传照片', '此功能正在开发中，敬请期待') },
          { text: '拍照', onPress: () => Alert.alert('拍照', '此功能正在开发中，敬请期待') },
          { text: '取消', style: 'cancel' },
        ]
      );
    }
  }, []);

  // ========== 关闭按钮逻辑 ==========
  const handleClosePress = useCallback(() => {
    if (isConversationActive) {
      endConversation();
    }
  }, [isConversationActive, endConversation]);

  // ========== 配对界面 ==========
  const [pairingDelayPassed, setPairingDelayPassed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPairingDelayPassed(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const showPairing = pairingDelayPassed && (
    gatewayStatus === GatewayStatus.WAITING_PAIRING ||
    (gatewayStatus === GatewayStatus.ERROR && gatewayError?.includes('配对'))
  );

  if (showPairing) {
    return (
      <SafeAreaView style={styles.container}>
        <ExpoStatusBar style="dark" />
        <PairingScreen pairingInfo={pairingInfo} error={gatewayError} />
      </SafeAreaView>
    );
  }

  // ========== 渲染 ==========
  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="dark" />

      {/* 右上角：CC 按钮 + 调试按钮 */}
      <View style={styles.topRight}>
        <CCButton ccEnabled={ccEnabled} onPress={() => setCcEnabled((v) => !v)} />
        <TouchableOpacity
          style={styles.debugButton}
          onPress={() => {
            const recent = debugLogs.slice(-20);
            if (recent.length === 0) {
              Alert.alert('调试日志', '暂无日志');
            } else {
              const logText = recent.join('\n');
              Alert.alert('调试日志', logText, [
                { text: '分享', onPress: () => require('react-native').Share.share({ message: logText }) },
                { text: '清空', style: 'destructive', onPress: () => clearLogs() },
                { text: '关闭', style: 'cancel' },
              ]);
            }
          }}
        >
          <Text style={{ fontSize: 16 }}>🐞</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.debugButton}
          onPress={async () => {
            try {
              const Updates = require('expo-updates');
              Alert.alert('检查更新', '正在检查...');
              const update = await Updates.checkForUpdateAsync();
              if (update.isAvailable) {
                await Updates.fetchUpdateAsync();
                Alert.alert('更新完成', '重启 App 生效', [
                  { text: '稍后', style: 'cancel' },
                  { text: '立即重启', onPress: () => Updates.reloadAsync() },
                ]);
              } else {
                Alert.alert('已是最新', '当前已是最新版本');
              }
            } catch (e) {
              Alert.alert('检查失败', e.message);
            }
          }}
        >
          <Text style={{ fontSize: 16 }}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* 版本号 */}
      <View style={styles.versionRow}>
        <Text style={styles.versionText}>v{APP_VERSION} · {UPDATE_ID ? `OTA:${UPDATE_ID}` : `build:${BUILD_ID}`}</Text>
      </View>

      {/* 老金模式提示条 */}
      {isLaojinMode && (
        <View style={styles.laojinBanner}>
          <Text style={styles.laojinBannerText}>
            🎭 老金模式{laojinTarget ? ` · 对话者：${laojinTarget}` : ''}
          </Text>
        </View>
      )}

      {/* 中央球体区域 */}
      <View style={styles.ballArea}>
        <OrbisBall uiState={uiState} size={BALL_SIZE} />

        {/* CC 字幕：球下方大字 */}
        {ccEnabled && lastAiText ? (
          <View style={styles.ccContainer}>
            <Text style={styles.ccText} numberOfLines={4}>{lastAiText}</Text>
          </View>
        ) : null}

        {/* 实时识别文字 */}
        {partialText ? (
          <View style={styles.partialContainer}>
            <Text style={styles.partialText}>{partialText}</Text>
          </View>
        ) : null}
      </View>

      {/* 状态标签 */}
      <View style={styles.statusLabelRow}>
        <Text style={styles.statusLabel}>{statusLabel}</Text>
      </View>

      {/* 底部3个按钮 */}
      <View style={styles.bottomBar}>
        {/* 拍照/上传按钮 */}
        <CircleButton
          onPress={handleCameraPress}
          disabled={false}
          size={60}
          bgColor="#f0f0f0"
        >
          <CameraIcon size={26} />
        </CircleButton>

        {/* 麦克风主按钮（稍大） */}
        <CircleButton
          onPress={handleMicPress}
          disabled={!connected && uiState !== UI_STATE.disconnected}
          size={76}
          bgColor={micMuted && isConversationActive ? '#ffebee' : '#f0f0f0'}
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 6,
            elevation: 4,
          }}
        >
          <MicIcon muted={micMuted && isConversationActive} size={28} />
        </CircleButton>

        {/* 关闭按钮 */}
        <CircleButton
          onPress={handleClosePress}
          disabled={!isConversationActive}
          size={60}
          bgColor="#f0f0f0"
        >
          <CloseIcon size={22} />
        </CircleButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topRight: {
    position: 'absolute',
    top: 54,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  debugButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  versionRow: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 4,
  },
  versionText: {
    fontSize: 11,
    color: '#aaaaaa',
    letterSpacing: 0.3,
  },
  laojinBanner: {
    backgroundColor: 'rgba(255, 152, 0, 0.10)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginHorizontal: 24,
    borderRadius: 8,
    marginBottom: 8,
  },
  laojinBannerText: {
    color: '#e65100',
    fontSize: 13,
    fontWeight: '600',
  },
  ballArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ccContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  ccText: {
    fontSize: 28,
    fontWeight: '500',
    color: '#111111',
    textAlign: 'center',
    lineHeight: 38,
  },
  partialContainer: {
    marginTop: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  partialText: {
    fontSize: 18,
    color: '#666666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  statusLabelRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  statusLabel: {
    fontSize: 16,
    color: '#888888',
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 36,
    paddingTop: 8,
    gap: 32,
  },
});
