import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';

export const ModeSwitch = ({ isAutoMode, onToggle }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {isAutoMode ? '🔄 自动检测说话' : '👆 按住说话'}
      </Text>
      <Switch
        value={isAutoMode}
        onValueChange={onToggle}
        trackColor={{ false: '#3a3a3a', true: '#007AFF' }}
        thumbColor="#ffffff"
        ios_backgroundColor="#3a3a3a"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    marginHorizontal: 16,
  },
  label: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
});
