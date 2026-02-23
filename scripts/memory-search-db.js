#!/usr/bin/env node
// 记忆全文搜索脚本：使用 SQLite FTS5 建立索引并搜索

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const WORKSPACE_DIR = path.join(__dirname, '..');
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');
const DB_PATH = path.join(MEMORY_DIR, '.search.db');

// 递归扫描 .md 文件
function scanMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      results.push(...scanMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
      results.push(fullPath);
    }
  }
  return results;
}

// 构建 FTS5 索引
function build() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }

  // 删除旧数据库重建
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  const db = new Database(DB_PATH);

  // 创建 FTS5 虚拟表，使用 unicode61 分词器
  db.exec(`
    CREATE VIRTUAL TABLE memory_fts USING fts5(
      filepath,
      line_num,
      content,
      tokenize='unicode61'
    );
  `);

  const insert = db.prepare('INSERT INTO memory_fts (filepath, line_num, content) VALUES (?, ?, ?)');
  const files = scanMarkdownFiles(MEMORY_DIR);
  // 也把 MEMORY.md 加进来
  const memoryMdPath = path.join(WORKSPACE_DIR, 'MEMORY.md');
  if (fs.existsSync(memoryMdPath)) files.push(memoryMdPath);
  let totalLines = 0;

  const insertMany = db.transaction(() => {
    for (const filePath of files) {
      const relPath = path.relative(MEMORY_DIR, filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // 跳过空行
        insert.run(relPath, i + 1, line);
        totalLines++;
      }
    }
  });

  insertMany();
  db.close();
  console.log(`索引构建完成：${files.length} 个文件，${totalLines} 行`);
}

// 检测是否包含 CJK 字符（中日韩）
function hasCJK(str) {
  return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(str);
}

// 搜索
function search(query) {
  if (!fs.existsSync(DB_PATH)) {
    console.error('搜索数据库不存在，请先运行 build');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  let rows;
  if (hasCJK(query)) {
    // 中文搜索：FTS5 unicode61 对中文分词不佳，用 LIKE 回退
    rows = db.prepare(`
      SELECT filepath, line_num, content as snippet
      FROM memory_fts
      WHERE content LIKE ?
      LIMIT 50
    `).all(`%${query}%`);
  } else {
    // 英文/拉丁文搜索：用 FTS5 全文匹配
    rows = db.prepare(`
      SELECT filepath, line_num, snippet(memory_fts, 2, '>>>', '<<<', '...', 64) as snippet
      FROM memory_fts
      WHERE memory_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `).all(query);
  }

  if (rows.length === 0) {
    console.log(`未找到匹配 "${query}" 的结果`);
  } else {
    console.log(`找到 ${rows.length} 条匹配结果：\n`);
    for (const row of rows) {
      console.log(`  ${row.filepath}:${row.line_num}`);
      console.log(`    ${row.snippet}`);
      console.log();
    }
  }

  db.close();
}

// 主入口
const [,, command, ...args] = process.argv;

switch (command) {
  case 'build':
    build();
    break;
  case 'search':
    if (!args[0]) {
      console.error('用法: memory-search-db.js search "关键词"');
      process.exit(1);
    }
    search(args.join(' '));
    break;
  default:
    console.log('用法:');
    console.log('  node memory-search-db.js build          # 构建索引');
    console.log('  node memory-search-db.js search "关键词"  # 搜索');
    process.exit(1);
}
