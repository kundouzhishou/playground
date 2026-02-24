/**
 * 顶部工具栏（极简风格）
 * 右侧：设置按钮
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export const TopBar = ({ onSettings }) => {
  return (
    <View style={styles.container}>
      <View style={styles.spacer} />
      <View style={styles.icons}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onSettings}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.iconText}>⚙️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 44,
  },
  spacer: {
    flex: 1,
  },
  icons: {
    flexDirection: 'row',
    gap: 14,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
  },
});
