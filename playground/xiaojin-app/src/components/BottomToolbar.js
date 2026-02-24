/**
 * 底部工具栏
 * 麦克风（核心）、更多、关闭
 * 苹果风极简设计，白色背景
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

export const BottomToolbar = ({
  isListening = false,
  isMuted = false,
  onMicPress,
  onMorePress,
  onClosePress,
  disabled = false,
}) => {
  return (
    <View style={styles.container}>
      {/* 更多（左） */}
      <TouchableOpacity
        style={styles.btn}
        onPress={onMorePress}
        activeOpacity={0.7}
      >
        <Text style={styles.btnIcon}>⋯</Text>
      </TouchableOpacity>

      {/* 麦克风（中心，大按钮） */}
      <TouchableOpacity
        style={[
          styles.btn,
          styles.micBtn,
          isListening && styles.micBtnActive,
          isMuted && styles.micBtnMuted,
          disabled && styles.btnDisabled,
        ]}
        onPress={onMicPress}
        activeOpacity={0.7}
        disabled={disabled}
      >
        <Text style={styles.micIcon}>
          {isMuted ? '🔇' : (isListening ? '⏹' : '🎤')}
        </Text>
      </TouchableOpacity>

      {/* 关闭（右） */}
      <TouchableOpacity
        style={styles.btn}
        onPress={onClosePress}
        activeOpacity={0.7}
      >
        <Text style={styles.btnIcon}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 12,
    paddingBottom: 28,
    paddingHorizontal: 30,
  },
  btn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f0f0f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f0f0f2',
  },
  micBtnActive: {
    backgroundColor: '#ffe0e5',
  },
  micBtnMuted: {
    backgroundColor: '#ffe0e5',
  },
  btnDisabled: {
    opacity: 0.35,
  },
  btnIcon: {
    fontSize: 20,
    color: '#555',
  },
  micIcon: {
    fontSize: 26,
  },
});
