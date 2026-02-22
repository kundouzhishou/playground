import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const StatusBar = ({ gatewayStatus, isListening, isSpeaking, isThinking }) => {
  const getStatusText = () => {
    if (gatewayStatus === 'waiting_challenge' || gatewayStatus === 'signing') {
      return '🔐 验证身份中...';
    }
    if (gatewayStatus === 'waiting_pairing') {
      return '⏳ 等待配对审批...';
    }
    if (gatewayStatus !== 'connected') {
      return '连接中...';
    }
    if (isSpeaking) {
      return '🔊 小金说话中';
    }
    if (isThinking) {
      return '🤔 小金思考中';
    }
    if (isListening) {
      return '👂 正在听';
    }
    return '✅ 已连接';
  };

  const getStatusColor = () => {
    if (gatewayStatus !== 'connected') {
      return '#FF9500';
    }
    if (isSpeaking) {
      return '#34C759';
    }
    if (isThinking) {
      return '#5AC8FA';
    }
    if (isListening) {
      return '#FF3B30';
    }
    return '#34C759';
  };

  return (
    <View style={styles.container}>
      <View style={[styles.indicator, { backgroundColor: getStatusColor() }]} />
      <Text style={styles.text}>{getStatusText()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(42, 42, 42, 0.8)',
    borderRadius: 20,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
});
