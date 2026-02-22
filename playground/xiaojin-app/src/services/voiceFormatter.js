/**
 * 语音口语化转换服务
 * 
 * TODO: 口语化转换暂时禁用，因为 OpenAI API key 不可用（429 错误）。
 * 当 OpenAI API 恢复后，可以取消下方注释恢复 GPT-4o-mini 口语化转换功能。
 * 当前直接返回原文。
 */

// import { OPENAI_CONFIG } from '../config/apiKeys';

// const SYSTEM_PROMPT = '将以下文字转换为适合语音朗读的口语化中文。去掉 emoji、代码块、列表符号、markdown 格式。用自然的口语表达，简洁明了。如果内容包含技术细节或代码，用通俗语言描述。直接输出转换后的文字，不要加任何前缀。';

/**
 * 将文字转换为口语化版本
 * 
 * 当前：直接返回原文（OpenAI API 暂不可用）
 * 恢复方法：取消上方 import 和 SYSTEM_PROMPT 的注释，并恢复下方函数体中的 API 调用逻辑
 * 
 * @param {string} text - 原始文字
 * @returns {Promise<string>} 口语化文字（当前直接返回原文）
 */
export async function formatForVoice(text) {
  // 暂时跳过口语化转换，直接返回原文
  // TODO: OpenAI API 恢复后，恢复以下逻辑：
  // 1. 取消顶部 import { OPENAI_CONFIG } 和 SYSTEM_PROMPT 的注释
  // 2. 用以下代码替换 return text:
  /*
  if (!text || text.length < 10) return text;
  try {
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
    if (!response.ok) return text;
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || text;
  } catch (err) {
    return text;
  }
  */
  return text;
}
