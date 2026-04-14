# Writing Agent App

本目录是原始写作 Agent 的桌面产品化骨架。

## 当前能力

- 预设化接入 `Anthropic-compatible` 服务商
- 本地保存模型配置
- 新建写作项目
- 按阶段执行写作流程
- 阶段产物落到 SQLite 和项目目录
- 导出最终稿

## 本地启动

```powershell
cd writing-agent-app
npm install
npm run dev
```

如果要走 Tauri：

```powershell
cd writing-agent-app
npm install
cargo tauri dev
```

## 已验证

- `npm run check`
- `npm run build`
- `cargo check`

## 当前限制

- 风格库页面还是占位
- API Key 暂时存在应用数据目录的独立 secrets 文件，不是最终安全方案
- 还没有把原项目全部 agent 能力搬进来
