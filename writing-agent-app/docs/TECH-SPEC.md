# Technical Spec

## 当前技术栈

- UI：`React`
- Workflow：`XState v5`
- Validation：`zod`
- Desktop shell：`Tauri v2`
- Persistence：`SQLite + 项目目录`
- Model adapter：Rust 侧 `Anthropic-compatible` 请求

## 目录

```text
writing-agent-app/
  src/
    App.tsx
    types.ts
    lib/
    machines/
    modules/
  src-tauri/
    src/
      lib.rs
      main.rs
    Cargo.toml
    tauri.conf.json
```

## 前端职责

- 启动时调用 `bootstrap_app`
- 管理 onboarding 表单
- 管理项目级状态机
- 生成阶段 prompt
- 解析 `<markdown>` 和 `<json>` 结果
- 触发阶段保存、阶段推进、导出

## Rust 侧职责

- 初始化 SQLite
- 保存模型公开配置
- 管理 API Key 存储
- 创建项目目录
- 执行 `Anthropic-compatible` 请求
- 写入阶段产物文件
- 导出最终稿

## 数据表

- `model_profiles`
- `writing_projects`
- `stage_outputs`
- `exports`

## 当前 Tauri Commands

- `bootstrap_app`
- `health_check_profile`
- `save_model_profile`
- `create_project`
- `get_project_detail`
- `run_model_request`
- `save_stage_output`
- `update_project_progress`
- `export_project`

## 协议实现

当前请求统一走：

- endpoint：`<baseUrl>/v1/messages`
- body：
  - `model`
  - `max_tokens`
  - `temperature`
  - `system`
  - `messages`

兼容策略：

- 优先尝试 `x-api-key`
- 同时兼容 fallback 到 `Bearer`
- 对官方 Anthropic 自动附加 `anthropic-version`

## 当前与原规格的偏差

### 密钥存储

原规格写的是 `Stronghold`。当前实现不是。

原因：

- 这轮目标是先把可运行闭环搭起来
- 现有 Windows 环境下，`keyring` 新版依赖链也引入了额外构建问题
- 所以先落成了应用数据目录下的独立 `secrets.json`

结论：

- 当前是“可用的本地存储”
- 不是最终安全方案
- 后续优先替换成 `Stronghold` 或系统密钥库

### 风格库

- 当前只有入口页
- 还没有接入真实风格建模链路

### 流式输出

- 当前全部是非流式
- 先保证阶段状态和产物落盘稳定
