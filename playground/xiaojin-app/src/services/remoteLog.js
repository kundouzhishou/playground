/**
 * 远程日志服务
 * 将 App 端的关键日志通过 Gateway WebSocket 发回，方便调试
 * 
 * 用法：
 *   import { initRemoteLog, rlog } from './services/remoteLog';
 *   initRemoteLog(wsSend);  // 初始化时传入 ws 发送函数
 *   rlog('Whisper', '识别结果:', text);
 */

let _send = null;
let _buffer = [];
const MAX_BUFFER = 50;

/**
 * 初始化远程日志，传入 WebSocket 发送函数
 */
export function initRemoteLog(sendFn) {
  _send = sendFn;
  // 发送缓冲区中的日志
  if (_buffer.length > 0) {
    _buffer.forEach(msg => _trySend(msg));
    _buffer = [];
  }
}

function _trySend(logMsg) {
  if (!_send) {
    if (_buffer.length < MAX_BUFFER) {
      _buffer.push(logMsg);
    }
    return;
  }
  try {
    _send({
      type: 'req',
      id: `log-${Date.now()}`,
      method: 'chat',
      params: {
        sessionKey: '__device-logs',
        message: {
          role: 'user',
          content: [{ type: 'text', text: `[APP-LOG] ${logMsg}` }],
        },
      },
    });
  } catch (e) {
    // 静默失败，不影响 App 运行
  }
}

/**
 * 发送远程日志
 * @param {string} tag - 模块标签（如 'Whisper', 'TTS', 'VAD'）
 * @param  {...any} args - 日志内容
 */
export function rlog(tag, ...args) {
  const msg = `[${tag}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
  // 同时输出到本地 console
  console.log(msg);
  _trySend(msg);
}

/**
 * 清理
 */
export function destroyRemoteLog() {
  _send = null;
  _buffer = [];
}
