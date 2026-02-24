import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Pressable,
  Animated,
  Easing,
  Alert,
  Share,
  Dimensions,
  ScrollView,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PairingScreen } from './src/components/PairingScreen';
import { SphereView, SphereState, SPHERE_FULL_SIZE, SPHERE_MINI_SIZE } from './src/components/SphereView';
import { TopBar } from './src/components/TopBar';
import { BottomToolbar } from './src/components/BottomToolbar';
import { SettingsPanel } from './src/components/SettingsPanel';
import { useGateway, GatewayStatus } from './src/hooks/useGateway';
import { useSpeech } from './src/hooks/useSpeech';
import { useShake } from './src/hooks/useShake';
import { preloadSounds, playSound, unloadSounds } from './src/services/soundEffects';
import { DEFAULT_VOICE_ID, LAOJIN_VOICE_ID } from './src/config/apiKeys';
import { speakWithOpenAI } from './src/services/ttsService';
import { GATEWAY_CONFIG } from './src/config/gateway';
import { useRemoteLogs, clearLogs } from './src/services/remoteLog';

import Constants from 'expo-constants';
import appJson from './app.json';

const APP_VERSION = appJson.expo.version;
const BUILD_ID = Constants.expoConfig?.extra?.buildId || 'dev';
const UPDATE_ID = Constants.manifest2?.id?.slice(0, 8) || Constants.manifest?.id?.slice(0, 8) || null;

const { width: SCREEN_W } = Dimensions.get('window');

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

      console.log('[LaojinMode] 检测到激活指令，关系:', relation, '名字:', name, '标识:', sessionId);
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
      console.log('[LaojinMode] 检测到退出指令');
      return { action: 'deactivate', target: null };
    }
  }

  return { action: null, target: null };
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isConversationActive, setIsConversationActive] = useState(false);
  const [isLaojinMode, setIsLaojinMode] = useState(false);
  const [laojinTarget, setLaojinTarget] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  // 当前显示的 AI 回复文本（用于球体 UI 大字显示）
  const [displayReplyText, setDisplayReplyText] = useState('');

  const debugLogs = useRemoteLogs();
  const previousVoiceIdRef = useRef(null);
  const streamingMsgAddedRef = useRef(false);
  const thinkingIntervalRef = useRef(null);

  // 球体尺寸动画（AI 说话时缩小）
  const sphereSizeAnim = useRef(new Animated.Value(SPHERE_FULL_SIZE)).current;
  // 球体位置动画（AI 说话时移到左上角）
  const sphereAlignAnim = useRef(new Animated.Value(0)).current; // 0=居中, 1=左上

  const currentSessionKey = isLaojinMode
    ? `${GATEWAY_CONFIG.sessionKey}-laojin-${laojinTarget || 'guest'}`
    : GATEWAY_CONFIG.sessionKey;

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

  // ========== 球体状态计算 ==========
  const getSphereState = useCallback(() => {
    // 连接状态优先
    if (gatewayStatus === GatewayStatus.DISCONNECTED || gatewayStatus === GatewayStatus.ERROR) {
      return SphereState.DISCONNECTED;
    }
    if (gatewayStatus === GatewayStatus.CONNECTING ||
        gatewayStatus === GatewayStatus.WAITING_CHALLENGE ||
        gatewayStatus === GatewayStatus.SIGNING ||
        gatewayStatus === GatewayStatus.WAITING_PAIRING) {
      return SphereState.CONNECTING;
    }

    // 已连接：根据交互状态
    if (isSpeaking) return SphereState.AI_TALKING;
    if (isThinking || isStreaming) return SphereState.AI_THINKING;
    if (isListening) return SphereState.USER_TALKING;
    return SphereState.IDLE;
  }, [gatewayStatus, isListening, isSpeaking, isThinking, isStreaming]);

  const sphereState = getSphereState();

  // ========== 球体 AI 说话缩放动画 ==========
  useEffect(() => {
    const isAiTalking = sphereState === SphereState.AI_TALKING;
    Animated.parallel([
      Animated.timing(sphereSizeAnim, {
        toValue: isAiTalking ? SPHERE_MINI_SIZE : SPHERE_FULL_SIZE,
        duration: 500,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.timing(sphereAlignAnim, {
        toValue: isAiTalking ? 1 : 0,
        duration: 500,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
    ]).start();

    // 不是 AI 说话时清空显示文本
    if (!isAiTalking) {
      // 延迟清空，让缩放动画完成
      const timer = setTimeout(() => {
        if (getSphereState() !== SphereState.AI_TALKING) {
          setDisplayReplyText('');
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [sphereState]);

  // ========== 思考提示音 ==========
  useEffect(() => {
    if (isThinking && isConversationActive) {
      playSound('thinking');
      thinkingIntervalRef.current = setInterval(() => {
        playSound('thinking');
      }, 3000);
    } else {
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
        thinkingIntervalRef.current = null;
      }
    }
    return () => {
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
        thinkingIntervalRef.current = null;
      }
    };
  }, [isThinking, isConversationActive]);

  // ========== 状态文本 ==========
  const getStatusLabel = useCallback(() => {
    switch (sphereState) {
      case SphereState.DISCONNECTED:
        return '正在连接…';
      case SphereState.CONNECTING:
        return '连接中…';
      case SphereState.IDLE:
        return isConversationActive ? '小金正在聆听' : '点击麦克风开始';
      case SphereState.USER_TALKING:
        return partialText || '请说话…';
      case SphereState.AI_THINKING:
        return '小金正在思考…';
      case SphereState.AI_TALKING:
        return ''; // AI 说话时不显示状态文本
      default:
        return '';
    }
  }, [sphereState, isConversationActive, partialText]);

  // ========== 对话模式控制 ==========
  const startConversation = useCallback(async () => {
    if (isConversationActive) return;
    console.log('[Conversation] 唤醒对话模式');
    setIsConversationActive(true);
    if (isSpeaking) {
      await stopSpeaking();
    }
    await playSound('start');
    startListening('auto');
  }, [isConversationActive, isSpeaking, stopSpeaking, startListening]);

  const endConversation = useCallback(async () => {
    console.log('[Conversation] 结束对话模式');
    setIsConversationActive(false);
    setDisplayReplyText('');
    await playSound('end');
    if (isSpeaking) stopSpeaking();
  }, [isSpeaking, stopSpeaking]);

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
        console.log('[Conversation] 检测到结束关键词:', cleanText);
        endConversation();
        return;
      }

      // 老金模式切换
      const modeSwitch = detectModeSwitch(cleanText);
      if (modeSwitch.action === 'activate' && !isLaojinMode) {
        console.log('[LaojinMode] 激活老金模式');
        previousVoiceIdRef.current = selectedVoiceId;
        setSelectedVoiceId(LAOJIN_VOICE_ID);
        setIsLaojinMode(true);
        setLaojinTarget(modeSwitch.target);
        const displayLabel = modeSwitch.displayLabel || '访客';
        setMessages([{
          text: `已进入老金模式，对话者：${displayLabel}`,
          isUser: false,
          isSystem: true,
          timestamp: Date.now(),
        }]);
        speakWithOpenAI('好的，已切换到老金模式', {
          voiceId: LAOJIN_VOICE_ID,
          onDone: () => {
            console.log('[LaojinMode] 确认语音播放完成');
          },
        });
        return;
      }
      if (modeSwitch.action === 'deactivate' && isLaojinMode) {
        console.log('[LaojinMode] 退出老金模式');
        const restoredVoice = previousVoiceIdRef.current || DEFAULT_VOICE_ID;
        setSelectedVoiceId(restoredVoice);
        AsyncStorage.setItem(VOICE_STORAGE_KEY, restoredVoice).catch(() => {});
        setIsLaojinMode(false);
        setLaojinTarget(null);
        previousVoiceIdRef.current = null;
        setMessages([{
          text: '已退出老金模式',
          isUser: false,
          isSystem: true,
          timestamp: Date.now(),
        }]);
        speakWithOpenAI('好的，已退出老金模式', {
          voiceId: restoredVoice,
          onDone: () => {
            console.log('[LaojinMode] 退出确认语音播放完成');
          },
        });
        return;
      }

      handleUserMessage(cleanText);
    }
  }, [recognizedText, isListening]);

  // ========== 监听流式文本（更新显示） ==========
  useEffect(() => {
    if (isStreaming && streamingText) {
      setMessages((prev) => {
        if (!streamingMsgAddedRef.current) {
          streamingMsgAddedRef.current = true;
          return [
            ...prev,
            { text: streamingText, isUser: false, timestamp: Date.now() },
          ];
        }
        const updated = [...prev];
        if (updated.length > 0) {
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            text: streamingText,
          };
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
        { text: '分享', onPress: () => Share.share({ message: speechError }) },
        { text: '关闭', style: 'cancel' },
      ]);
    }
  }, [speechError]);

  // ========== 消息处理 ==========
  const handleUserMessage = useCallback(async (text) => {
    if (!text.trim()) return;

    if (isConversationActive) {
      await playSound('sent');
    }

    const userMessage = {
      text,
      isUser: true,
      timestamp: Date.now(),
    };
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
      console.error('Send message error:', error);
      playSound('error');
      Alert.alert('发送失败', error.message, [
        { text: '分享', onPress: () => Share.share({ message: error.message }) },
        { text: '关闭', style: 'cancel' },
      ]);
      setIsThinking(false);
    }
  }, [sendMessage, isConversationActive, isLaojinMode, laojinTarget, currentSessionKey]);

  const handleAssistantFinal = useCallback(async (text) => {
    setIsThinking(false);

    if (isConversationActive) {
      await playSound('received');
    }

    // 设置显示文本（球体 UI 大字显示）
    setDisplayReplyText(text);

    setMessages((prev) => {
      if (streamingMsgAddedRef.current) {
        const updated = [...prev];
        if (updated.length > 0 && !updated[updated.length - 1].isUser) {
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            text,
          };
        }
        return updated;
      }
      return [
        ...prev,
        { text, isUser: false, timestamp: Date.now() },
      ];
    });

    streamingMsgAddedRef.current = false;

    // 朗读回复
    await speak(text, {
      voiceId: selectedVoiceId,
      onDone: () => {
        if (isConversationActive) {
          startListening('auto');
        }
      },
    });
  }, [speak, isConversationActive, selectedVoiceId, startListening]);

  // ========== 摇一摇唤醒 ==========
  useShake({
    onShake: () => {
      if (!isConversationActive && connected && !isThinking) {
        console.log('[Shake] 摇一摇唤醒');
        startConversation();
      }
    },
    enabled: connected && !isConversationActive,
  });

  // ========== 麦克风按钮 ==========
  const handleMicrophonePress = useCallback(() => {
    if (isListening) {
      stopListening();
    } else if (isSpeaking) {
      stopSpeaking();
    } else if (!isConversationActive) {
      startConversation();
    } else if (!isThinking) {
      playSound('start');
      startListening('auto');
    }
  }, [isListening, isSpeaking, isConversationActive, isThinking, startListening, stopListening, stopSpeaking, startConversation]);

  // ========== 点击屏幕 ==========
  const handleScreenPress = useCallback(() => {
    if (!connected) return;

    if (!isConversationActive) {
      startConversation();
    } else if (isSpeaking) {
      stopSpeaking();
    } else if (isListening) {
      stopListening();
    } else if (!isThinking) {
      playSound('start');
      startListening('auto');
    }
  }, [connected, isConversationActive, isSpeaking, isListening, isThinking, stopSpeaking, stopListening, startListening, startConversation]);

  // ========== 关闭按钮 ==========
  const handleClose = useCallback(() => {
    if (isConversationActive) {
      endConversation();
    }
  }, [isConversationActive, endConversation]);

  // ========== 语速调节 ==========
  const handleSpeedChange = useCallback((delta) => {
    setSpeechSpeed((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      return Math.max(0.5, Math.min(2.0, next));
    });
  }, [setSpeechSpeed]);

  // ========== 检查更新 ==========
  const handleCheckUpdate = useCallback(async () => {
    try {
      const Updates = require('expo-updates');
      Alert.alert('检查更新', '正在检查...');
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert('发现新版本', '正在下载更新...', [{ text: '好' }]);
        await Updates.fetchUpdateAsync();
        Alert.alert('更新完成', '重启 App 生效', [
          { text: '稍后', style: 'cancel' },
          { text: '立即重启', onPress: () => Updates.reloadAsync() },
        ]);
      } else {
        Alert.alert('已是最新', '当前已是最新版本');
      }
    } catch (e) {
      Alert.alert('检查失败', e.message, [
        { text: '分享', onPress: () => Share.share({ message: e.message }) },
        { text: '关闭', style: 'cancel' },
      ]);
    }
  }, []);

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
      <SafeAreaView style={styles.containerDark}>
        <ExpoStatusBar style="light" />
        <PairingScreen pairingInfo={pairingInfo} error={gatewayError} />
      </SafeAreaView>
    );
  }

  // ── AI 说话时球体缩小到左上角的位移 ──
  const sphereTranslateX = sphereAlignAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -(SCREEN_W / 2) + SPHERE_MINI_SIZE / 2 + 24],
  });
  const sphereTranslateY = sphereAlignAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -120],
  });

  const isAiTalking = sphereState === SphereState.AI_TALKING;

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="dark" />

      {/* 顶部栏 */}
      <TopBar onSettings={() => setShowSettings(true)} />

      {/* 老金模式提示 */}
      {isLaojinMode && (
        <View style={styles.laojinBanner}>
          <Text style={styles.laojinBannerText}>
            🎭 老金模式{laojinTarget ? ` · ${laojinTarget}` : ''}
          </Text>
        </View>
      )}

      {/* 主舞台 */}
      <Pressable style={styles.stage} onPress={handleScreenPress}>
        {/* 球体容器 */}
        <Animated.View
          style={[
            styles.sphereContainer,
            {
              transform: [
                { translateX: sphereTranslateX },
                { translateY: sphereTranslateY },
              ],
            },
          ]}
        >
          <Animated.View style={{ width: sphereSizeAnim, height: sphereSizeAnim }}>
            <SphereView state={sphereState} />
          </Animated.View>
        </Animated.View>

        {/* 状态文本（非 AI 说话时显示） */}
        {!isAiTalking && (
          <View style={styles.statusLabelContainer}>
            <Text style={styles.statusLabel}>{getStatusLabel()}</Text>
          </View>
        )}

        {/* AI 回复文本（AI 说话时大字显示） */}
        {isAiTalking && displayReplyText ? (
          <ScrollView
            style={styles.replyScrollView}
            contentContainerStyle={styles.replyScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.replyText}>{displayReplyText}</Text>
          </ScrollView>
        ) : null}

        {/* 流式文本预览（AI 思考中，文本还在流入） */}
        {sphereState === SphereState.AI_THINKING && streamingText ? (
          <View style={styles.streamingPreview}>
            <Text style={styles.streamingText} numberOfLines={3}>
              {streamingText}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {/* 底部工具栏 */}
      <BottomToolbar
        isListening={isListening}
        onMicPress={handleMicrophonePress}
        onMorePress={() => setShowSettings(true)}
        onClosePress={handleClose}
        disabled={!connected || isThinking}
      />

      {/* 设置面板 */}
      <SettingsPanel
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        speechSpeed={speechSpeed}
        onSpeedChange={handleSpeedChange}
        selectedVoiceId={selectedVoiceId || DEFAULT_VOICE_ID}
        onVoiceChange={handleVoiceChange}
        isLaojinMode={isLaojinMode}
        appVersion={APP_VERSION}
        updateId={UPDATE_ID}
        buildId={BUILD_ID}
        debugLogs={debugLogs}
        onClearLogs={clearLogs}
        onCheckUpdate={handleCheckUpdate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  containerDark: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  // 老金模式横幅
  laojinBanner: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  laojinBannerText: {
    color: '#E67E22',
    fontSize: 13,
    fontWeight: '600',
  },
  // 主舞台
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // 球体容器
  sphereContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  // 状态文本
  statusLabelContainer: {
    marginTop: 28,
    paddingHorizontal: 20,
  },
  statusLabel: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  // AI 回复大字
  replyScrollView: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 28,
  },
  replyScrollContent: {
    paddingTop: 10,
    paddingBottom: 40,
  },
  replyText: {
    fontSize: 24,
    fontWeight: '400',
    color: '#111',
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  // 流式文本预览
  streamingPreview: {
    position: 'absolute',
    bottom: 20,
    left: 28,
    right: 28,
  },
  streamingText: {
    fontSize: 14,
    color: '#bbb',
    lineHeight: 20,
    textAlign: 'center',
  },
});
