/**
 * 球体 UI 组件
 * 参考 voice-ui-v1/index.html 设计，用 React Native Animated API 实现
 *
 * 始终填满父容器尺寸（由父组件通过 Animated 控制大小）
 *
 * 状态列表：
 * - disconnected: 深色球，慢呼吸动画
 * - connecting:   深色→蓝色渐变过渡
 * - idle:         蓝色球，轻微上下浮动
 * - user-talking: 快速呼吸 + 光晕扩散
 * - ai-thinking:  收缩 + 旋转感
 * - ai-talking:   节奏扩张
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
export const SPHERE_FULL_SIZE = Math.min(SCREEN_W, SCREEN_H) * 0.55;
export const SPHERE_MINI_SIZE = 64;

// 球体状态常量
export const SphereState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  IDLE: 'idle',
  USER_TALKING: 'user-talking',
  AI_THINKING: 'ai-thinking',
  AI_TALKING: 'ai-talking',
};

export const SphereView = ({ state = SphereState.DISCONNECTED }) => {
  // ── 动画值 ──
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  // 颜色过渡：0=深色 1=蓝色
  const colorProgress = useRef(new Animated.Value(0)).current;
  // 光晕（用户说话时扩散）
  const glowScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // 当前循环动画引用
  const loopRef = useRef(null);

  const stopLoop = () => {
    if (loopRef.current) {
      loopRef.current.stop();
      loopRef.current = null;
    }
  };

  useEffect(() => {
    stopLoop();
    // 重置基础值
    scaleAnim.setValue(1);
    floatY.setValue(0);
    rotateAnim.setValue(0);
    glowScale.setValue(1);
    glowOpacity.setValue(0);

    // 公用：颜色过渡
    const isConnected = state !== SphereState.DISCONNECTED;
    Animated.timing(colorProgress, {
      toValue: isConnected ? 1 : 0,
      duration: state === SphereState.CONNECTING ? 1500 : 800,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();

    switch (state) {
      // ── 未连接：慢呼吸 ──
      case SphereState.DISCONNECTED: {
        scaleAnim.setValue(0.95);
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.05,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 0.95,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
        loopRef.current = loop;
        loop.start();
        break;
      }

      // ── 连接中：慢呼吸（颜色渐变由上面统一处理）──
      case SphereState.CONNECTING: {
        scaleAnim.setValue(0.95);
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.05,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 0.95,
              duration: 1500,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
        loopRef.current = loop;
        loop.start();
        break;
      }

      // ── 待机：上下浮动 ──
      case SphereState.IDLE: {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(floatY, {
              toValue: -6,
              duration: 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(floatY, {
              toValue: 0,
              duration: 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
        loopRef.current = loop;
        loop.start();
        break;
      }

      // ── 用户说话：快速呼吸 + 光晕脉冲 ──
      case SphereState.USER_TALKING: {
        const loop = Animated.loop(
          Animated.parallel([
            // 快速呼吸
            Animated.sequence([
              Animated.timing(scaleAnim, {
                toValue: 1.08,
                duration: 500,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(scaleAnim, {
                toValue: 1,
                duration: 500,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
            // 光晕脉冲
            Animated.sequence([
              Animated.parallel([
                Animated.timing(glowScale, {
                  toValue: 1.3,
                  duration: 600,
                  easing: Easing.out(Easing.ease),
                  useNativeDriver: true,
                }),
                Animated.timing(glowOpacity, {
                  toValue: 0.4,
                  duration: 300,
                  useNativeDriver: true,
                }),
              ]),
              Animated.parallel([
                Animated.timing(glowScale, {
                  toValue: 1,
                  duration: 400,
                  easing: Easing.in(Easing.ease),
                  useNativeDriver: true,
                }),
                Animated.timing(glowOpacity, {
                  toValue: 0.1,
                  duration: 400,
                  useNativeDriver: true,
                }),
              ]),
            ]),
          ])
        );
        loopRef.current = loop;
        loop.start();
        break;
      }

      // ── AI 思考：收缩 + 轻微旋转 ──
      case SphereState.AI_THINKING: {
        scaleAnim.setValue(0.92);
        const loop = Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(scaleAnim, {
                toValue: 0.86,
                duration: 700,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(rotateAnim, {
                toValue: -3,
                duration: 700,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(scaleAnim, {
                toValue: 0.93,
                duration: 700,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(rotateAnim, {
                toValue: 3,
                duration: 700,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(scaleAnim, {
                toValue: 0.92,
                duration: 600,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(rotateAnim, {
                toValue: 0,
                duration: 600,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
          ])
        );
        loopRef.current = loop;
        loop.start();
        break;
      }

      // ── AI 说话：节奏扩张 ──
      case SphereState.AI_TALKING: {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.08,
              duration: 250,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1.02,
              duration: 200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1.10,
              duration: 250,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1.04,
              duration: 200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 300,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
        loopRef.current = loop;
        loop.start();
        break;
      }
    }

    return () => stopLoop();
  }, [state]);

  // ── 插值 ──
  const rotateDeg = rotateAnim.interpolate({
    inputRange: [-3, 3],
    outputRange: ['-3deg', '3deg'],
  });

  // 球体主色（深色 → 蓝色）
  const sphereBg = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#222222', '#1a8fe8'],
  });

  // 高光层颜色
  const highlightBg = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(80,80,80,0.25)', 'rgba(232,246,255,0.5)'],
  });

  // 中间层
  const midBg = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(40,40,40,0.6)', 'rgba(96,191,255,0.4)'],
  });

  // 外圈光晕颜色
  const glowBg = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(60,60,60,0.3)', 'rgba(100,200,255,0.35)'],
  });

  // 阴影颜色深度
  const shadowRadius = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 30],
  });

  return (
    <View style={styles.container}>
      {/* 光晕层（用户说话时可见）*/}
      <Animated.View
        style={[
          styles.glowLayer,
          {
            backgroundColor: glowBg,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      {/* 球体主体 */}
      <Animated.View
        style={[
          styles.sphereOuter,
          {
            backgroundColor: sphereBg,
            shadowColor: '#0078ff',
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: shadowRadius,
            shadowOpacity: colorProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.1, 0.35],
            }),
            transform: [
              { scale: scaleAnim },
              { translateY: floatY },
              { rotate: rotateDeg },
            ],
          },
        ]}
      >
        {/* 球体内层 */}
        <View style={styles.sphereInner}>
          {/* 中间渐变模拟层 */}
          <Animated.View
            style={[
              styles.midLayer,
              { backgroundColor: midBg },
            ]}
          />

          {/* 高光（左上角椭圆） */}
          <Animated.View
            style={[
              styles.highlight,
              { backgroundColor: highlightBg },
            ]}
          />

          {/* 底部微光 */}
          <Animated.View
            style={[
              styles.bottomGlow,
              {
                backgroundColor: colorProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['rgba(60,60,60,0.1)', 'rgba(255,255,255,0.08)'],
                }),
              },
            ]}
          />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 9999,
  },
  sphereOuter: {
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    overflow: 'hidden',
    elevation: 12,
  },
  sphereInner: {
    flex: 1,
    position: 'relative',
  },
  midLayer: {
    position: 'absolute',
    top: '20%',
    left: '15%',
    width: '70%',
    height: '60%',
    borderRadius: 9999,
  },
  highlight: {
    position: 'absolute',
    top: '10%',
    left: '18%',
    width: '38%',
    height: '28%',
    borderRadius: 9999,
  },
  bottomGlow: {
    position: 'absolute',
    bottom: '12%',
    right: '18%',
    width: '30%',
    height: '18%',
    borderRadius: 9999,
  },
});
