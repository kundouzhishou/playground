/**
 * 音效服务
 * 管理 App 内所有交互音效的预加载和播放
 * 使用 expo-av 播放本地 WAV 文件
 */

import { Audio } from 'expo-av';

// 音效资源映射
const soundAssets = {
  start: require('../../assets/sounds/start.wav'),
  received: require('../../assets/sounds/received.wav'),
  sent: require('../../assets/sounds/sent.wav'),
  thinking: require('../../assets/sounds/thinking.wav'),
  error: require('../../assets/sounds/error.wav'),
  end: require('../../assets/sounds/end.wav'),
};

// 音量配置：thinking 极轻，其他正常
const volumeConfig = {
  start: 0.7,
  received: 0.7,
  sent: 0.7,
  thinking: 0.3,
  error: 0.7,
  end: 0.7,
};

// 已加载的 Sound 实例缓存
const loadedSounds = {};

/**
 * 预加载所有音效（App 启动时调用一次）
 */
export async function preloadSounds() {
  try {
    // 设置音频模式：允许与其他音频混合播放
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    for (const [name, asset] of Object.entries(soundAssets)) {
      try {
        const { sound } = await Audio.Sound.createAsync(asset, {
          volume: volumeConfig[name] || 0.7,
        });
        loadedSounds[name] = sound;
        console.log(`[Sound] 预加载成功: ${name}`);
      } catch (e) {
        console.warn(`[Sound] 预加载失败: ${name}`, e.message);
      }
    }
    console.log('[Sound] 所有音效预加载完成');
  } catch (e) {
    console.error('[Sound] 音频模式设置失败:', e);
  }
}

/**
 * 播放指定音效
 * @param {string} name - 音效名称 (start/received/sent/thinking/error/end)
 */
export async function playSound(name) {
  try {
    const sound = loadedSounds[name];
    if (!sound) {
      console.warn(`[Sound] 未找到音效: ${name}`);
      return;
    }
    // 重置到开头再播放（允许快速重复播放）
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (e) {
    console.warn(`[Sound] 播放失败: ${name}`, e.message);
  }
}

/**
 * 卸载所有音效（App 卸载时调用）
 */
export async function unloadSounds() {
  for (const [name, sound] of Object.entries(loadedSounds)) {
    try {
      await sound.unloadAsync();
      delete loadedSounds[name];
    } catch (e) {
      console.warn(`[Sound] 卸载失败: ${name}`, e.message);
    }
  }
  console.log('[Sound] 所有音效已卸载');
}
