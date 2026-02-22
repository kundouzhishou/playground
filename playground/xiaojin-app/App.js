import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { ChatHistory } from './src/components/ChatHistory';
import { MicrophoneButton } from './src/components/MicrophoneButton';
import { StatusBar } from './src/components/StatusBar';
import { ModeSwitch } from './src/components/ModeSwitch';
import { useGateway } from './src/hooks/useGateway';
import { useSpeech } from './src/hooks/useSpeech';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);

  const { connected, status: gatewayStatus, sendMessage, lastMessage } = useGateway();
  const {
    isListening,
    isSpeaking,
    recognizedText,
    error: speechError,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  } = useSpeech();

  // 监听语音识别结果
  useEffect(() => {
    if (recognizedText && !isListening) {
      handleUserMessage(recognizedText);
    }
  }, [recognizedText, isListening]);

  // 监听 Gateway 聊天消息（通过 lastMessage state）
  useEffect(() => {
    if (lastMessage && lastMessage.state === 'final' && lastMessage.text) {
      handleAssistantMessage(lastMessage.text);
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

    // 添加用户消息
    const userMessage = {
      text,
      isUser: true,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // 发送到 Gateway
    try {
      setIsThinking(true);
      await sendMessage(text);
    } catch (error) {
      console.error('Send message error:', error);
      Alert.alert('发送失败', error.message);
      setIsThinking(false);
    }
  }, [sendMessage]);

  const handleAssistantMessage = useCallback(async (text) => {
    setIsThinking(false);

    // 添加助手消息
    const assistantMessage = {
      text,
      isUser: false,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    // 朗读回复
    await speak(text);
  }, [speak]);

  const handleMicrophonePress = useCallback(() => {
    if (isAutoMode) {
      // 自动模式：切换监听状态
      if (isListening) {
        stopListening();
      } else {
        startListening('auto');
      }
    }
  }, [isAutoMode, isListening, startListening, stopListening]);

  const handleMicrophoneLongPress = useCallback(() => {
    if (!isAutoMode) {
      // 按住说话模式
      setIsLongPressing(true);
      startListening('manual');
    }
  }, [isAutoMode, startListening]);

  const handleMicrophonePressOut = useCallback(() => {
    if (!isAutoMode && isLongPressing) {
      setIsLongPressing(false);
      stopListening();
    }
  }, [isAutoMode, isLongPressing, stopListening]);

  const handleModeToggle = useCallback(() => {
    // 切换模式时停止当前操作
    if (isListening) {
      stopListening();
    }
    setIsAutoMode((prev) => !prev);
  }, [isListening, stopListening]);

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="light" />
      
      {/* 顶部标题 */}
      <View style={styles.header}>
        <Text style={styles.title}>🔧 小金语音</Text>
      </View>

      {/* 聊天记录 */}
      <ChatHistory messages={messages} />

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

        {/* 麦克风按钮 */}
        <View style={styles.micContainer}>
          <MicrophoneButton
            isListening={isListening}
            onPress={handleMicrophonePress}
            onLongPress={handleMicrophoneLongPress}
            onPressOut={handleMicrophonePressOut}
            disabled={!connected || isSpeaking || isThinking}
          />
        </View>

        {/* 模式切换 */}
        <View style={styles.modeContainer}>
          <ModeSwitch isAutoMode={isAutoMode} onToggle={handleModeToggle} />
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
  bottomContainer: {
    backgroundColor: '#1a1a1a',
    paddingBottom: 20,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  micContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modeContainer: {
    marginBottom: 8,
  },
});
