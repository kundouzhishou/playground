#!/usr/bin/env node
// 媒体备份 Cron 包装脚本：先更新索引，再同步到 ms1

const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = __dirname;

function run(label, cmd) {
  console.log(`\n--- ${label} ---`);
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 120000 });
    return true;
  } catch (err) {
    console.error(`${label} 失败: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`=== 媒体备份任务开始 [${new Date().toISOString()}] ===`);

  // 第一步：更新媒体索引
  const indexOk = run('更新媒体索引', `node ${path.join(SCRIPTS_DIR, 'media-index.js')}`);

  // 第二步：同步到 ms1（即使索引失败也尝试同步）
  const backupOk = run('同步到 ms1', `bash ${path.join(SCRIPTS_DIR, 'media-backup.sh')}`);

  // 报告
  console.log('\n=== 备份任务报告 ===');
  console.log(`索引更新: ${indexOk ? '✅ 成功' : '❌ 失败'}`);
  console.log(`文件同步: ${backupOk ? '✅ 成功' : '❌ 失败'}`);
  console.log(`完成时间: ${new Date().toISOString()}`);
}

main();
