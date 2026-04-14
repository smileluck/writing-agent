# IA And User Flow

## 信息架构

- `Onboarding`
  - 预设列表
  - 配置表单
  - 连接测试
- `Home`
  - 项目列表
  - 新建项目表单
  - 已接入模型配置概览
- `Workspace`
  - 阶段侧栏
  - 当前阶段说明
  - 生成 / 接受 / 导出
  - Markdown 预览
  - 结构化 JSON 预览
- `Settings`
  - 模型配置列表
  - 默认配置展示
- `Styles`
  - V1 占位

## 用户主流程

### 首次使用

1. 进入 Onboarding
2. 选择服务商预设
3. 自动填入 `Base URL`
4. 输入 `API Key`
5. 测试连接
6. 保存配置
7. 进入 Home

### 创建写作项目

1. 在 Home 填项目标题、主题、读者、字数、模式
2. 选择模型配置
3. 创建项目
4. 自动跳转到 Workspace

### 运行阶段

1. Workspace 根据项目模式渲染阶段序列
2. 用户点击“生成本阶段”
3. 应用拼装 prompt 并调用模型
4. 结果解析为：
   - `markdown`
   - `json`
5. 产物落入 SQLite 和项目目录
6. 用户点击“接受并进入下一阶段”

### 导出

1. 用户点击“导出最终稿”
2. 优先导出 `humanize`
3. 若没有最终稿，则回退到 `draft`
4. 若仍没有，则按阶段拼接导出

## 状态说明

- 应用级：
  - `booting`
  - `ready`
  - `error`
- 项目级：
  - `idle`
  - `loading`
  - `ready`
  - `generating`
  - `advancing`
  - `exporting`
  - `failure`
