# SYNC.md - 多工具配置同步指南

> 本项目同时支持 **Kilo**、**Trae** 和 **Claude Code** 三种 CLI/IDE 工具。
> `.kilo/` 是唯一的**数据源（Source of Truth）**，通过 `scripts/sync_config.py` 单向同步到 `.trae/` 和 `.claude/`。

## 目录结构

```
项目根目录/
├── .kilo/                  ← 数据源（只编辑这里）
│   ├── agent/              ← 18 个子代理（Kilo 格式）
│   ├── skill/              ← 3 个技能（SKILL.md）
│   └── styles/             ← 风格库
│
├── .trae/                  ← 自动生成（勿手动编辑）
│   └── skills/             ← 从 .kilo/skill/ 同步
│
├── .claude/                ← 自动生成（勿手动编辑）
│   ├── agents/             ← 从 .kilo/agent/ 同步
│   ├── skills/             ← 从 .kilo/skill/ 同步
│   └── styles/             ← 从 .kilo/styles/ 同步
│
├── AGENTS.md               ← Trae + Kilo 通用入口规则
├── CLAUDE.md               ← Claude Code 入口规则
├── kilo.json               ← Kilo 配置
└── scripts/sync_config.py  ← 同步脚本
```

## 同步方向

```
.kilo/skill/    ──→  .trae/skills/    （路径不变）
.kilo/skill/    ──→  .claude/skills/  （路径替换 .kilo/styles/ → .claude/styles/）
.kilo/agent/    ──→  .claude/agents/  （frontmatter 转回 Claude 格式 + 路径替换）
.kilo/styles/   ──→  .claude/styles/  （直接复制）
```

## 使用方法

```bash
# 完整同步（推荐每次修改后执行）
python scripts/sync_config.py

# 预览模式（不写入文件，查看会同步哪些内容）
python scripts/sync_config.py --dry-run

# 只同步某一部分
python scripts/sync_config.py --skills
python scripts/sync_config.py --agents
python scripts/sync_config.py --styles
```

## 格式差异

### Agents frontmatter 对比

**Kilo 格式**（`.kilo/agent/*.md`）：
```yaml
---
description: 写作执行专家。根据所有前序准备材料执行写作。
mode: subagent
hidden: false
---
```

**Claude Code 格式**（`.claude/agents/*.md`）：
```yaml
---
name: writing-executor
description: 写作执行专家。根据所有前序准备材料执行写作。
tools: Read, Write, Bash, Glob, Grep
model: sonnet
---
```

同步脚本会自动完成格式转换。

### Skills（两边兼容）

Kilo 和 Trae 的 Skills 格式一致，都是：
```
skill-name/
└── SKILL.md    ← YAML frontmatter (name + description) + Markdown 正文
```

无需转换，直接复制。

## 维护流程

1. **编辑 `.kilo/` 下的文件**（唯一数据源）
2. **运行 `python scripts/sync_config.py`**
3. **提交 Git**（同步后的所有目录一起提交）

```bash
# 典型工作流
vim .kilo/agent/writing-executor.md   # 编辑
python scripts/sync_config.py          # 同步
git add -A && git commit -m "update"   # 提交
```

## 注意事项

- `.trae/` 和 `.claude/` 下的文件由脚本自动生成，**不要手动编辑**，否则下次同步会被覆盖
- 新增 agent/skill/style 时，先在 `.kilo/` 下创建，再运行同步
- 风格库文件（`.kilo/styles/`）中的路径引用不需要替换，三端共用同一份内容
