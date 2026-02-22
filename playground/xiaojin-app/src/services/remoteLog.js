/**
 * 远程日志服务（本地内存版）
 * 将 App 端的关键日志存到内存数组，提供 React hook 实时显示
 * 
 * 用法：
 *   import { rlog, getLogs, clearLogs, useRemoteLogs } from './services/remoteLog';
 *   rlog('Whisper', '识别结果:', text);
 */

let _logs = [];
const MAX_LOGS = 50;
let _listeners = new Set();

function _notify() {
  const snapshot = [..._logs];
  _listeners.forEach(fn => fn(snapshot));
}

/**
 * 发送日志（存到内存 + console.log）
 * @param {string} tag - 模块标签（如 'Whisper', 'TTS', 'VAD'）
 * @param  {...any} args - 日志内容
 */
export function rlog(tag, ...args) {
  const msg = `[${tag}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
  console.log(msg);
  const entry = `${new Date().toLocaleTimeString()} ${msg}`;
  _logs.push(entry);
  if (_logs.length > MAX_LOGS) {
    _logs = _logs.slice(-MAX_LOGS);
  }
  _notify();
}

/**
 * 获取所有日志
 * @returns {string[]}
 */
export function getLogs() {
  return [..._logs];
}

/**
 * 清空日志
 */
export function clearLogs() {
  _logs = [];
  _notify();
}

/**
 * React hook：订阅日志变化
 * @returns {string[]} 当前日志数组
 */
export function useRemoteLogs() {
  const { useState, useEffect } = require('react');
  const [logs, setLogs] = useState(() => [..._logs]);

  useEffect(() => {
    const handler = (snapshot) => setLogs(snapshot);
    _listeners.add(handler);
    // 立即同步一次
    handler([..._logs]);
    return () => {
      _listeners.delete(handler);
    };
  }, []);

  return logs;
}

/**
 * 兼容旧 API：initRemoteLog / destroyRemoteLog 现在是空操作
 */
export function initRemoteLog() {}
export function destroyRemoteLog() {
  _logs = [];
  _listeners.clear();
}
