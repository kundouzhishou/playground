/**
 * 音效服务
 * 管理 App 内所有交互音效的预加载和播放
 * 使用 expo-av 播放本地 WAV 文件
 *
 * 音效设计：
 *   start     — 轻柔上升双音"叮"，开始录音
 *   sent      — 短促衰减"咔"，发送消息
 *   received  — 轻柔下降双音，收到回复
 *   end       — 下行三音，结束对话
 *   error     — 低沉短促双音，出错提示
 *   thinking  — 2.5s 极轻柔低频嗡鸣，AI 思考中循环播放
 */

import { Audio } from 'expo-av';

const soundAssets = {
  start:    require('../../assets/sounds/start.wav'),
  received: require('../../assets/sounds/received.wav'),
  sent:     require('../../assets/sounds/sent.wav'),
  thinking: require('../../assets/sounds/thinking.wav'),
  error:    require('../../assets/sounds/error.wav'),
  end:      require('../../assets/sounds/end.wav'),
};

// 音量配置
const volumeConfig = {
  start:    0.65,
  received: 0.60,
  sent:     0.55,
  thinking: 0.40,   // thinking 本身已很轻，再压一点
  error:    0.65,
  end:      0.60,
};

// 已加载的 Sound 实例缓存
const loadedSounds = {};

// thinking 循环播放状态
let thinkingLoopActive = false;
let thinkingLoopTimer = null;

/**
 * 预加载所有音效（App 启动时调用一次）
 */
export async function preloadSounds() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    for (const [name, asset] of Object.entries(soundAssets)) {
      try {
        const { sound } = await Audio.Sound.createAsync(asset, {
          volume: volumeConfig[name] ?? 0.65,
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
 * 播放指定音效（一次性）
 * @param {string} name
 */
export async function playSound(name) {
  // thinking 由专用循环接口控制，不走这里
  if (name === 'thinking') return;
  try {
    const sound = loadedSounds[name];
    if (!sound) {
      console.warn(`[Sound] 未找到音效: ${name}`);
      return;
    }
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (e) {
    console.warn(`[Sound] 播放失败: ${name}`, e.message);
  }
}

/**
 * 开始循环播放 thinking 音效
 * thinking.wav 时长 2.5s，每次播放完后间隔 0.8s 再播下一次
 * 整体音量极轻，营造"思考中"的环境感
 */
export function startThinkingLoop() {
  if (thinkingLoopActive) return;
  thinkingLoopActive = true;

  async function playOnce() {
    if (!thinkingLoopActive) return;
    try {
      const sound = loadedSounds['thinking'];
      if (sound) {
        await sound.setPositionAsync(0);
        await sound.playAsync();
      }
    } catch (e) {
      // 静默失败，不影响主流程
    }
    if (thinkingLoopActive) {
      // 2.5s 播放 + 0.8s 间隔 = 3.3s 一轮
      thinkingLoopTimer = setTimeout(playOnce, 3300);
    }
  }

  playOnce();
}

/**
 * 停止 thinking 循环
 */
export function stopThinkingLoop() {
  thinkingLoopActive = false;
  if (thinkingLoopTimer) {
    clearTimeout(thinkingLoopTimer);
    thinkingLoopTimer = null;
  }
  // 立即停止当前播放
  try {
    const sound = loadedSounds['thinking'];
    if (sound) sound.stopAsync().catch(() => {});
  } catch (_) {}
}

/**
 * 卸载所有音效（App 卸载时调用）
 */
export async function unloadSounds() {
  stopThinkingLoop();
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
