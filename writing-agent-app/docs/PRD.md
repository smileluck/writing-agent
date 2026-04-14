# Writing Agent App PRD

## 目标

把当前依赖 Claude Code 运行时的写作工作流，收敛成一个本地桌面应用。用户首次只需要：

1. 选择服务商预设
2. 填 `API Key`
3. 新建文章项目
4. 按阶段生成和确认

## V1 用户价值

- 降低门槛：不要求用户理解 `.claude/skills`
- 兼容主流 `Anthropic-compatible` 接口
- 把写作过程从一次性大 prompt 改成阶段流
- 保留项目、阶段产物和导出文件

## V1 范围

- 本地桌面应用：`Tauri + React`
- 顶层流程：`XState v5`
- 数据校验：`zod`
- 本地项目持久化：`SQLite + 项目目录`
- 主协议：`Anthropic-compatible`
- 模式：
  - 快速模式：`theme -> outline -> draft -> humanize`
  - 深度模式：`theme -> position -> research -> outline -> titles -> draft -> review -> humanize`

## V1 服务商预设

- Claude 官方
- 阿里云百炼
- 腾讯云
- 百度千帆
- 火山引擎
- MiniMax
- 智谱 GLM
- Kimi Code
- 无问芯穹
- 自定义

说明：

- 预设优先服务于“傻瓜化接入”
- 没有找到稳定官方 Anthropic 兼容文档的服务商，降级为“半预设”
- 价格、额度、评级只作为展示信息

## 核心页面

- Onboarding：配置模型服务
- Home：项目列表 + 新建项目
- Workspace：阶段流、当前产物、导出
- Settings：模型配置列表
- Styles：风格库占位

## 非目标

- 不在 V1 内复刻全部 `.claude/agents`
- 不做浏览器抓取公众号内容
- 不做多人协作
- 不做复杂插件市场
- 不做并行多 agent 编排

## 已知风险

- 部分 coding plan 文档对使用场景有限制，是否允许接入自定义桌面应用需要用户自行确认
- 当前版本的 secrets 存储先用了应用目录下的独立 secrets 文件，还没有切到 Stronghold 或系统密钥库
