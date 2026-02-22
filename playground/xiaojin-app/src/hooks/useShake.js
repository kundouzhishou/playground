/**
 * 摇一摇检测 Hook
 * 使用 expo-sensors 的 Accelerometer 检测设备摇晃动作
 * 用于免视觉交互：摇一摇唤醒对话
 */

import { useEffect, useRef, useCallback } from 'react';
import { Accelerometer } from 'expo-sensors';

// 摇晃检测阈值（加速度变化量，单位 g）
const SHAKE_THRESHOLD = 1.5;
// 防抖间隔（毫秒）
const DEBOUNCE_MS = 500;

/**
 * 摇一摇检测 Hook
 * @param {Object} options
 * @param {Function} options.onShake - 检测到摇晃时的回调
 * @param {boolean} options.enabled - 是否启用检测（默认 true）
 */
export function useShake({ onShake, enabled = true }) {
  const lastShakeRef = useRef(0);
  const lastAccelRef = useRef({ x: 0, y: 0, z: 0 });
  const subscriptionRef = useRef(null);
  const onShakeRef = useRef(onShake);

  // 保持回调引用最新
  useEffect(() => {
    onShakeRef.current = onShake;
  }, [onShake]);

  const handleAccelData = useCallback(({ x, y, z }) => {
    const last = lastAccelRef.current;
    // 计算加速度变化量
    const deltaX = Math.abs(x - last.x);
    const deltaY = Math.abs(y - last.y);
    const deltaZ = Math.abs(z - last.z);
    const totalDelta = deltaX + deltaY + deltaZ;

    lastAccelRef.current = { x, y, z };

    if (totalDelta > SHAKE_THRESHOLD) {
      const now = Date.now();
      // 防抖：500ms 内不重复触发
      if (now - lastShakeRef.current > DEBOUNCE_MS) {
        lastShakeRef.current = now;
        console.log(`[Shake] 检测到摇晃！加速度变化: ${totalDelta.toFixed(2)}g`);
        onShakeRef.current?.();
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // 禁用时取消订阅
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      return;
    }

    // 设置采样频率（100ms 一次，省电）
    Accelerometer.setUpdateInterval(100);
    subscriptionRef.current = Accelerometer.addListener(handleAccelData);
    console.log('[Shake] 摇一摇检测已启动');

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
        console.log('[Shake] 摇一摇检测已停止');
      }
    };
  }, [enabled, handleAccelData]);
}
