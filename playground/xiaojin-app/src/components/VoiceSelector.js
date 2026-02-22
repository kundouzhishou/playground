/**
 * 声音选择器组件
 * 显示当前声音，点击展开选项列表切换声音
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
} from 'react-native';
import { VOICE_OPTIONS } from '../config/apiKeys';

export const VoiceSelector = ({ selectedVoiceId, onVoiceChange, disabled = false }) => {
  const [visible, setVisible] = useState(false);

  // 当前选中的声音信息
  const currentVoice = VOICE_OPTIONS.find((v) => v.id === selectedVoiceId) || VOICE_OPTIONS[0];

  const handleSelect = (voiceId) => {
    onVoiceChange(voiceId);
    setVisible(false);
  };

  return (
    <View style={styles.container}>
      {/* 老金模式激活时显示模式标签，否则显示正常选择器 */}
      {disabled ? (
        <View style={[styles.selector, styles.selectorDisabled]}>
          <Text style={styles.selectorIcon}>🎭</Text>
          <Text style={styles.selectorText}>老金模式</Text>
        </View>
      ) : (
      <TouchableOpacity style={styles.selector} onPress={() => setVisible(true)}>
        <Text style={styles.selectorIcon}>🎤</Text>
        <Text style={styles.selectorText}>{currentVoice.name}</Text>
        <Text style={styles.selectorArrow}>▾</Text>
      </TouchableOpacity>
      )}

      {/* 声音选择弹窗 */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>选择声音</Text>
            {VOICE_OPTIONS.map((voice) => {
              const isSelected = voice.id === selectedVoiceId;
              return (
                <TouchableOpacity
                  key={voice.id}
                  style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                  onPress={() => handleSelect(voice.id)}
                >
                  <View style={styles.optionInfo}>
                    <Text style={[styles.optionName, isSelected && styles.optionNameSelected]}>
                      {voice.name}
                    </Text>
                    <Text style={styles.optionLabel}>{voice.label}</Text>
                  </View>
                  {isSelected && <Text style={styles.checkMark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  // 选择器禁用状态（老金模式）
  selectorDisabled: {
    opacity: 0.8,
    backgroundColor: '#3a2a1a',
  },
  // 选择器按钮
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  selectorIcon: {
    fontSize: 14,
  },
  selectorText: {
    color: '#cccccc',
    fontSize: 13,
  },
  selectorArrow: {
    color: '#666666',
    fontSize: 10,
    marginLeft: 2,
  },
  // 弹窗背景
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 弹窗内容
  modalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: 260,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  // 选项行
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  optionRowSelected: {
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
  },
  optionInfo: {
    flex: 1,
  },
  optionName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  optionNameSelected: {
    color: '#007AFF',
  },
  optionLabel: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  checkMark: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
});
