import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

export const StatusBar = ({ gatewayStatus, isListening, isSpeaking, isThinking }) => {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const [showReconnected, setShowReconnected] = useState(false);
  const prevStatusRef = useRef(gatewayStatus);

  // 断线重连中旋转动画
  useEffect(() => {
    const isReconnecting = gatewayStatus === 'disconnected' || gatewayStatus === 'connecting';
    if (isReconnecting) {
      const spin = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spin.start();
      return () => spin.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [gatewayStatus]);

  // 重连成功后短暂显示"已重连"
  useEffect(() => {
    const wasDisconnected =
      prevStatusRef.current === 'disconnected' || prevStatusRef.current === 'connecting';
    const isNowConnected = gatewayStatus === 'connected';

    if (wasDisconnected && isNowConnected) {
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 2000);
      return () => clearTimeout(timer);
    }

    prevStatusRef.current = gatewayStatus;
  }, [gatewayStatus]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const getStatusText = () => {
    // 断线状态
    if (gatewayStatus === 'disconnected') {
      return '🔴 连接断开，正在重连...';
    }
    if (gatewayStatus === 'connecting') {
      return '🔄 正在重连...';
    }
    if (gatewayStatus === 'waiting_challenge' || gatewayStatus === 'signing') {
      return '🔐 验证身份中...';
    }
    if (gatewayStatus === 'waiting_pairing') {
      return '⏳ 等待配对审批...';
    }
    if (gatewayStatus === 'error') {
      return '❌ 连接错误';
    }
    // 重连成功提示
    if (showReconnected) {
      return '✅ 已重连';
    }
    // 正常状态
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
    if (gatewayStatus === 'disconnected' || gatewayStatus === 'error') {
      return '#FF3B30'; // 红色
    }
    if (gatewayStatus === 'connecting') {
      return '#FF9500'; // 橙色
    }
    if (gatewayStatus !== 'connected') {
      return '#FF9500';
    }
    if (showReconnected) {
      return '#34C759'; // 绿色
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

  const isReconnecting = gatewayStatus === 'disconnected' || gatewayStatus === 'connecting';

  return (
    <View style={[
      styles.container,
      isReconnecting && styles.containerError,
      showReconnected && styles.containerReconnected,
    ]}>
      {isReconnecting ? (
        <Animated.Text
          style={[styles.spinIcon, { transform: [{ rotate: spinInterpolate }] }]}
        >
          🔄
        </Animated.Text>
      ) : (
        <View style={[styles.indicator, { backgroundColor: getStatusColor() }]} />
      )}
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
  containerError: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
  },
  containerReconnected: {
    backgroundColor: 'rgba(52, 199, 89, 0.2)',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  spinIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
});
