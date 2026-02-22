import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Pressable,
  Animated,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatHistory } from './src/components/ChatHistory';
import { MicrophoneButton } from './src/components/MicrophoneButton';
import { StatusBar } from './src/components/StatusBar';
import { ModeSwitch } from './src/components/ModeSwitch';
import { PairingScreen } from './src/components/PairingScreen';
import { VoiceSelector } from './src/components/VoiceSelector';
import { useGateway, GatewayStatus } from './src/hooks/useGateway';
import { useSpeech } from './src/hooks/useSpeech';
import { useShake } from './src/hooks/useShake';
import { preloadSounds, playSound, unloadSounds } from './src/services/soundEffects';
import { DEFAULT_VOICE_ID } from './src/config/apiKeys';

import appJson from './app.json';

const APP_VERSION = appJson.expo.version;

// 结束关键词
const EXIT_KEYWORDS = ['再见', '结束', '拜拜', '没事了'];
// 无活动超时（毫秒）
const INACTIVITY_TIMEOUT_MS = 30000;

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [inputText, setInputText] = useState('');
  // 对话模式状态
  const [isConversationActive, setIsConversationActive] = useState(false);

  // 用 ref 跟踪是否已经为当前流式回复创建了助手消息占位
  const streamingMsgAddedRef = useRef(false);
  // 无活动计时器
  const inactivityTimerRef = useRef(null);
  // 思考提示音 interval
  const thinkingIntervalRef = useRef(null);
  // 呼吸灯动画值
  const breathAnim = useRef(new Animated.Value(0)).current;
  const breathAnimRef = useRef(null);
  // 当前呼吸灯颜色
  const [breathColor, setBreathColor] = useState(null);

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

  // 启动时从 AsyncStorage 读取上次选择的声音
  useEffect(() => {
    AsyncStorage.getItem(VOICE_STORAGE_KEY).then((stored) => {
      setSelectedVoiceId(stored || DEFAULT_VOICE_ID);
    }).catch(() => {
      setSelectedVoiceId(DEFAULT_VOICE_ID);
    });
  }, []);

  // 切换声音时保存到 AsyncStorage
  const handleVoiceChange = useCallback((voiceId) => {
    setSelectedVoiceId(voiceId);
    AsyncStorage.setItem(VOICE_STORAGE_KEY, voiceId).catch(() => {});
  }, [setSelectedVoiceId]);

  // ========== 呼吸灯动画 ==========
  const startBreathAnimation = useCallback((color) => {
    setBreathColor(color);
    // 停止之前的动画
    if (breathAnimRef.current) {
      breathAnimRef.current.stop();
    }
    breathAnim.setValue(0);
    breathAnimRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(breathAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    );
    breathAnimRef.current.start();
  }, [breathAnim]);

  const stopBreathAnimation = useCallback(() => {
    if (breathAnimRef.current) {
      breathAnimRef.current.stop();
      breathAnimRef.current = null;
    }
    breathAnim.setValue(0);
    setBreathColor(null);
  }, [breathAnim]);

  // 根据状态切换呼吸灯颜色
  useEffect(() => {
    if (!isConversationActive) {
      stopBreathAnimation();
      return;
    }
    if (isListening) {
      startBreathAnimation('rgba(255, 120, 50, OPACITY)'); // 橙色 — 录音中
    } else if (isThinking) {
      startBreathAnimation('rgba(50, 120, 255, OPACITY)'); // 蓝色 — 思考中
    } else if (isSpeaking) {
      startBreathAnimation('rgba(50, 200, 100, OPACITY)'); // 绿色 — 朗读中
    } else {
      startBreathAnimation('rgba(100, 100, 100, OPACITY)'); // 灰色 — 等待中
    }
  }, [isConversationActive, isListening, isThinking, isSpeaking]);

  // ========== 思考提示音 ==========
  useEffect(() => {
    if (isThinking && isConversationActive) {
      // 立即播放一次，然后每 3 秒播放
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

  // ========== 无活动超时 ==========
  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const startInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      console.log('[Conversation] 30 秒无活动，自动结束对话');
      endConversation();
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearInactivityTimer]);

  // 对话活跃时有活动就重置计时器
  useEffect(() => {
    if (isConversationActive && (isListening || isThinking || isSpeaking)) {
      clearInactivityTimer();
    }
  }, [isConversationActive, isListening, isThinking, isSpeaking, clearInactivityTimer]);

  // ========== 对话模式控制 ==========
  const startConversation = useCallback(async () => {
    if (isConversationActive) return;
    console.log('[Conversation] 唤醒对话模式');
    setIsConversationActive(true);
    // 如果正在朗读，先停止
    if (isSpeaking) {
      await stopSpeaking();
    }
    // 播放开始音效并开始录音
    await playSound('start');
    startListening('auto');
  }, [isConversationActive, isSpeaking, stopSpeaking, startListening]);

  const endConversation = useCallback(async () => {
    console.log('[Conversation] 结束对话模式');
    clearInactivityTimer();
    setIsConversationActive(false);
    await playSound('end');
    // 停止一切进行中的操作
    if (isSpeaking) stopSpeaking();
  }, [clearInactivityTimer, isSpeaking, stopSpeaking]);

  // ========== 关键词检测 ==========
  const checkExitKeyword = useCallback((text) => {
    if (!text) return false;
    return EXIT_KEYWORDS.some((kw) => text.includes(kw));
  }, []);

  // ========== 监听语音识别结果 ==========
  useEffect(() => {
    if (recognizedText && !isListening) {
      // 检测结束关键词
      if (isConversationActive && checkExitKeyword(recognizedText)) {
        console.log('[Conversation] 检测到结束关键词:', recognizedText);
        endConversation();
        return;
      }
      handleUserMessage(recognizedText);
    }
  }, [recognizedText, isListening]);

  // ========== 监听流式文本 ==========
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
      Alert.alert('语音错误', speechError);
    }
  }, [speechError]);

  // ========== 朗读结束后自动继续录音 ==========
  useEffect(() => {
    // 当朗读刚结束且对话模式激活 → 自动开始下一轮录音
    if (isConversationActive && !isSpeaking && !isListening && !isThinking) {
      // 延迟一小段时间再开始，避免和 TTS 结束冲突
      const timer = setTimeout(async () => {
        // 再次检查状态（可能已经变化）
        if (isConversationActive && !isSpeaking && !isListening && !isThinking) {
          console.log('[Conversation] 朗读结束，自动开始下一轮录音');
          await playSound('start');
          startListening('auto');
          // 启动无活动计时器
          startInactivityTimer();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isConversationActive, isSpeaking, isListening, isThinking]);

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

    try {
      setIsThinking(true);
      await sendMessage(text);
    } catch (error) {
      console.error('Send message error:', error);
      playSound('error');
      Alert.alert('发送失败', error.message);
      setIsThinking(false);
    }
  }, [sendMessage, isConversationActive]);

  const handleAssistantFinal = useCallback(async (text) => {
    setIsThinking(false);

    if (isConversationActive) {
      await playSound('received');
    }

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

    // 朗读回复（speak 内部会先做口语化转换）
    await speak(text);
  }, [speak, isConversationActive]);

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

  // ========== 点击屏幕唤醒/打断 ==========
  const handleScreenPress = useCallback(() => {
    if (!connected) return;

    if (!isConversationActive) {
      // 待机状态 → 唤醒对话
      startConversation();
    } else if (isSpeaking) {
      // 对话中正在朗读 → 打断朗读，开始录音
      stopSpeaking();
      playSound('start');
      startListening('auto');
    } else if (isListening) {
      // 已经在录音 → 忽略
    }
  }, [connected, isConversationActive, isSpeaking, isListening, stopSpeaking, startListening, startConversation]);

  // ========== 麦克风按钮 ==========
  const handleMicrophonePress = useCallback(() => {
    if (isAutoMode) {
      if (isListening) {
        stopListening();
      } else {
        if (isSpeaking) {
          stopSpeaking();
        }
        if (!isConversationActive) {
          startConversation();
        } else {
          playSound('start');
          startListening('auto');
        }
      }
    }
  }, [isAutoMode, isListening, isSpeaking, isConversationActive, startListening, stopListening, stopSpeaking, startConversation]);

  const handleMicrophoneLongPress = useCallback(() => {
    if (!isAutoMode) {
      if (isSpeaking) {
        stopSpeaking();
      }
      setIsLongPressing(true);
      if (!isConversationActive) {
        setIsConversationActive(true);
      }
      playSound('start');
      startListening('manual');
    }
  }, [isAutoMode, isSpeaking, isConversationActive, startListening, stopSpeaking]);

  const handleMicrophonePressOut = useCallback(() => {
    if (!isAutoMode && isLongPressing) {
      setIsLongPressing(false);
      stopListening();
    }
  }, [isAutoMode, isLongPressing, stopListening]);

  const handleModeToggle = useCallback(() => {
    if (isListening) {
      stopListening();
    }
    setIsAutoMode((prev) => !prev);
  }, [isListening, stopListening]);

  // 文字输入发送
  const handleTextSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    handleUserMessage(text);
  }, [inputText, handleUserMessage]);

  // 语速调节
  const handleSpeedChange = useCallback((delta) => {
    setSpeechSpeed((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      return Math.max(0.5, Math.min(2.0, next));
    });
  }, [setSpeechSpeed]);

  // ========== 呼吸灯背景色插值 ==========
  const breathOpacity = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.05, 0.15],
  });

  // 如果正在等待配对审批，显示配对界面
  const showPairing =
    gatewayStatus === GatewayStatus.WAITING_PAIRING ||
    (gatewayStatus === GatewayStatus.ERROR && gatewayError?.includes('配对'));

  if (showPairing) {
    return (
      <SafeAreaView style={styles.container}>
        <ExpoStatusBar style="light" />
        <PairingScreen pairingInfo={pairingInfo} error={gatewayError} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="light" />

      {/* 呼吸灯背景层 */}
      {isConversationActive && breathColor && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: breathColor.replace('OPACITY', '1'),
              opacity: breathOpacity,
              zIndex: 1,
            },
          ]}
        />
      )}

      {/* 点击屏幕任意位置唤醒/打断 */}
      <Pressable style={styles.pressableOverlay} onPress={handleScreenPress}>
        <View style={styles.innerContainer}>
          {/* 顶部标题 */}
          <View style={styles.header}>
            <Text style={styles.title}>🔧 小金语音</Text>
            <View style={styles.headerRow}>
              <Text style={styles.version}>v{APP_VERSION}</Text>
              {isConversationActive && (
                <Text style={styles.conversationBadge}>● 对话中</Text>
              )}
            </View>
          </View>

          {/* 聊天区域 */}
          <View style={styles.chatArea}>
            <ChatHistory
              messages={messages}
              isThinking={isThinking}
              isStreaming={isStreaming}
            />
          </View>

          {/* 对话模式状态提示 */}
          {isConversationActive && (
            <View style={styles.conversationHint}>
              <Text style={styles.conversationHintText}>
                {isListening ? '🎙 正在听...' :
                 isThinking ? '🤔 思考中...' :
                 isSpeaking ? '🔊 朗读中...' :
                 '⏳ 等待中...'}
              </Text>
              <Text style={styles.conversationSubHint}>
                说"再见"或 30 秒无操作自动结束
              </Text>
            </View>
          )}

          {!isConversationActive && (
            <View style={styles.wakeHint}>
              <Text style={styles.wakeHintText}>
                点击屏幕或摇一摇开始对话
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      {/* 底部控制区 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.bottomContainer}
      >
        {/* 状态栏 */}
        <View style={styles.statusContainer}>
          <StatusBar
            gatewayStatus={gatewayStatus}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isThinking={isThinking}
          />
        </View>

        {/* 实时识别文字 / 录音状态显示 */}
        {partialText ? (
          <View style={styles.partialTextContainer}>
            <Text style={styles.partialText}>{partialText}</Text>
          </View>
        ) : null}

        {/* 文字输入框 */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="输入文字..."
            placeholderTextColor="#666666"
            returnKeyType="send"
            onSubmitEditing={handleTextSend}
            editable={connected && !isThinking}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || !connected || isThinking) && styles.sendButtonDisabled,
            ]}
            onPress={handleTextSend}
            disabled={!inputText.trim() || !connected || isThinking}
          >
            <Text style={styles.sendButtonText}>发送</Text>
          </TouchableOpacity>
        </View>

        {/* 麦克风按钮 */}
        <View style={styles.micContainer}>
          <MicrophoneButton
            isListening={isListening}
            onPress={handleMicrophonePress}
            onLongPress={handleMicrophoneLongPress}
            onPressOut={handleMicrophonePressOut}
            disabled={!connected || isThinking}
          />
        </View>

        {/* 模式切换 */}
        <View style={styles.modeContainer}>
          <ModeSwitch isAutoMode={isAutoMode} onToggle={handleModeToggle} />
        </View>

        {/* 语速调节 + 声音选择 */}
        <View style={styles.speedContainer}>
          <TouchableOpacity
            style={styles.speedButton}
            onPress={() => handleSpeedChange(-0.1)}
          >
            <Text style={styles.speedButtonText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.speedLabel}>语速 {speechSpeed.toFixed(1)}x</Text>
          <TouchableOpacity
            style={styles.speedButton}
            onPress={() => handleSpeedChange(0.1)}
          >
            <Text style={styles.speedButtonText}>+</Text>
          </TouchableOpacity>

          <View style={styles.voiceSelectorWrapper}>
            <VoiceSelector
              selectedVoiceId={selectedVoiceId || DEFAULT_VOICE_ID}
              onVoiceChange={handleVoiceChange}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  pressableOverlay: {
    flex: 1,
    zIndex: 2,
  },
  innerContainer: {
    flex: 1,
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  version: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
  },
  conversationBadge: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  chatArea: {
    flex: 1,
  },
  conversationHint: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  conversationHintText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
  },
  conversationSubHint: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
  },
  wakeHint: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  wakeHintText: {
    fontSize: 14,
    color: '#555555',
  },
  bottomContainer: {
    backgroundColor: '#1a1a1a',
    paddingBottom: 20,
    zIndex: 3,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  partialTextContainer: {
    alignItems: 'center',
    marginBottom: 8,
    marginHorizontal: 40,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(42, 42, 42, 0.8)',
    borderRadius: 12,
  },
  partialText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  textInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#2a2a2a',
    borderRadius: 21,
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 15,
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#007AFF',
    borderRadius: 21,
    paddingHorizontal: 16,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#3a3a3a',
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  micContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modeContainer: {
    marginBottom: 8,
  },
  speedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    paddingVertical: 6,
  },
  speedButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  speedLabel: {
    color: '#999999',
    fontSize: 13,
    marginHorizontal: 16,
    minWidth: 70,
    textAlign: 'center',
  },
  voiceSelectorWrapper: {
    marginLeft: 12,
  },
});
