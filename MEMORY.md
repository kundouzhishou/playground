# MEMORY.md - 长期记忆

> 这是小金的长期记忆文件。详细记忆存储在 memory/ 子目录中。

## 记忆系统

采用 L0/L1/L2 分层加载策略（借鉴 OpenViking 思路）：
- **L0（始终加载）**: SOUL.md, USER.md, MEMORY.md
- **L1（索引加载）**: memory/*/_index.json — 知道有什么
- **L2（按需加载）**: memory/**/*.md — 需要时加载具体文件

### 记忆目录结构
```
memory/
├── projects/        # 项目相关
├── decisions/       # 重要决策
├── preferences/     # 用户偏好
├── people/          # 人物信息
├── conversations/   # 对话摘要和存档
│   ├── summaries/   # 压缩版摘要
│   └── raw/         # 完整对话存档
└── .search.db       # SQLite FTS5 搜索索引
```

### 工具
- `scripts/memory-index.js` — 更新 _index.json 索引
- `scripts/memory-search-db.js` — SQLite 全文搜索（build/search）
- Cron: Memory Extract — 每 4 小时自动更新索引

## 关键记忆摘要

### 老金
- 东八区，中文沟通，务实开发者
- 想建立个人影响力
- 项目：狗大(Gouda)宠物社交、Polymarket 跟踪交易
- 偏好：Twitter 是最好的 AI 信息源，不喜欢废话
- 开发规范：遵循 BDD（行为驱动开发），先写行为描述再实现
- iOS 构建：只用 production profile，不要给 development build
- 教训：派 subagent 写代码前必须先确认接口协议，不能让它猜；写完必须测试再构建
- 教训：EAS 构建从 git 拉代码，subagent 写完代码后必须 commit + push，构建前要验证 git status 干净且 commit 正确
- 教训：主线程不要写代码！严格遵守调度原则，代码修改/OTA推送全交给 subagent，主线程只负责沟通和审核
- 推送预览/文档给老金时，放到 voice.web3hunter.org 上给网页链接，不要给文件路径
- 影响源：张咋啦 Zara (learn/build in public)、郭宇 guoyu.eth (build company as a product)
- 想在小红书做内容，还没开始

### 自主性边界
- 不涉及安全性或项目重要改动的事情，自主完成，不需要问
- 拿不准的再询问
- Skill 安装方式：`/plugin marketplace add <author/name>` → `/plugin install <name>`（不要 git clone）

### 服务器
- ms1 (Mac Pro): macOS 11.4, Xcode 12.5, 不能再升级系统，无法本地编译新版 iOS App
- ms2 (老 Mac): Linux, 运行 OpenClaw
- ms1 局域网 IP: 192.168.10.223, 用户: jayson
- ms2 局域网 IP: 192.168.10.167, 用户: jayson
- Tailscale VPN (Tailnet: kundouzhishou@gmail.com):
  - ms1: 100.82.248.39 (macOS)
  - ms2: 100.100.159.39 (Linux)
  - 用途：跨网络 SSH 访问，手机远程管理服务器，IP 固定不变
- Apple Team ID: 292Q7R3PT3 (Jin suiyong, Individual)
- Expo 账号: notjayson, Token 存在 ~/.openclaw/credentials/expo-token
- EAS Build 额度：$45/月，每次 iOS 构建 $2，不用太省

### 已配置服务
- Discord AI 日报推送 → #ai-news 频道，每天 9:00 UTC+8
- Discord 小金行动日志频道 (ID: 1474442017349042466)
- Discord Guild ID: 1474293829334208545
- Telegram bot 已连接（名称：小金）
- WhatsApp 已禁用（2026-02-20）
- 加密备份：age 加密 → .backup/xiaojin-full.tar.gz.age，密钥在老金 1Password
- GitHub Pages: https://kundouzhishou.github.io/playground/
- Playground repo: github.com/kundouzhishou/playground (public)

### 重要决策
- 2026-02-20: 记忆系统选择自建轻量版（借鉴 OpenViking，不直接用）

---

*详细信息请查看 memory/ 子目录中的对应文件。*
*使用 `node scripts/memory-search-db.js search "关键词"` 搜索记忆。*
