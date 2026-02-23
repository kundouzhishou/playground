#!/usr/bin/env python3
"""
从历史会话 JSONL 文件提取有价值的对话内容，写入记忆文件。
使用流式读取，不一次性加载大文件。
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

SESSIONS_DIR = Path.home() / ".openclaw/agents/main/sessions"
MEMORY_DIR = Path.home() / "openclaw/workspace/memory"
MEMORY_FILE = Path.home() / "openclaw/workspace/MEMORY.md"

# 目标用户 ID
TARGET_SENDER = "271939480"

# 已知的 MEMORY.md 中已记录的关键词（用于粗略去重）
KNOWN_TOPICS = {
    "狗搭", "gouda", "polymarket", "小金语音", "expo", "eas build",
    "elevenlabs", "cloudflare tunnel", "记忆系统", "bdd",
    "ms1", "ms2", "tailscale", "discord", "telegram",
    "model x", "小红书", "github pages", "playground",
    "chris", "jessica", "老金模式", "expo go", "ota",
    "tweetnacl", "whisper", "vad", "openai",
}

def parse_timestamp(ts_str):
    """解析 ISO 时间戳，返回 (date_str, hour)"""
    try:
        dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
        # 转换为东八区
        from datetime import timedelta
        dt_cst = dt + timedelta(hours=8)
        return dt_cst.strftime('%Y-%m-%d'), dt_cst.strftime('%H:%M')
    except:
        return None, None

def extract_text_content(content_field):
    """从 content 字段提取纯文本"""
    if isinstance(content_field, str):
        return content_field.strip()
    if isinstance(content_field, list):
        texts = []
        for item in content_field:
            if isinstance(item, dict):
                if item.get('type') == 'text':
                    texts.append(item.get('text', '').strip())
                # 过滤掉 tool_use, tool_result, image 等
                elif item.get('type') in ('tool_code', 'tool_result', 'image_file'):
                    continue
                # 其他类型，如 tool_use 的 input，也尽量提取
                elif item.get('type') == 'tool_use' and isinstance(item.get('input'), str):
                    texts.append(item['input'].strip())
        return '\n'.join(texts)
    return ''

def is_sensitive(text):
    """检查是否包含敏感信息"""
    sensitive_patterns = ['api_key', 'apikey', 'password', 'secret', 'token', 'credential',
                          'sk-', 'pk-', 'eyJ', 'Bearer ']
    text_lower = text.lower()
    for pattern in sensitive_patterns:
        if pattern.lower() in text_lower and len(text) < 500:
            # 只对短文本报警，长文本可能只是讨论
            return True
    return False

def truncate(text, max_len=500):
    """截断过长文本"""
    if len(text) <= max_len:
        return text
    return text[:max_len] + '...'

def process_session_file(filepath):
    """流式处理单个 JSONL 文件，返回按日期分组的对话列表"""
    conversations_by_date = defaultdict(list)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                
                rec_type = record.get('type')
                
                # 只处理 message 类型
                if rec_type != 'message':
                    continue
                
                role = record.get('message', {}).get('role') # message 字段下的 role
                if not role: # 如果 message.role 不存在，尝试顶层 role
                    role = record.get('role')
                
                timestamp = record.get('timestamp', '')
                
                # 只要用户消息和 assistant 消息
                if role not in ('user', 'assistant'):
                    continue
                
                # 提取发送者
                sender = record.get('sender')
                if not sender:
                    metadata = record.get('metadata', {})
                    if isinstance(metadata, dict):
                        sender = metadata.get('sender')
                
                # 过滤：用户消息只保留目标发送者的
                if role == 'user':
                    if sender and sender != TARGET_SENDER:
                        continue
                
                # 提取文本内容
                content_field = record.get('message', {}).get('content') # message 字段下的 content
                if not content_field: # 如果 message.content 不存在，尝试顶层 content
                    content_field = record.get('content', '')
                
                text = extract_text_content(content_field)
                
                # 过滤掉空内容、纯 tool call 输出
                if not text or len(text) < 5:
                    continue
                
                # 过滤 Conversation info metadata 前缀
                if text.startswith('Conversation info (untrusted metadata):'):
                    # 尝试解析后面的 JSON 并提取实际的消息
                    import re
                    match = re.search(r'```json\s*(\{.*?\})\s*```\s*(.*)', text, re.DOTALL)
                    if match:
                        json_str = match.group(1)
                        actual_msg = match.group(2).strip()
                        try:
                            # metadata_json = json.loads(json_str) # 暂时不用
                            if actual_msg:
                                text = actual_msg
                            else: # 如果没有实际消息，可能是纯 metadata
                                continue
                        except json.JSONDecodeError:
                            pass # 解析失败，继续用原始text
                    else: # 如果没有匹配到 ```json 块，尝试其他过滤
                         # 移除 "Conversation info (untrusted metadata)" 这一行
                        lines = text.split('\n')
                        if len(lines) > 0 and lines[0].startswith('Conversation info (untrusted metadata):'):
                            text = '\n'.join(lines[1:]).strip()
                            if not text or len(text) < 3:
                                continue
                
                date_str, time_str = parse_timestamp(timestamp)
                if not date_str:
                    continue
                
                conversations_by_date[date_str].append({
                    'role': role,
                    'time': time_str,
                    'text': text,
                    'session': filepath.stem[:8] # session id 的前8位
                })
    
    except Exception as e:
        print(f"  错误处理文件 {filepath.name}: {e}", file=sys.stderr)
    
    return conversations_by_date

def summarize_conversations(convs, date_str):
    """从对话列表中提取关键信息"""
    if not convs:
        return None
    
    # 按时间排序
    convs.sort(key=lambda x: x.get('time', ''))
    
    # 提取用户消息（老金说的话）
    user_msgs = [c for c in convs if c['role'] == 'user']
    asst_msgs = [c for c in convs if c['role'] == 'assistant']
    
    if not user_msgs and not asst_msgs:
        return None
    
    # 生成摘要
    lines = []
    
    # 关键词提取：找出讨论的主题
    all_text = ' '.join([c['text'] for c in convs[:100]])  # 只看前100条
    
    topics_mentioned = []
    topic_keywords = {
        '小金语音App': ['语音', 'voice', 'expo', 'ipa', 'app', '闪退', '构建', '声音', 'whisper', 'tts', 'vad', 'openai'],
        'Polymarket交易': ['polymarket', 'market', '预测市场', '交易'],
        '狗搭宠物社交': ['gouda', '狗搭', '宠物', 'pet'],
        '记忆系统': ['记忆', 'memory', 'memori', 'extract', 'sqlite', 'index'],
        'EAS构建': ['eas', 'build', '构建', 'ipa'],
        'ElevenLabs': ['elevenlabs', 'tts', '声音克隆', '克隆'],
        '小红书': ['小红书', 'xhs', 'mcp'],
        'Cloudflare': ['cloudflare', 'tunnel', 'gw.web3hunter'],
        '服务器': ['ms1', 'ms2', 'server', 'ssh'],
        'GitHub': ['github', 'git', 'commit', 'push', 'repo', 'pages'],
        '日常/心情': ['开车', '杭州', '温州', 'model x', '忙', '累', '早上'],
    }
    
    all_text_lower = all_text.lower()
    for topic, keywords in topic_keywords.items():
        if any(kw.lower() in all_text_lower for kw in keywords):
            topics_mentioned.append(topic)
    
    return {
        'date': date_str,
        'user_msg_count': len(user_msgs),
        'asst_msg_count': len(asst_msgs),
        'topics': topics_mentioned,
        'conversations': convs
    }

def format_key_exchanges(convs, max_exchanges=15):
    """格式化关键对话交互"""
    lines = []
    
    # 找出有价值的对话对
    i = 0
    exchange_count = 0
    
    while i < len(convs) and exchange_count < max_exchanges:
        c = convs[i]
        
        if c['role'] == 'user':
            text = c['text']
            # 跳过太短的消息
            if len(text) < 3:
                i += 1
                continue
            
            # 跳过纯表情或单字
            if text.strip() in ('?', '!', '嗯', '好', '哦', '啊', '是', '对', '行', '可以', '好的', '谢谢', '了解'):
                i += 1
                continue
            
            user_line = f"**老金 {c['time']}**({c['session']}): {truncate(text, 300)}"
            
            # 找下一条 assistant 回复
            asst_reply = None
            for j in range(i+1, min(i+4, len(convs))): # 最多看后面3条
                if convs[j]['role'] == 'assistant':
                    asst_text = convs[j]['text']
                    if len(asst_text) > 20: # 小于20字的助理回复可能无意义
                        asst_reply = f"**小金 {convs[j]['time']}**({convs[j]['session']}): {truncate(asst_text, 400)}"
                    break
            
            if asst_reply:
                lines.append(user_line)
                lines.append(asst_reply)
                lines.append('')
                exchange_count += 1
        
        i += 1
    
    return lines

def extract_decisions_and_todos(convs):
    """提取决策和待办事项"""
    decisions = []
    todos = []
    
    decision_keywords = ['决定', '选择', '确认', '方案', '策略', '改为', '换成', '配置', '已设置', '已完成']
    todo_keywords = ['待办', '下一步', '需要', '记得', '别忘', 'todo', '计划', '解决', '检查']
    
    for c in convs:
        text = c['text']
        text_lower = text.lower()
        
        # 决策关键词
        if c['role'] == 'assistant': # 助理的回复中更容易包含决策
            for kw in decision_keywords:
                if kw in text and len(text) > 50:
                    snippet = text[:200].replace('\n', ' ')
                    if snippet not in decisions:
                        decisions.append(f"- [{c['time']}] {snippet}")
                    break
        
        # 待办
        for kw in todo_keywords:
            if kw in text_lower and len(text) > 20:
                snippet = text[:150].replace('\n', ' ')
                if snippet not in todos:
                    todos.append(f"- [{c['time']}] {snippet}")
                break
    
    return decisions[:5], todos[:5]

def load_existing_memory_content(filepath):
    """加载已有的记忆文件内容，用于去重"""
    if not filepath.exists():
        return ""
    return filepath.read_text(encoding='utf-8')

def main():
    print("=== 开始从历史会话提取记忆 ===\n")
    
    # 获取所有 JSONL 文件
    session_files = list(SESSIONS_DIR.glob('*.jsonl'))
    session_files.sort(key=lambda f: f.stat().st_mtime)
    
    print(f"找到 {len(session_files)} 个 JSONL 文件\n")
    
    # 按日期汇总所有对话
    all_by_date = defaultdict(list)
    
    for filepath in session_files:
        # 跳过太小的文件（< 2KB）
        if filepath.stat().st_size < 2000 and "main" not in filepath.name: # 主会话即使小也要处理
            continue
        
        size_kb = filepath.stat().st_size / 1024
        print(f"处理: {filepath.name} ({size_kb:.0f}KB)")
        
        by_date = process_session_file(filepath)
        
        for date, convs in by_date.items():
            all_by_date[date].extend(convs)
    
    print(f"\n共提取到 {len(all_by_date)} 个不同日期的对话\n")
    
    # 为每个日期生成记忆文件
    MEMORY_DIR.mkdir(exist_ok=True)
    
    dates_processed = []
    
    for date_str in sorted(all_by_date.keys()):
        convs = all_by_date[date_str]
        
        if not convs:
            continue
        
        summary = summarize_conversations(convs, date_str)
        if not summary:
            continue
        
        memory_file = MEMORY_DIR / f"{date_str}.md"
        
        # 生成内容
        new_content_segment = generate_memory_content(date_str, summary)
        
        if not new_content_segment:
            continue
        
        existing_content = load_existing_memory_content(memory_file)
        
        # 检查是否已经包含此日期从历史提取的内容
        if f"<!-- history-extracted -->" in existing_content:
            print(f"  {date_str}: 记忆文件已存在且包含历史提取内容，跳过。")
            continue
        
        # 将新内容追加到文件
        with open(memory_file, 'a', encoding='utf-8') as f:
            if existing_content and not existing_content.endswith('\n'):
                f.write('\n') # 确保换行
            if existing_content:
                f.write('\n') # 在已有内容和新内容之间加空行
            f.write(new_content_segment)
        
        print(f"  {date_str}: 更新/创建记忆文件")
        dates_processed.append(date_str)
    
    print(f"\n=== 完成 ===")
    print(f"处理了 {len(dates_processed)} 个日期: {', '.join(dates_processed)}")
    
    return dates_processed

def generate_memory_content(date_str, summary):
    """生成记忆文件内容"""
    lines = []
    
    convs = summary['conversations']
    topics = summary['topics']
    
    if not convs:
        return None
    
    lines.append(f"<!-- history-extracted -->")
    lines.append(f"## 历史对话提取（{date_str}）")
    lines.append(f"")
    
    if topics:
        lines.append(f"**主要话题**: {', '.join(topics)}")
        lines.append(f"")
    
    lines.append(f"**消息数**: 老金 {summary['user_msg_count']} 条，小金 {summary['asst_msg_count']} 条")
    lines.append(f"")
    
    # 关键对话
    key_exchanges = format_key_exchanges(convs)
    
    if key_exchanges:
        lines.append("### 关键对话")
        lines.extend(key_exchanges)
    
    # 决策和待办
    decisions, todos = extract_decisions_and_todos(convs)
    
    if decisions:
        lines.append("### 重要决策")
        lines.extend(decisions)
        lines.append("")
    
    if todos:
        lines.append("### 待办事项")
        lines.extend(todos)
        lines.append("")
    
    return '\n'.join(lines)

if __name__ == '__main__':
    dates = main()
    sys.exit(0)
