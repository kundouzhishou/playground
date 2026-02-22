/**
 * 音效生成脚本
 * 生成简单的正弦波 WAV 文件用于 App 音效反馈
 * 
 * 运行方式：node scripts/generate-sounds.js
 * 输出目录：assets/sounds/
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

/**
 * 生成单频正弦波 WAV 文件
 * @param {number} frequency - 频率 (Hz)
 * @param {number} durationMs - 时长 (毫秒)
 * @param {number} volume - 音量 (0-1)
 * @param {number} fadeMs - 淡入淡出时长 (毫秒)
 * @returns {Buffer} WAV 文件 buffer
 */
function generateWav(frequency, durationMs, volume = 0.5, fadeMs = 20) {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // WAV 文件头
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);       // fmt chunk 大小
  buffer.writeUInt16LE(1, 20);        // PCM 格式
  buffer.writeUInt16LE(1, 22);        // 单声道
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // 字节率
  buffer.writeUInt16LE(2, 32);        // 块对齐
  buffer.writeUInt16LE(16, 34);       // 位深度
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  const fadeSamples = Math.floor(sampleRate * fadeMs / 1000);
  for (let i = 0; i < numSamples; i++) {
    let amp = volume;
    // 淡入
    if (i < fadeSamples) amp *= i / fadeSamples;
    // 淡出
    if (i > numSamples - fadeSamples) amp *= (numSamples - i) / fadeSamples;
    const sample = Math.floor(
      Math.sin(2 * Math.PI * frequency * i / sampleRate) * amp * 32767
    );
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

/**
 * 生成双频混合 WAV（用于错误音效）
 * @param {number} freq1 - 第一个频率
 * @param {number} freq2 - 第二个频率
 * @param {number} durationMs - 时长
 * @param {number} volume - 音量
 * @param {number} fadeMs - 淡入淡出
 * @returns {Buffer}
 */
function generateDualToneWav(freq1, freq2, durationMs, volume = 0.5, fadeMs = 20) {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // WAV 文件头（同上）
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  const fadeSamples = Math.floor(sampleRate * fadeMs / 1000);
  for (let i = 0; i < numSamples; i++) {
    let amp = volume;
    if (i < fadeSamples) amp *= i / fadeSamples;
    if (i > numSamples - fadeSamples) amp *= (numSamples - i) / fadeSamples;
    // 两个频率混合，各占一半振幅
    const s1 = Math.sin(2 * Math.PI * freq1 * i / sampleRate);
    const s2 = Math.sin(2 * Math.PI * freq2 * i / sampleRate);
    const sample = Math.floor((s1 * 0.5 + s2 * 0.5) * amp * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 音效定义
const soundDefs = [
  { name: 'start',    desc: '开始录音 — 叮（高频短促）',   gen: () => generateWav(880, 150, 0.5, 20) },
  { name: 'received', desc: '收到一句 — 嘟（中频短促）',   gen: () => generateWav(440, 100, 0.4, 15) },
  { name: 'sent',     desc: '发送消息 — 咚（低频短促）',   gen: () => generateWav(220, 200, 0.5, 30) },
  { name: 'thinking', desc: '思考脉冲 — 极轻提示',        gen: () => generateWav(660, 50, 0.2, 10) },
  { name: 'error',    desc: '错误提示 — 双音',            gen: () => generateDualToneWav(330, 220, 300, 0.5, 25) },
  { name: 'end',      desc: '结束对话 — 下行音调',        gen: () => {
    // 结束音：两段音阶下行  660Hz 100ms + 440Hz 150ms
    const part1 = generateWav(660, 100, 0.4, 15);
    const part2 = generateWav(440, 150, 0.4, 15);
    // 拼接两段的 PCM 数据
    const sampleRate = 22050;
    const n1 = Math.floor(sampleRate * 100 / 1000);
    const n2 = Math.floor(sampleRate * 150 / 1000);
    const total = n1 + n2;
    const buf = Buffer.alloc(44 + total * 2);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + total * 2, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(total * 2, 40);
    // 复制 PCM 数据（跳过 44 字节头）
    part1.copy(buf, 44, 44, 44 + n1 * 2);
    part2.copy(buf, 44 + n1 * 2, 44, 44 + n2 * 2);
    return buf;
  }},
];

// 生成所有音效
console.log('开始生成音效文件...');
console.log(`输出目录: ${OUTPUT_DIR}\n`);

for (const def of soundDefs) {
  const wavData = def.gen();
  const filePath = path.join(OUTPUT_DIR, `${def.name}.wav`);
  fs.writeFileSync(filePath, wavData);
  console.log(`✓ ${def.name}.wav (${wavData.length} bytes) — ${def.desc}`);
}

console.log('\n所有音效文件生成完成！');
