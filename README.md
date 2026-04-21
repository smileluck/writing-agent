# 写稿Agent v0.7.7

> 🚀 一个基于 Skills + Subagents 的全栈写作系统。
> 兼容 **Claude Code** / **Kilo** / **Trae** 三种 CLI/IDE 工具。
> 
> **不仅是写作，更是打磨进化：**
> *   🧠 **自进化架构**：首次引入采样编译闭环，能记住修改偏好并复用，越用越顺手。
> *   🤖 **反AI味写作**：从选题到初稿，源头遏制 AI 腔调。
> *   🧬 **深度 Humanizer**：注入人类观点、细节与灵魂，彻底去除机器味。
> *   🎨 **文章配图师**：自动设计视觉风格，生成并植入高质量配图。
> *   📺 **真实读者模拟**：模拟真实用户的"心理弹幕"与"朋友圈转发"，只为了检验传播力。
> 
> **支持 DeepSeek / 智谱GLM / MiniMax 等多种国产大模型**，兼容 OpenAI/Gemini 接口，成本极低（使用包月套餐几可忽略不计）。
> 
> 从选题生成、风格建模、写作执行到发布评审与配图，提供完整的 AI 写作工作流。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-v0.7.6-blue.svg)](https://github.com/dongbeixiaohuo/writing-agent/releases)
[![Claude Code](https://img.shields.io/badge/Claude-Code-blue)](https://code.claude.com)
[![Kilo](https://img.shields.io/badge/Kilo-CLI-green)](https://kilo.ai)
[![Trae](https://img.shields.io/badge/Trae-IDE-orange)](https://trae.cn)
[![Desktop App](https://img.shields.io/badge/Desktop%20App-Windows%20Preview-2f6f4f)](https://github.com/dongbeixiaohuo/writing-agent/releases/tag/app-preview-0.1.0)
[![Writing Workflow](https://img.shields.io/badge/Writing%20Workflow-Stage%20Driven-1f6feb)](https://github.com/dongbeixiaohuo/writing-agent)


你拿到的不只是文章，更是一套能反复复用、能中断继续、能回头复盘的写作生产线。

它适合这几类人：
- 想写长文、观点文、公众号文章，不想再靠一把梭 prompt 碰运气
- 想让 AI 写作过程可中断、可修改、可复盘
- 不只想拿到一篇文，而是想把写作变成稳定、可控、可积累的工作流


### 多工具兼容

本项目同时支持以下工具，配置文件自动同步：

| 工具 | 配置目录 | 状态 |
|------|---------|------|
| **Claude Code** | `.claude/` | 原生支持 |
| **Kilo** | `.kilo/` | 原生支持（数据源） |
| **Trae** | `.trae/` | 自动同步 |

- `.kilo/` 是唯一数据源，修改后运行 `python scripts/sync_config.py` 自动同步到其他目录
- 详见 [SYNC.md](SYNC.md)

### v0.7.6 深化生产骨架 (阶段2重构) ⭐ New
- 🩸 **微观伤疤打捞器 (`research-expert`)**：放弃宏观大道理，定向打捞“致命场景”、“隐秘代价”与“反常识潜规则”，输出 `02_scar_tissue.md`。
- 💸 **社交印象管理 (`empathy-designer`)**：升维共情点为“社交转发动机”（印象管理假说），构建带有强社交货币属性的 `04_share_map.md`。
- 🏁 **极道开头赛马场 (`opening-tournament`)**：新增 Stage 5.8 环节，强制并行生成 3 款差异化前缀（暴击/撕裂/冷眼），由用户选出最优开局。

当前实测可用模型：

- `DeepSeek-V3.2`：默认推荐，最适合低成本先把完整流程跑明白
- `智谱 GLM`：已实测，不分伯仲
- `MiniMax`：已实测，不分伯仲

---

## 桌面预览版

现在可以直接下载 `Writing Agent App` 的 Windows 预览版：

- [下载 Writing Agent App 预览版 0.1.0](https://github.com/dongbeixiaohuo/writing-agent/releases/download/app-preview-0.1.0/Writing.Agent.App_0.1.0_x64-setup.exe)

桌面应用源码位于：

- `writing-agent-app/`

如果你只想直接使用桌面应用，优先下载上面的安装包。  
如果你想查看或参与源码开发，可以直接看仓库里的 `writing-agent-app/` 目录。

---

## 快速入口

- 下载桌面应用：[桌面预览版](#桌面预览版)
- 先看完整样本：[老板的AI战略骗局 Demo](#完整-demo老板的ai战略骗局)
- 再看当前版本：[最新更新](#最新更新)
- 先判断模型成本：[模型与 Coding Plan](#模型与-coding-plan)
- 想直接部署：[完整版安装](#完整版安装)
- 想按新手路径一步步装：[给新手的完整安装与使用说明](#给新手的完整安装与使用说明)

---

## 先看一个完整样本

如果你只想先判断这个仓库值不值得收藏，不要先看安装，先看这个真实样本：

[`demo/老板的AI战略骗局/`](demo/老板的AI战略骗局/)

这不是只放一篇成品，而是把整条写作链路都放出来了，包括：

- 选题和约束：[01_theme.md](demo/老板的AI战略骗局/01_theme.md)
- 观点定牙齿：[01b_position.md](demo/老板的AI战略骗局/01b_position.md)
- 伤疤和代价：[02_scar_tissue.md](demo/老板的AI战略骗局/02_scar_tissue.md)
- 结构和开头：[03_outline.md](demo/老板的AI战略骗局/03_outline.md)、[05c_opening_hook.md](demo/老板的AI战略骗局/05c_opening_hook.md)
- 草稿迭代：[draft_v1.md](demo/老板的AI战略骗局/draft_v1.md)、[draft_v2.md](demo/老板的AI战略骗局/draft_v2.md)
- 审稿和传播测试：[pre_publish_review.md](demo/老板的AI战略骗局/pre_publish_review.md)、[wechat_reader_test.md](demo/老板的AI战略骗局/wechat_reader_test.md)
- 最终发布稿：[humanized_final_clean.txt](demo/老板的AI战略骗局/humanized_final_clean.txt)
- 运行态记录：[run_manifest.json](demo/老板的AI战略骗局/run_manifest.json)

```
.kilo/                          ← 唯一数据源（同步到 .claude/ 和 .trae/）
├── skill/                      # 语义触发（3个）
│   ├── 工作流导演/             # ⭐ 核心调度器（调用所有 Subagent）
│   ├── 公众号文章获取/         # 独立工具（检测到URL自动触发）
│   └── 风格建模/               # 独立工具（"学习这个风格"触发）
│
├── agent/                      # 显式调用，上下文隔离（18个编外专员）
│   │
│   ├── ── Stage 0-X: 记忆引擎 ──
│   ├── memory-loader.md        # 记忆装载器 ✨ v0.7.0 New
│   ├── edit-diff-learner.md    # 归因溯源与经验萃取 ✨ v0.7.0 New
│   │
│   ├── ── Stage X: 选题库系统 ──
│   ├── topic-generator.md      # 选题生成器
│   ├── topic-research.md       # 选题深度剖析
│   │
│   ├── ── Stage 1-5: 策划定调 ──
│   ├── writing-clarifier.md    # 澄清需求与受众边界
│   ├── research-expert.md      # 调研资料池聚合
│   ├── outline-architect.md    # 逻辑大纲搭建
│   ├── empathy-designer.md     # 共情点/阅读心流设计
│   ├── concretizer.md          # 具象化特写与翻译
│   ├── title-designer.md       # 标题爆款设计与敲定
│   ├── opening-tournament.md   # 开头赛马
│   │
│   ├── ── Stage 6: 原创下笔 ──
│   ├── writing-executor.md     # 原生撰写执行
│   │
│   ├── ── Stage 7-11: 审核防呆与升华 ──
│       ├── editor-review.md        # 主编初审筛雷
│       ├── pre-publish-review.md   # 发布前终级追问反馈
│       ├── wechat-reader-test.md   # 微信社交传播测试
│       ├── humanizer.md            # 去AI病理净化/灵魂注入
│       └── article-illustrator.md  # 高维情绪插图配图师
│
└── styles/                      # 风格库（5+套）
    ├── jiubian.md
    ├── 墨水怪风.md
    └── ...
```

```text
01_theme.md
-> 01b_position.md
-> 02_scar_tissue.md
-> 03_outline.md
-> 05c_opening_hook.md
-> draft_v2.md
-> humanized_final.md
-> humanized_final_clean.txt
```

如果你看完这套 Demo 觉得“这不是一次性吐全文，而是一条可复盘的生产线”，那这个仓库的核心价值你已经看到了。

---

**三种工具均可使用：**

| 工具 | 配置目录 | Skills 路径 | 加载方式 |
|------|---------|------------|---------|
| **Claude Code** | `.claude/` | `.claude/skills/` | 自动扫描 |
| **Kilo** | `.kilo/` | `.kilo/skill/` | kilo.json 配置 |
| **Trae** | `.trae/` | `.trae/skills/` | 自动扫描 |

> 三个目录的内容通过 `scripts/sync_config.py` 保持同步，`.kilo/` 为唯一数据源。详见 [SYNC.md](SYNC.md)。

**重要说明：**

1. **克隆项目后，配置已经在项目目录里了**
   - 项目文件结构：`writing-agent/.kilo/skill/`（3 个项目级 Skills）
   - 长链路能力由 `writing-agent/.kilo/agent/` 下的 18 个 Subagent 承载
   - 同步后的副本在 `.claude/skills/` 和 `.trae/skills/`

2. **必须在项目目录中启动工具**
   ```powershell
   cd writing-agent        # 先进入项目目录
   claude                  # Claude Code
   kilo                    # Kilo
   # Trae IDE 直接打开项目文件夹即可
   ```
   
   ⚠️ **关键**：工具只会加载**当前目录**下的配置
   
   - ✅ 正确：在 `writing-agent/` 目录中启动 → Skills 自动加载
   - ❌ 错误：在其他目录启动 → Skills 不会被加载

这套 Demo 需要传达三件事：

- 这是一条完整生产线，不是只放终稿
- 默认发布出口仍然是 `_clean.txt`，也可以在最后一步额外导出公众号排版 `.html`
- 中间产物本身就能证明“可调度、可中断、可复盘”

最关键的几个文件：

- [01b_position.md](demo/老板的AI战略骗局/01b_position.md)：先把文章的“牙齿”定下来，避免后面越写越软
- [02_scar_tissue.md](demo/老板的AI战略骗局/02_scar_tissue.md)：不是堆资料，而是打捞致命场景、隐秘代价、荒诞细节
- [04_share_map.md](demo/老板的AI战略骗局/04_share_map.md)：不是只做共情，而是设计读者为什么愿意转发
- [05c_opening_hook.md](demo/老板的AI战略骗局/05c_opening_hook.md)：先赛马开头，再锁定起手式
- [pre_publish_review.md](demo/老板的AI战略骗局/pre_publish_review.md)：发布前追问和红队挑刺
- [wechat_reader_test.md](demo/老板的AI战略骗局/wechat_reader_test.md)：模拟朋友圈、同行群、家族群的真实反应
- [humanized_final_clean.txt](demo/老板的AI战略骗局/humanized_final_clean.txt)：最后给你一个可直接复制粘贴发布的纯文本终稿

如果你只看最终效果，这篇 Demo 的发布出口就是：

```text
demo/老板的AI战略骗局/humanized_final_clean.txt
```

---

## 最新更新

首页只保留当前主线版本，历史版本不再堆在前面。

### v0.7.7 新增公众号排版 HTML 导出

- 新增 `html-exporter` 末端导出器：最终 Markdown 定稿后，可以额外导出一份适合公众号排版和复制的 `.html`
- 内置 4 种默认版式可选：`经典正文（default）`、`精致长文（grace）`、`极简评论（simple）`、`现代杂志（modern）`
- 保留 `_clean.txt` 作为默认纯文本出口：你可以只拿纯文本，也可以同时拿纯文本和排版 HTML
- 收紧 Stage 12.5 契约、运行态记录和回归测试，让“是否导出 HTML、选择哪种版式”变成真实流程，而不是 prompt 口头约束

如果你关心的是“最后到底能交付什么”，这一版的答案很直接：**正文、可直接复制的 `_clean.txt`、可选的公众号排版 `.html`，都能稳定落地。**

### v0.7.6 深化生产骨架

- `research-expert` 从泛泛调研改成“伤疤打捞”，核心产物是 [02_scar_tissue.md](demo/老板的AI战略骗局/02_scar_tissue.md)
- `empathy-designer` 从共情点设计升级成“社交转发动机”，核心产物是 [04_share_map.md](demo/老板的AI战略骗局/04_share_map.md)
- 新增 `opening-tournament`，在正式写稿前先赛马开头，核心产物是 [05c_opening_hook.md](demo/老板的AI战略骗局/05c_opening_hook.md)

如果你只想知道仓库现在值不值得拉下来试，先看 `v0.7.7` 这 3 条就够了。更老的版本记录去 `CHANGELOG` 或 Releases 看，不应该堵在首页前面。

---

## 模型与 Coding Plan

这个项目不一定非要跑 Claude 官方模型。对大多数人来说，更实用的是通过 Anthropic 兼容接口接第三方模型。

当前推荐逻辑很简单：

- 想最低成本先把完整流程跑通：`DeepSeek-V3.2`
- 已经有 `智谱 GLM` 或 `MiniMax` 套餐：直接用，也已经实测过，效果不分伯仲
- 每个月会高频写作、频繁审稿和反复改稿：直接考虑 `Coding Plan`
- 需要在多家兼容接口之间反复切换：上 [CC-Switch](https://github.com/farion1231/cc-switch)

为什么首页默认先写 `DeepSeek-V3.2`：

- 不是因为它明显强于另外两家
- 而是最早测试路径最便宜，先充 10 块钱就足够把这套流程从头到尾验证一遍

首页只保留一个简表：

| 场景 | 推荐 |
|------|------|
| 首次验证完整流程 | `DeepSeek-V3.2` 按量付费 |
| 已有其他平台套餐 | `智谱 GLM` / `MiniMax` 直接接入 |
| 中高频长期使用 | `Coding Plan` |
| 多模型来回切换 | `CC-Switch` |

完整的模型接入文档、Coding Plan 地址和选型建议，见下方 [模型和成本怎么选](#模型和成本怎么选)。

---

## 它和普通 AI 写作工具有什么不一样

普通 AI 写作：

- 一次性生成全文
- 改一轮就开始漂
- 风格、结构、审稿全混在一个大 prompt 里
- 很难知道文章为什么好，为什么差

写稿Agent：

- 先定主题和立场
- 再打捞场景、代价和细节
- 再做大纲、分享触点、具象化和开头赛马
- 写完后还有主编审稿、发布前评审、微信传播测试、去 AI 味
- 最后输出 `_clean.txt` 终稿，并可按需额外导出公众号排版 `.html`

一句话说：

**它不是“让 AI 帮你写一篇文章”，而是“把写作拆成可调度、可中断、可复盘的流程”。**

---

## 适合谁，不适合谁

适合：

- 写公众号文章、长文观点文、行业评论的人
- 对“AI 味”“结构松”“标题软”“开头弱”敏感的人
- 想把 AI 写作纳入稳定工作流的人

不适合：

- 只想一句话秒出 300 字短文的人
- 不关心中间产物、只关心快的人
- 不想做任何确认和审稿的人

---

## 完整版安装

完整版不是只靠一个 Skill 在跑，它依赖整个仓库一起工作：

- `.claude/skills/`
- `.claude/agents/`
- `.claude/workflows/`
- `scripts/`

最短路径：

1. 先准备 `Node.js 18+` 和 `Claude Code`
2. clone 本仓库
3. 配好你要用的模型 API 或 Claude 账号
4. 一定在项目根目录启动 `claude`
5. 先用 [`demo/老板的AI战略骗局/`](demo/老板的AI战略骗局/) 理解流程，再开始正式写作

如果你已经准备直接跑完整版，继续看：

- [给新手的完整安装与使用说明](#给新手的完整安装与使用说明)

### 现在有两种交付路径

从这一版开始，这个项目同时支持两种使用方式：

| 方式 | 适合谁 | 运行根目录 |
|------|------|------|
| `git clone` 仓库 | 想直接拿完整项目、看 demo、参与开发的人 | 仓库根目录 |
| `plugin` 安装 | 不想先 clone 仓库，只想在任意工作目录里使用工作流的人 | 你的当前工作目录 |

两条路径的底层运行时现在共用一套事实源：

- `claude-runtime/`

然后再分别同步到：

- 项目兼容层：`.claude/`
- 插件目录：`plugins/writing-agent/`

### 如果你是 `git clone` 用户

用法不变：

1. clone 仓库
2. 在仓库根目录启动 `claude`
3. 继续按项目内 `.claude/`、`scripts/`、`demo/` 这套方式使用

### 如果你是 `plugin` 用户

插件模式的目标是：

- 安装插件后，不需要先 clone 这个仓库
- 在任意正常工作目录启动 `claude`
- 插件会通过工作区自举脚本补齐最小运行目录

当前仓库里已经包含插件骨架：

- `plugins/writing-agent/`
- `.claude-plugin/marketplace.json`

安装方式只保留最简单这一条。

假设仓库地址就是：

- `dongbeixiaohuo/writing-agent`

那用户只需要执行：

#### 1. 添加 marketplace

```bash
claude plugin marketplace add dongbeixiaohuo/writing-agent
```

#### 2. 安装插件

```bash
claude plugin install writing-agent@writing-agent-marketplace
```

#### 3. 重新加载插件

```text
/reload-plugins
```

装完之后，在你想写文章的目录里启动 `claude` 就可以了。

插件第一次进入一个空工作目录时，会自动补齐最小运行结构：

- `articles/`
- `.claude/styles/`
- `.claude/workflows/`
- `scripts/`

这意味着 plugin 用户不需要 clone 完整仓库，也能让工作流里那些依赖 `.claude/` 和 `scripts/` 的阶段继续正常工作。

---

## 给新手的完整安装与使用说明

如果你对这些东西还不熟：

- GitHub 仓库怎么 clone
- Claude Code 怎么装
- Node.js 为什么要装
- 模型和 API 怎么配
- 怎么确认项目真的跑起来了

那就直接按这一节来，不需要先去翻别的文档。

---

## 三种安装方式

Claude Code 支持 macOS、Linux、Windows。你该选哪条路，取决于你的系统和习惯。

| 安装方式 | 命令 | 适用平台 | 推荐度 |
|------|------|------|------|
| Native Install | `curl -fsSL https://claude.ai/install.sh \| bash` | macOS / Linux / WSL | ⭐ 推荐 |
| Homebrew | `brew install --cask claude-code` | macOS | 适合已经在用 brew 的人 |
| WinGet | `winget install --id Anthropic.ClaudeCode -e` | Windows | Windows 首选 |

核心建议：

- 不确定选哪个：macOS / Linux 直接用 Native Install
- 已经是 Homebrew 用户：用 `brew` 更顺手
- Windows：先装 Git for Windows，再走 WinGet

---

## 为什么 Node.js 还要讲

这点必须说清楚。

Anthropic 当前文档仍把 `Node.js 18+` 作为 Claude Code 的系统要求。对这个仓库来说，提前准备好 Node.js 也仍然是最稳的做法，原因有两个：

- 如果你后面想走 `npm` 路线安装、升级或调试 Claude Code，Node.js 是硬前置
- 这个仓库本身带了 `package.json` 和一些基于 Node 的脚本、工具链，后面你大概率还是会用到 `node` / `npm`

所以最稳的建议是：

- 先装好 `Node.js 18+`
- 再装 Claude Code
- 最后 clone 仓库并启动项目

### Node.js 怎么装

**Windows：**

- 官网下载安装：[nodejs.org](https://nodejs.org/)
- 或者直接用 WinGet：

```powershell
winget install OpenJS.NodeJS.LTS
```

**macOS：**

- 官网安装包
- 或者：

```bash
brew install node
```

**Linux：**

- 推荐用 `nvm`
- 或者用你发行版自己的包管理器

装完先验证：

```powershell
node --version
npm --version
```

能看到版本号，再继续下一步。

---

## Claude Code 怎么装

### macOS / Linux

打开终端，运行：

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

这个脚本会自动下载 Claude Code，并把 `claude` 命令放到你的 PATH 里。

如果你是 Homebrew 用户，也可以直接：

```bash
brew install --cask claude-code
```

装完验证：

```bash
claude --version
```

### Windows

Windows 这里建议按“Git for Windows + WinGet”这条路走。

#### 1. 先装 Git for Windows

从 [git-scm.com](https://git-scm.com/) 下载也可以，直接 WinGet 更省事：

```powershell
winget install --id Git.Git -e
```

它会顺带给你 Git Bash。Claude Code 在 Windows 上需要这类 Unix 工具链支持，所以这一步不要跳。

#### 2. 安装 Claude Code

```powershell
winget install --id Anthropic.ClaudeCode -e
```

如果你不用 WinGet，也可以改走官方 PowerShell 安装脚本：

```powershell
irm https://claude.ai/install.ps1 | iex
```

#### 3. 验证安装

重新打开 PowerShell 或 Git Bash，运行：

```powershell
claude --version
```

看到版本号就说明装好了。

#### 4. Windows 使用建议

- 推荐用 PowerShell 或 Git Bash
- 不推荐直接在 CMD 里折腾
- 如果你装了便携版 Git，Claude Code 找不到 Git Bash，再单独配置 `CLAUDE_CODE_GIT_BASH_PATH`

---

## 五种用法，选哪个

Claude Code 装好之后，常见有五种用法：

| 环境 | 特点 | 适合谁 |
|------|------|------|
| 终端 CLI | 最原生、能力最完整 | 日常开发主力方式 |
| VS Code 扩展 | 在 VS Code 侧边栏里用 | 已经重度依赖 VS Code 的人 |
| Desktop App | 图形界面更直接 | 不熟终端、但想先上手的人 |
| Web | 浏览器直接使用 | 临时体验 |
| JetBrains 插件 | IntelliJ / WebStorm 等集成 | JetBrains 用户 |

这份 README 和本仓库的所有说明，默认都以 **终端 CLI** 为基准。

原因很简单：

- 这个仓库强依赖“当前项目目录”这个上下文
- `.claude/skills/`、`.claude/agents/`、`.claude/workflows/` 都更适合按 CLI 路径理解
- 就算你后面要用 VS Code 或 JetBrains，也建议先把 CLI 这条路摸熟

---

## 账号和钱的事

你有两条常见路径：

- 直接用 Claude 官方订阅登录 Claude Code
- 不走 Claude 订阅，改用 Anthropic 兼容接口接第三方模型

这两条路不是互斥的，只是适用场景不同。

### Claude 官方订阅

如果你打算直接用 Claude 官方账号，常见档位是：

| 方案 | 当前常见价格 | 适合谁 |
|------|------|------|
| Pro | `$20/月` | 轻量使用、学习、个人开发 |
| Max 5x | `$100/月` | 高频使用、每天长时间对话 |
| Max 20x | `$200/月` | 重度使用、多人或商业项目 |

这组价格和额度变动比较快，最终以 Anthropic 官方页面为准。

简单选法：

- 你只是想先体验 Claude 官方服务：先从 `Pro` 开始
- 你每天都在用，或者很容易撞额度：再升 `Max 5x`
- 你是团队或商业重度使用：再看 `Max 20x`

### 这个仓库更常见的实际路径

对这个项目来说，更常见的用法其实是：

- 用 Anthropic 兼容接口
- 接 `DeepSeek-V3.2`、`智谱 GLM`、`MiniMax` 这类第三方模型
- 用更低成本把长链路写作流程跑通

所以你不用把“Claude 官方订阅”和“第三方模型 API”理解成二选一。

---

## 模型和成本怎么选

这个项目的模型选择逻辑，不是“谁绝对最强”，而是“谁更适合你的使用方式”。

### 按量付费模型

| 模型 | 当前定位 | 什么时候用 | 获取 API Key | 官方文档 |
|------|------|------|------|------|
| **DeepSeek-V3.2** | 默认推荐 | 第一次完整验证流程、预算敏感、想先充少量金额试跑 | [DeepSeek 平台](https://platform.deepseek.com) | [接入文档](https://api-docs.deepseek.com/zh-cn/guides/anthropic_api) |
| **智谱 GLM** | 已实测同级 | 已有 GLM 套餐或更习惯智谱生态 | [智谱开放平台](https://open.bigmodel.cn) | [接入文档](https://docs.bigmodel.cn/cn/coding-plan/tool/claude) |
| **MiniMax** | 已实测同级 | 已有 MiniMax 套餐或更习惯 MiniMax 平台 | [MiniMax 平台](https://platform.minimaxi.com) | [接入文档](https://platform.minimaxi.com/docs/api-reference/text-anthropic-api) |

这里要说清楚：

- `智谱 GLM` 和 `MiniMax` 都已经实测过，和 `DeepSeek-V3.2` 不分伯仲
- README 里先强调 `DeepSeek-V3.2`，不是因为它明显更强
- 只是因为最开始测试时它的按量成本最低，先充 10 块钱就足够把一整条链路从头到尾跑明白

### Coding Plan 包月套餐

如果你会频繁使用本项目，按量付费不一定最省心。下面这些地址本身就值得收藏：

| 平台 | 首月特惠 / 入门档 | 常见续费 | 适合谁 | 链接 |
|------|------|------|------|------|
| 阿里云百炼 | `¥7.9 / ¥39.9` | 约 `¥40 / ¥200` | 量大、价格低、入口稳定 | [阿里云百炼](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/index) |
| 腾讯云 | `¥7.9 / ¥39.9` | 约 `¥40 / ¥200` | 腾讯云用户 | [腾讯云](https://cloud.tencent.com/act/pro/codingplan) |
| 百度千帆 | `¥7.9 / ¥39.9` | 约 `¥40 / ¥200` | 千帆用户 | [百度千帆](https://cloud.baidu.com/product/codingplan.html) |
| 火山引擎 | `¥9.9 / ¥49.9` | 约 `¥50+` | 字节生态用户 | [火山引擎](https://www.volcengine.com/activity/codingplan) |
| 无问芯穹 | `¥19.9 / ¥40` | `¥40 / ¥200` | 追求更高配额的人 | [无问芯穹](https://cloud.infini-ai.com/platform/ai) |
| MiniMax | `¥29/月` 起 | `¥290/年` 起 | 已在 MiniMax 生态内 | [MiniMax Coding Plan](https://platform.minimaxi.com/subscribe/coding-plan) |
| 智谱 GLM | `¥30/月` 左右 | `¥411/年` 左右 | GLM 用户 | [智谱 GLM Coding](https://open.bigmodel.cn/glm-coding) |
| Kimi Code | `¥49/月` 起 | 以官方页为准 | 想看 Kimi 方案的人 | [Kimi Code](https://www.kimi.com/code) |

这些套餐的价格、额度和活动会变化，最终以各平台页面为准。这里保留完整地址，是为了方便收藏和后续比较。

### 怎么选最省事

- 每月少量使用：`DeepSeek-V3.2` 按量付费
- 每月持续写、持续改：优先看 `Coding Plan`
- 手上已经有 `智谱 GLM` 或 `MiniMax` 套餐：直接接，不需要为了 README 刻意换

### 模型切换怎么搞

如果你不想手改环境变量，推荐直接用：

- [CC-Switch](https://github.com/farion1231/cc-switch)

它适合这类场景：

- 你在 `DeepSeek-V3.2`、`智谱 GLM`、`MiniMax` 之间切换
- 你不想反复改 `ANTHROPIC_BASE_URL`
- 你不想每次都重新整理 API Key

---

## 说第一句话

装好了，模型也有了，先不要急着正式写文章。先让 Claude Code 证明它真的能理解这个仓库。

### 1. 进入项目目录

```powershell
git clone https://github.com/dongbeixiaohuo/writing-agent.git
cd writing-agent
```

### 2. 启动 Claude Code

```powershell
claude
```

如果你走 Claude 官方账号，第一次启动会引导你登录。

如果你走第三方兼容接口，先把 `settings.json` 配好再启动。

### 3. 先说这句话

进入对话后，直接试一句：

```text
先别写新文章，先解释 demo/老板的AI战略骗局 里每个阶段文件各自起什么作用。
```

这句话的好处是：

- 它能验证 Claude Code 读没读到当前项目目录
- 它能验证 `.claude/skills/` 是否被正确加载
- 它能让你立刻理解这套流程到底怎么工作

---

## 确认一切正常

按这个清单过一遍：

| 检查项 | 命令 / 操作 | 预期结果 |
|------|------|------|
| Node.js 可用 | `node --version` / `npm --version` | 能看到版本号 |
| Claude CLI 可用 | `claude --version` | 能看到版本号 |
| Claude 环境自检 | `claude doctor` | 没有关键错误 |
| 项目目录正确 | 在仓库根目录执行 `dir` / `ls` | 能看到 `.claude/`、`demo/`、`scripts/` |
| Skills 可见 | 启动 `claude` 后询问有哪些 skills | 至少能识别项目级 skills |
| Demo 可读 | 让它解释 `demo/老板的AI战略骗局/` | 能说明各阶段文件的作用 |
| 基础命令可跑 | 让它执行 `git status` 或 `dir` / `ls` | 能返回命令结果 |

如果这些都过了，就说明基础环境是正常的。

---

## 项目级加载逻辑

很多人会误以为：

- clone 了仓库 = 一定能跑完整流程

实际不是。

这个仓库的完整版依赖 4 层同时存在：

- skill 作为入口：`.claude/skills/`
- agent 作为执行单元：`.claude/agents/`
- workflow 作为协议：`.claude/workflows/`
- scripts 作为底层工具：`scripts/`

所以你必须做到：

1. clone 完整仓库
2. 在项目根目录启动 `claude`
3. 让这 4 层一起工作

少了其中一层，都不是完整链路。

### 双轨兼容后的真实结构

现在仓库里多了一层运行时事实源：

- `claude-runtime/`

维护逻辑变成：

- 开发时优先修改 `claude-runtime/`
- 然后同步生成项目兼容层 `.claude/`
- 再同步生成插件目录 `plugins/writing-agent/`

对应命令：

```bash
npm run sync:claude-runtime
npm run check:claude-runtime
```

第一条负责同步，第二条负责检查有没有漂移。

这样可以避免后续出现：

- `git clone` 用户拿到的是新逻辑
- `plugin` 用户拿到的还是旧逻辑

如果你在改运行时相关内容，例如：

- `skills`
- `agents`
- `styles`
- `workflows`
- `scripts`

那就不要只改 `.claude/` 或 `plugins/writing-agent/`，而是优先改 `claude-runtime/`。

---

## 推荐的新手使用顺序

如果你是第一次接触这类工具，我建议按这个顺序来：

### 路线 A：先看 Demo，再安装

1. 先看 [`demo/老板的AI战略骗局/`](demo/老板的AI战略骗局/)
2. 看明白 `01_theme.md -> humanized_final_clean.txt` 这条链路
3. 再决定你要走哪家模型和哪种费用方案
4. 最后开始安装和配置

### 路线 B：直接上完整版

1. 先装 Node.js
2. 再装 Claude Code
3. clone 仓库
4. 配模型或账号
5. 在项目目录启动 `claude`
6. 用 Demo 做第一轮验证

**风格建模过程（v3.0 - 15维度）：**
```
提供样本文章
    ↓
Claude 会：
1. 深度解构15个维度：
   - 作者画像与核心人格 ✨ 新增
   - 思维内核与论证逻辑 ✨ 升级
   - 创作路径还原 ✨ 新增
   - 互动设计 ✨ 新增
   - 开头/过渡/结尾模式
   - 句式与节奏
   - 词汇指纹（5类细分）✨ 升级
   - 修辞手法
   - 格式与排版
   - 独特习惯与招牌动作（5类细分）✨ 升级
   - 反AI特征
   - 典型段落模板
   - 禁忌清单
2. 提取"招牌动作"（最具辨识度的写作习惯）
3. 保存风格文件到 `.kilo/styles/XXX风格.md`
    ↓
下次写作时可以直接调用这个风格
```

## 遇到问题了

### 1. `claude: command not found`

通常是：

- Claude Code 没装好
- PATH 没生效
- 终端没重开

项目自带四个风格示例（位于 `.kilo/styles/`，自动同步到 `.claude/styles/`）：

### 1. 墨水怪风（`.kilo/styles/墨水怪风.md`）
- **核心人格**：愤世嫉俗但真诚的毒舌老哥
- **招牌动作**：悖论翻转、质疑打断、真诚骂人
- **特色词汇**：兽性、进化心理学、巴甫洛夫
- **适用场景**：观点文、批判性分析

### 2. 九边风（`.kilo/styles/jiubian.md`）
- **核心人格**：职场老炮式人生导师
- **招牌动作**："那问题来了"、案例故事化、承认局限
- **分析模式**：现象→机制→人性→出路
- **适用场景**：职场分析、深度解读

### 3. 老总在人间风（`.kilo/styles/老总在人间.md`）✨ 新增
- **核心人格**：看透职场和人性的"老油条"
- **招牌动作**："拖出去砍了"夸张式反驳、【】强调金句、直白揭露
- **特色表达**：刻在骨髓里、本金风险、知识付费推广
- **适用场景**：职场真相揭露、务实建议、知识付费内容

### 4. sanbiaobiao风（`.kilo/styles/sanbiaobiao.md`）✨ 新增
- **核心人格**：看透内容产业规律的媒体老兵
- **招牌动作**：反常识开场、具体化对比、知识结构决定论
- **特色表达**："喂,等等,不对劲啊"、一手资料vs二道贩子、鼻子上长了个洋鸡蛋
- **适用场景**：内容行业观察、产品评论、理解式批判

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
```

**PowerShell：**

- [多工具配置同步指南](SYNC.md) ⭐ 新增（Kilo / Trae / Claude Code 三端兼容）
- [协作写作工作流快速参考](docs/WORKFLOW_QUICK_REFERENCE.md)
- [Skills 更新总结](docs/SKILLS_UPDATE_SUMMARY.md)
- [DeepSeek API 配置指南](docs/DEEPSEEK_SETUP.md) ⭐ 推荐
- [Skills 开发指南](.kilo/skill/)
- [风格建模教程](.kilo/skill/风格建模/SKILL.md)
- [常见问题 FAQ](docs/FAQ.md)
- [项目结构说明](docs/PROJECT_STRUCTURE.md)

如果你长期需要代理，把它写进你的 shell 配置里。

### 配置同步（多工具用户必读）

本项目以 `.kilo/` 为唯一数据源，通过同步脚本分发到 `.claude/` 和 `.trae/`：

```bash
# 修改 .kilo/ 下的文件后，运行同步
python scripts/sync_config.py

# 预览模式
python scripts/sync_config.py --dry-run
```

> 详见 [SYNC.md](SYNC.md) 了解完整的同步机制和目录映射。

### 自定义反AI规则

编辑 `.kilo/agent/writing-executor.md` 中的"反AI写作技巧"部分，添加你自己的规则。修改后运行 `python scripts/sync_config.py` 同步。

如果你走 Native Install 路线，先确认：

编辑 `.kilo/agent/writing-executor.md` 中的"字数控制"部分，修改允许范围（默认±20%）。修改后运行 `python scripts/sync_config.py` 同步。

然后重新执行安装脚本。

编辑 `.kilo/skill/工作流导演/SKILL.md`，可以调整协作模式的阶段顺序或跳过某些阶段。修改后运行 `python scripts/sync_config.py` 同步。

### 4. 我 clone 了仓库，为什么还是没有完整流程

优先排查这三件事：

1. 你是不是在项目根目录启动的 `claude`
2. `.claude/skills/`、`.claude/agents/`、`.claude/workflows/`、`scripts/` 是否都在
3. 你的仓库是不是拉到了最新版本

这套系统不是只靠一个 Skill 跑起来的，它依赖完整目录和项目内启动。

### 5. 怎么升级 Claude Code

先试：

```bash
claude update
```

如果你更习惯沿用安装时的包管理方式，再用下面这些命令：

**Native Install：**

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Homebrew：**

```bash
brew upgrade --cask claude-code
```

**WinGet：**

```powershell
winget upgrade Anthropic.ClaudeCode
```

### 6. 想在 VS Code 里用

去 VS Code 扩展市场搜索 `Claude Code`，安装 Anthropic 官方扩展即可。

但建议先把 CLI 路线跑通，再切 IDE。

### 7. 不想用终端，想用桌面应用

可以直接去 [claude.ai/download](https://claude.ai/download) 下载 Desktop App。

但这套仓库仍然建议你至少先把 CLI 跑通，因为项目目录上下文、skills、agents、workflows 的理解都更直接。

---

## 如果你只想记住最重要的 3 句话

1. 先看 [`demo/老板的AI战略骗局/`](demo/老板的AI战略骗局/)，比先看安装说明更容易看懂项目价值。
2. `DeepSeek-V3.2` 是默认推荐，不是因为它压过另外两家，而是因为它最适合低成本先把整套流程跑通。
3. 完整版一定要在项目根目录启动 Claude Code，最后默认交付的是 `_clean.txt`，并可按需额外导出公众号排版 `.html`。
