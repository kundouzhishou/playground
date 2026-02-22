/**
 * 配对等待界面
 *
 * 当 App 等待管理员批准配对时显示。
 * 显示设备 ID 前 8 位方便识别。
 * 配对被拒绝时显示提示。
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

export const PairingScreen = ({ pairingInfo, error }) => {
  // 配对被拒绝
  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.icon}>❌</Text>
        <Text style={styles.title}>配对失败</Text>
        <Text style={styles.message}>{error}</Text>
        <Text style={styles.hint}>请联系管理员重新配对</Text>
      </View>
    );
  }

  // 等待配对审批
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#5AC8FA" style={styles.spinner} />
      <Text style={styles.title}>等待配对审批</Text>
      <Text style={styles.message}>
        请管理员在终端中批准此设备的配对请求
      </Text>
      {pairingInfo?.shortId && (
        <View style={styles.deviceIdContainer}>
          <Text style={styles.deviceIdLabel}>设备 ID</Text>
          <Text style={styles.deviceId}>{pairingInfo.shortId}</Text>
        </View>
      )}
      <Text style={styles.hint}>
        管理员可使用 openclaw devices approve 命令批准
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 32,
  },
  spinner: {
    marginBottom: 24,
  },
  icon: {
    fontSize: 48,
    marginBottom: 24,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  message: {
    color: '#aaaaaa',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  deviceIdContainer: {
    backgroundColor: 'rgba(90, 200, 250, 0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 24,
    alignItems: 'center',
  },
  deviceIdLabel: {
    color: '#888888',
    fontSize: 12,
    marginBottom: 4,
  },
  deviceId: {
    color: '#5AC8FA',
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  hint: {
    color: '#666666',
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
