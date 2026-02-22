#!/usr/bin/env node
// 记忆索引脚本：扫描 memory/ 下所有 .md 文件，生成 _index.json

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', 'memory');

// 递归扫描目录下所有 .md 文件
function scanMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 跳过隐藏目录和 node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      results.push(...scanMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
      results.push(fullPath);
    }
  }
  return results;
}

// 从 .md 文件提取元信息
function extractMeta(filePath) {
  const stat = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // 提取第一个 # 标题
  let title = '';
  for (const line of lines) {
    const match = line.match(/^#+\s+(.+)/);
    if (match) {
      title = match[1].trim();
      break;
    }
  }

  // 前 200 字摘要（去掉标题行和空行）
  const textLines = lines.filter(l => !l.match(/^#+\s/) && l.trim());
  const summary = textLines.join(' ').slice(0, 200).trim();

  return {
    file: path.basename(filePath),
    path: path.relative(MEMORY_DIR, filePath),
    title,
    modified: stat.mtime.toISOString(),
    size: stat.size,
    summary,
  };
}

function main() {
  // 确保 memory 目录存在
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    console.log('创建 memory/ 目录');
  }

  const allFiles = scanMarkdownFiles(MEMORY_DIR);
  const allMeta = allFiles.map(extractMeta);

  // 按目录分组
  const byDir = {};
  for (const meta of allMeta) {
    const dir = path.dirname(meta.path) || '.';
    if (!byDir[dir]) byDir[dir] = [];
    byDir[dir].push(meta);
  }

  // 为每个子目录生成 _index.json
  for (const [dir, entries] of Object.entries(byDir)) {
    if (dir === '.') continue; // 根目录单独处理
    const indexPath = path.join(MEMORY_DIR, dir, '_index.json');
    fs.writeFileSync(indexPath, JSON.stringify(entries, null, 2), 'utf-8');
    console.log(`已更新 ${path.relative(MEMORY_DIR, indexPath)}（${entries.length} 个文件）`);
  }

  // 生成根级 _index.json（汇总所有文件）
  const rootIndex = {
    updated: new Date().toISOString(),
    totalFiles: allMeta.length,
    files: allMeta,
  };
  const rootIndexPath = path.join(MEMORY_DIR, '_index.json');
  fs.writeFileSync(rootIndexPath, JSON.stringify(rootIndex, null, 2), 'utf-8');
  console.log(`已更新 memory/_index.json（共 ${allMeta.length} 个文件）`);
}

main();
