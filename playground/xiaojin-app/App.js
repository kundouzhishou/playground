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
  TouchableWithoutFeedback,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { ChatHistory } from './src/components/ChatHistory';
import { MicrophoneButton } from './src/components/MicrophoneButton';
import { StatusBar } from './src/components/StatusBar';
import { ModeSwitch } from './src/components/ModeSwitch';
import { PairingScreen } from './src/components/PairingScreen';
import { useGateway, GatewayStatus } from './src/hooks/useGateway';
import { useSpeech } from './src/hooks/useSpeech';

import appJson from './app.json';

const APP_VERSION = appJson.expo.version;

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [inputText, setInputText] = useState('');

  // 用 ref 跟踪是否已经为当前流式回复创建了助手消息占位
  const streamingMsgAddedRef = useRef(false);

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
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  } = useSpeech();

  // 监听语音识别结果（VAD 沉默窗口到期后触发）
  useEffect(() => {
    if (recognizedText && !isListening) {
      handleUserMessage(recognizedText);
    }
  }, [recognizedText, isListening]);

  // 监听流式文本 — 实时更新最后一条助手消息
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

  // 监听 Gateway 最终消息
  useEffect(() => {
    if (lastMessage && lastMessage.state === 'final' && lastMessage.message?.content?.[0]?.text) {
      const finalText = lastMessage.message.content[0].text;
      handleAssistantFinal(finalText);
    }
  }, [lastMessage]);

  // 监听语音错误
  useEffect(() => {
    if (speechError) {
      Alert.alert('语音错误', speechError);
    }
  }, [speechError]);

  const handleUserMessage = useCallback(async (text) => {
    if (!text.trim()) return;

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
      Alert.alert('发送失败', error.message);
      setIsThinking(false);
    }
  }, [sendMessage]);

  // 最终消息到达：确保消息列表是最终文本，然后朗读
  const handleAssistantFinal = useCallback(async (text) => {
    setIsThinking(false);

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
  }, [speak]);

  // 改进 3：打断控制 — 按麦克风时自动停止 TTS 并开始录音
  const handleMicrophonePress = useCallback(() => {
    if (isAutoMode) {
      if (isListening) {
        stopListening();
      } else {
        // 打断：如果正在朗读，先停止 TTS 再开始录音
        if (isSpeaking) {
          stopSpeaking();
        }
        startListening('auto');
      }
    }
  }, [isAutoMode, isListening, isSpeaking, startListening, stopListening, stopSpeaking]);

  const handleMicrophoneLongPress = useCallback(() => {
    if (!isAutoMode) {
      // 打断：如果正在朗读，先停止 TTS
      if (isSpeaking) {
        stopSpeaking();
      }
      setIsLongPressing(true);
      startListening('manual');
    }
  }, [isAutoMode, isSpeaking, startListening, stopSpeaking]);

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

  // 点击屏幕任意位置停止朗读
  const handleScreenPress = useCallback(() => {
    if (isSpeaking) {
      stopSpeaking();
    }
  }, [isSpeaking, stopSpeaking]);

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
      
      {/* 顶部标题 */}
      <View style={styles.header}>
        <Text style={styles.title}>🔧 小金语音</Text>
        <Text style={styles.version}>v{APP_VERSION}</Text>
      </View>

      {/* 点击屏幕停止朗读 */}
      <TouchableWithoutFeedback onPress={handleScreenPress}>
        <View style={styles.chatArea}>
          <ChatHistory
            messages={messages}
            isThinking={isThinking}
            isStreaming={isStreaming}
          />
        </View>
      </TouchableWithoutFeedback>

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

        {/* 语速调节 */}
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
  header: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
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
    marginTop: 4,
  },
  chatArea: {
    flex: 1,
  },
  bottomContainer: {
    backgroundColor: '#1a1a1a',
    paddingBottom: 20,
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
  // 语速调节
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
});
