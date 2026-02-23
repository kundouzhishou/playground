const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '../App.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

let allChecksPassed = true;

function runCheck(name, checkFn) {
  const result = checkFn();
  console.log(`${result ? '✅' : '❌'} ${name}`);
  if (!result) {
    allChecksPassed = false;
  }
  return result;
}

console.log('--- 运行 BDD 验证脚本 ---');

// 检查 1: App.js 中是否包含所有必要的状态
runCheck('包含所有必要的状态', () => {
  const states = ['disconnected', 'connecting', 'idle', 'listening', 'thinking', 'speaking'];
  return states.every(state => appJsContent.includes(`UI_STATE.${state}`));
});

// 检查 2: 是否有麦克风开关逻辑 (handleMicPress 及其内部逻辑)
runCheck('有麦克风开关逻辑', () => {
  return (
    appJsContent.includes('const [micMuted, setMicMuted] = useState(false);') &&
    appJsContent.includes('handleMicPress = useCallback(() => {') &&
    appJsContent.includes('const newMuted = !micMuted;') &&
    appJsContent.includes('setMicMuted(newMuted);')
  );
});

// 检查 3: 是否有 CC 字幕开关逻辑
runCheck('有 CC 字幕开关逻辑', () => {
  return (
    appJsContent.includes('const [ccEnabled, setCcEnabled] = useState(true);') &&
    appJsContent.includes('<CCButton ccEnabled={ccEnabled} onPress={() => setCcEnabled((v) => !v)} />') &&
    appJsContent.includes('{ccEnabled && lastAiText ? (')
  );
});

// 检查 4: 是否有拍照/上传逻辑
runCheck('有拍照/上传逻辑', () => {
  return (
    appJsContent.includes('handleCameraPress = useCallback(() => {') &&
    appJsContent.includes('上传照片') &&
    appJsContent.includes('拍照')
  );
});

// 检查 5: 是否有关闭按钮逻辑
runCheck('有关闭按钮逻辑', () => {
  return (
    appJsContent.includes('handleClosePress = useCallback(() => {') &&
    appJsContent.includes('endConversation();')
  );
});

console.log('--- BDD 验证结果 ---');
if (allChecksPassed) {
  console.log('🎉 所有检查项均通过！');
} else {
  console.log('⚠️ 部分检查项未通过。请检查 App.js 文件。');
  process.exit(1); // 退出并返回错误码
}
