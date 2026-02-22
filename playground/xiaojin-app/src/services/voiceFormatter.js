/**
 * 语音口语化转换服务
 * 使用 GPT-4o-mini 将 Agent 的文字回复转换为适合语音朗读的口语化中文
 * 原始文字仍显示在聊天界面，口语化版本仅用于 TTS 朗读
 */

import { OPENAI_CONFIG } from '../config/apiKeys';

const SYSTEM_PROMPT = '将以下文字转换为适合语音朗读的口语化中文。去掉 emoji、代码块、列表符号、markdown 格式。用自然的口语表达，简洁明了。如果内容包含技术细节或代码，用通俗语言描述。直接输出转换后的文字，不要加任何前缀。';

/**
 * 将文字转换为口语化版本
 * @param {string} text - 原始文字
 * @returns {Promise<string>} 口语化文字
 */
export async function formatForVoice(text) {
  // 短文本或纯文字无需转换
  if (!text || text.length < 10) {
    return text;
  }

  try {
    console.log('[VoiceFormatter] 开始口语化转换，原文长度:', text.length);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_CONFIG.miniModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      console.error('[VoiceFormatter] API 错误:', response.status);
      // 失败时返回原文
      return text;
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim();

    if (!result) {
      console.warn('[VoiceFormatter] 返回为空，使用原文');
      return text;
    }

    console.log('[VoiceFormatter] 转换完成，结果长度:', result.length);
    return result;
  } catch (err) {
    console.error('[VoiceFormatter] 转换失败，使用原文:', err);
    // 失败时 fallback 到原文
    return text;
  }
}
