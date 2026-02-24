/**
 * 设置面板（底部弹出）
 * 语速调节、声音选择、版本信息、调试日志、检查更新
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Share,
} from 'react-native';
import { VoiceSelector } from './VoiceSelector';

export const SettingsPanel = ({
  visible,
  onClose,
  speechSpeed,
  onSpeedChange,
  selectedVoiceId,
  onVoiceChange,
  isLaojinMode,
  appVersion,
  updateId,
  buildId,
  debugLogs,
  onClearLogs,
  onCheckUpdate,
}) => {
  const handleShowLogs = () => {
    const recent = (debugLogs || []).slice(-20);
    if (recent.length === 0) {
      Alert.alert('调试日志', '暂无日志');
    } else {
      const logText = recent.join('\n');
      Alert.alert('调试日志 (最近20条)', logText, [
        { text: '分享', onPress: () => Share.share({ message: logText }) },
        { text: '清空', style: 'destructive', onPress: onClearLogs },
        { text: '关闭', style: 'cancel' },
      ]);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>设置</Text>

          <ScrollView style={styles.scrollContent} bounces={false}>
            {/* 语速 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>语速</Text>
              <View style={styles.speedRow}>
                <TouchableOpacity
                  style={styles.speedBtn}
                  onPress={() => onSpeedChange(-0.1)}
                >
                  <Text style={styles.speedBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.speedValue}>
                  {(speechSpeed || 1.0).toFixed(1)}x
                </Text>
                <TouchableOpacity
                  style={styles.speedBtn}
                  onPress={() => onSpeedChange(0.1)}
                >
                  <Text style={styles.speedBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 声音 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>声音</Text>
              <View style={styles.voiceRow}>
                <VoiceSelector
                  selectedVoiceId={selectedVoiceId}
                  onVoiceChange={onVoiceChange}
                  disabled={isLaojinMode}
                />
              </View>
            </View>

            {/* 操作 */}
            <View style={styles.section}>
              <TouchableOpacity style={styles.actionBtn} onPress={onCheckUpdate}>
                <Text style={styles.actionBtnText}>🔄 检查更新</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={handleShowLogs}>
                <Text style={styles.actionBtnText}>🐞 调试日志</Text>
              </TouchableOpacity>
            </View>

            {/* 版本 */}
            <View style={styles.versionSection}>
              <Text style={styles.versionText}>
                v{appVersion} · {updateId ? `OTA:${updateId}` : `build:${buildId}`}
              </Text>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '65%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#d0d0d0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
    marginBottom: 20,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  speedBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedBtnText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
  },
  speedValue: {
    fontSize: 20,
    fontWeight: '500',
    color: '#111',
    minWidth: 50,
    textAlign: 'center',
  },
  voiceRow: {
    alignItems: 'center',
  },
  actionBtn: {
    backgroundColor: '#f5f5f7',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  actionBtnText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  versionSection: {
    marginBottom: 8,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
    color: '#bbb',
  },
});
