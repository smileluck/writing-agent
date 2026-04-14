import { z } from 'zod'

import type { ProjectDetail, StageKey, StageOutput, WorkflowMode } from '../../types'

export interface StageDefinition {
  key: StageKey
  label: string
  artifactName: string
  purpose: string
  userGuide: string
  markdownGuide: string
  jsonContract: string
  jsonExample: string
  outputSchema: z.ZodType<object>
}

const ThemeOutputSchema = z.object({
  summary: z.string().min(1),
  audienceNotes: z.array(z.string()).min(2),
  angleOptions: z.array(z.string()).min(2),
  nextFocus: z.string().min(1),
})

const PositionOutputSchema = z.object({
  coreClaim: z.string().min(1),
  supportPoints: z.array(z.string()).min(3),
  redLines: z.array(z.string()).min(2),
})

const ResearchOutputSchema = z.object({
  summary: z.string().min(1),
  evidence: z
    .array(
      z.object({
        point: z.string().min(1),
        implication: z.string().min(1),
      }),
    )
    .min(3),
  unansweredQuestions: z.array(z.string()).min(1),
})

const OutlineOutputSchema = z.object({
  summary: z.string().min(1),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1),
        goal: z.string().min(1),
        bullets: z.array(z.string()).min(2),
      }),
    )
    .min(3),
})

const TitleOutputSchema = z.object({
  summary: z.string().min(1),
  candidates: z
    .array(
      z.object({
        title: z.string().min(1),
        angle: z.string().min(1),
        hook: z.string().min(1),
      }),
    )
    .min(3),
  selected: z.number().nullable(),
})

const DraftOutputSchema = z.object({
  summary: z.string().min(1),
  sectionsCompleted: z.array(z.string()).min(3),
  revisionFocus: z.array(z.string()).min(2),
})

const ReviewOutputSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string()).min(2),
  issues: z.array(z.string()).min(2),
  revisionPlan: z.array(z.string()).min(2),
})

const HumanizeOutputSchema = z.object({
  summary: z.string().min(1),
  voiceAdjustments: z.array(z.string()).min(2),
  phrasesToKeep: z.array(z.string()).min(2),
  finalChecks: z.array(z.string()).min(2),
})

const stageMap: Record<StageKey, StageDefinition> = {
  theme: {
    key: 'theme',
    label: '需求澄清',
    artifactName: '01_theme.md',
    purpose: '把主题、读者与成文目标锁清楚，避免后面越写越散。',
    userGuide: '输出一份可以直接进入立场和调研阶段的需求澄清稿。',
    markdownGuide: '请用小标题组织这份澄清稿，至少包含目标读者、核心问题、切入角度、交付标准。',
    jsonContract:
      '{ "summary": string, "audienceNotes": string[], "angleOptions": string[], "nextFocus": string }',
    jsonExample:
      '{\n  "summary": "这篇文章要解释……",\n  "audienceNotes": ["读者一", "读者二"],\n  "angleOptions": ["角度一", "角度二"],\n  "nextFocus": "下一步先明确立场边界"\n}',
    outputSchema: ThemeOutputSchema,
  },
  position: {
    key: 'position',
    label: '立场锁定',
    artifactName: '01b_position.md',
    purpose: '明确文章要站在哪一边、反对什么、避免什么表述。',
    userGuide: '输出清晰、可执行的立场说明，不要写成泛泛观点堆砌。',
    markdownGuide: '请给出中心论断、支撑论据、反方观点和不采用的表达。',
    jsonContract: '{ "coreClaim": string, "supportPoints": string[], "redLines": string[] }',
    jsonExample:
      '{\n  "coreClaim": "核心主张",\n  "supportPoints": ["论据一", "论据二", "论据三"],\n  "redLines": ["不写成教程式口吻", "不空喊趋势"]\n}',
    outputSchema: PositionOutputSchema,
  },
  research: {
    key: 'research',
    label: '调研整理',
    artifactName: '02_research.md',
    purpose: '把可支撑文章的事实、案例和证据打包出来。',
    userGuide: '即使没有真实联网调研，也要形成一份可供写作者引用的证据整理稿。',
    markdownGuide: '请输出要点摘要、证据条目、潜在争议和待补问题。',
    jsonContract:
      '{ "summary": string, "evidence": [{"point": string, "implication": string}], "unansweredQuestions": string[] }',
    jsonExample:
      '{\n  "summary": "调研显示……",\n  "evidence": [\n    { "point": "事实一", "implication": "意味着什么" },\n    { "point": "事实二", "implication": "意味着什么" },\n    { "point": "事实三", "implication": "意味着什么" }\n  ],\n  "unansweredQuestions": ["还需要补的一点"]\n}',
    outputSchema: ResearchOutputSchema,
  },
  outline: {
    key: 'outline',
    label: '结构大纲',
    artifactName: '03_outline.md',
    purpose: '把文章结构排顺，保证信息密度和节奏。',
    userGuide: '输出能直接交给写稿阶段的大纲，不要只给标题列表。',
    markdownGuide: '请按章节输出结构，每章写清目标、关键论据和承接关系。',
    jsonContract:
      '{ "summary": string, "sections": [{"heading": string, "goal": string, "bullets": string[]}] }',
    jsonExample:
      '{\n  "summary": "整篇文章先破题再展开案例，最后回到方法论。",\n  "sections": [\n    { "heading": "开头", "goal": "提出问题", "bullets": ["问题背景", "矛盾张力"] },\n    { "heading": "主体", "goal": "展开论证", "bullets": ["案例", "拆解"] },\n    { "heading": "结尾", "goal": "收束观点", "bullets": ["结论", "行动建议"] }\n  ]\n}',
    outputSchema: OutlineOutputSchema,
  },
  titles: {
    key: 'titles',
    label: '标题设计',
    artifactName: '04_titles.md',
    purpose: '给文章找更强的入口，避免好内容死在标题。',
    userGuide: '输出多组可选标题，并解释各自的角度与钩子。',
    markdownGuide: '请给出至少 6 个标题候选，分组说明适用场景。',
    jsonContract:
      '{ "summary": string, "candidates": [{"title": string, "angle": string, "hook": string}], "selected": number | null }',
    jsonExample:
      '{\n  "summary": "标题整体偏问题驱动。",\n  "candidates": [\n    { "title": "标题一", "angle": "问题切入", "hook": "制造反差" },\n    { "title": "标题二", "angle": "结论先行", "hook": "直接给答案" },\n    { "title": "标题三", "angle": "案例切入", "hook": "借真实场景带入" }\n  ],\n  "selected": null\n}',
    outputSchema: TitleOutputSchema,
  },
  draft: {
    key: 'draft',
    label: '初稿生成',
    artifactName: 'draft.md',
    purpose: '把结构真正写成完整文章。',
    userGuide: '请直接写出成稿，不要再输出大纲体。',
    markdownGuide: '请输出一篇完整中文文章，标题、引言、主体、结尾都要齐全，允许保留必要的小标题。',
    jsonContract:
      '{ "summary": string, "sectionsCompleted": string[], "revisionFocus": string[] }',
    jsonExample:
      '{\n  "summary": "初稿已经覆盖主论证链。",\n  "sectionsCompleted": ["引言", "主体一", "主体二", "结尾"],\n  "revisionFocus": ["加强案例细节", "收紧结尾"]\n}',
    outputSchema: DraftOutputSchema,
  },
  review: {
    key: 'review',
    label: '审稿修订',
    artifactName: 'review.md',
    purpose: '从编辑视角找出结构、逻辑和表达上的问题。',
    userGuide: '先指出问题，再给出有执行顺序的修改方案。',
    markdownGuide: '请输出一份审稿意见，至少覆盖结构、论证、节奏、语言四个维度。',
    jsonContract:
      '{ "summary": string, "strengths": string[], "issues": string[], "revisionPlan": string[] }',
    jsonExample:
      '{\n  "summary": "文章逻辑完整，但中段拖沓。",\n  "strengths": ["开头抓人", "观点清晰"],\n  "issues": ["第二部分重复", "结尾不够收束"],\n  "revisionPlan": ["压缩第二部分", "把结尾改成行动建议"]\n}',
    outputSchema: ReviewOutputSchema,
  },
  humanize: {
    key: 'humanize',
    label: '去 AI 味',
    artifactName: 'final.md',
    purpose: '把行文改得更像真人在说话，而不是模型模板输出。',
    userGuide: '输出最终版文章，并明确说明做了哪些去模板化处理。',
    markdownGuide: '请直接给出最终版文章，保持高信息密度，删掉空泛衔接词和模板句。',
    jsonContract:
      '{ "summary": string, "voiceAdjustments": string[], "phrasesToKeep": string[], "finalChecks": string[] }',
    jsonExample:
      '{\n  "summary": "最终稿已压缩废话并提升语气自然度。",\n  "voiceAdjustments": ["减少套话", "句长拉开层次"],\n  "phrasesToKeep": ["关键判断一", "关键判断二"],\n  "finalChecks": ["标题一致", "结尾没有虚词堆叠"]\n}',
    outputSchema: HumanizeOutputSchema,
  },
}

const quickFlow: StageKey[] = ['theme', 'outline', 'draft', 'humanize']
const deepFlow: StageKey[] = ['theme', 'position', 'research', 'outline', 'titles', 'draft', 'review', 'humanize']

export function getStageSequence(mode: WorkflowMode) {
  return mode === 'quick' ? quickFlow : deepFlow
}

export function getCurrentStageDefinition(mode: WorkflowMode, stageKey: StageKey) {
  const sequence = getStageSequence(mode)

  if (!sequence.includes(stageKey)) {
    return stageMap[sequence[0]]
  }

  return stageMap[stageKey]
}

export function getNextStageKey(mode: WorkflowMode, stageKey: StageKey) {
  const sequence = getStageSequence(mode)
  const currentIndex = sequence.indexOf(stageKey)

  if (currentIndex === -1) {
    return sequence[0]
  }

  return sequence[currentIndex + 1] ?? null
}

export function getLatestStageOutput(outputs: StageOutput[], stageKey: StageKey) {
  const stageOutputs = outputs
    .filter((output) => output.stageKey === stageKey)
    .sort((left, right) => right.version - left.version)

  return stageOutputs[0] ?? null
}

function buildPriorOutputsSection(project: ProjectDetail, stageKey: StageKey) {
  const sequence = getStageSequence(project.mode)
  const currentIndex = sequence.indexOf(stageKey)

  if (currentIndex <= 0) {
    return '当前没有前序阶段产物。'
  }

  const lines: string[] = []

  for (const key of sequence.slice(0, currentIndex)) {
    const output = getLatestStageOutput(project.outputs, key)

    if (!output) {
      continue
    }

    lines.push(`## ${stageMap[key].label}`)
    lines.push(output.markdown.slice(0, 2500))
  }

  return lines.length > 0 ? lines.join('\n\n') : '当前没有可引用的前序阶段产物。'
}

function buildStageOptionInstruction(stageKey: StageKey) {
  switch (stageKey) {
    case 'theme':
      return 'JSON 里的 angleOptions 必须给 3 到 5 个可点选方向，每条都要贴着当前题目和读者，写成具体切口，不能只写“收窄范围”“更尖锐”这种空话。'
    case 'draft':
      return 'JSON 里的 revisionFocus 必须给 4 条以上具体改法，每条都要指向文中的某个段落、论据或叙述动作，写成“改哪里 + 怎么改”的形式。'
    case 'review':
      return 'JSON 里的 revisionPlan 必须给 4 到 6 条可直接勾选的修订方向，每条都要写明改哪一段、怎么改、改完会解决什么问题，不能给泛泛建议。'
    case 'humanize':
      return 'JSON 里的 voiceAdjustments 和 finalChecks 都要贴着当前稿件写，明确指出哪些句式、段落或口吻需要调整，不要只写“更自然”“更流畅”。'
    default:
      return null
  }
}

export function buildStagePrompts(project: ProjectDetail, stageKey: StageKey, note?: string | null) {
  const definition = getCurrentStageDefinition(project.mode, stageKey)
  const priorOutputsSection = buildPriorOutputsSection(project, definition.key)
  const latestOutput = getLatestStageOutput(project.outputs, definition.key)
  const normalizedNote = note?.trim() ?? ''

  const systemPrompt = [
    '你是中文长文写作工作流中的一个固定阶段。',
    `阶段名称：${definition.label}。`,
    `阶段目标：${definition.purpose}`,
    '你必须直接产出可交付文本，不要解释自己在做什么。',
    '输出必须只包含 <markdown> 和 <json> 两个区块，不允许附加说明。',
    normalizedNote
      ? '用户这次给了明确修改意见。你要优先基于当前阶段已有版本修订，能保留的保留，不能直接另起一篇。'
      : '如果当前阶段已有版本，可以吸收其中可用内容，但不要重复废话。',
  ].join('\n')

  const blocks = [
    `项目标题：${project.title}`,
    `项目主题：${project.topic}`,
    `目标读者：${project.audience}`,
    project.wordTarget ? `目标字数：${project.wordTarget}` : '目标字数：未指定',
    `工作模式：${project.mode === 'deep' ? '深度模式' : '快速模式'}`,
    `当前阶段任务：${definition.userGuide}`,
    '前序阶段产物：',
    priorOutputsSection,
  ]

  if (latestOutput) {
    blocks.push('当前阶段已有版本：')
    blocks.push(latestOutput.markdown.slice(0, 3500))
  } else {
    blocks.push('当前阶段已有版本：当前还没有可参考的本阶段版本。')
  }

  if (normalizedNote) {
    blocks.push('用户这次的修订要求：')
    blocks.push(normalizedNote)
    blocks.push('请根据这些要求重写当前阶段产物，并保持前序阶段的逻辑一致。')
  }

  blocks.push('请严格按以下格式输出：')
  blocks.push('<markdown>')
  blocks.push(definition.markdownGuide)
  blocks.push('</markdown>')
  blocks.push('<json>')
  blocks.push(definition.jsonExample)
  blocks.push('</json>')
  blocks.push(`JSON 合同：${definition.jsonContract}`)
  const optionInstruction = buildStageOptionInstruction(definition.key)
  if (optionInstruction) {
    blocks.push(optionInstruction)
  }
  blocks.push('不要输出 Markdown 代码块围栏，不要输出额外解释。')

  const userPrompt = blocks.join('\n\n')

  return {
    systemPrompt,
    userPrompt,
  }
}

export function buildRepairPrompts(
  project: ProjectDetail,
  stageKey: StageKey,
  badOutput: string,
  reason: string,
) {
  const definition = getCurrentStageDefinition(project.mode, stageKey)

  return {
    systemPrompt: [
      '你是一个格式修复器。',
      '你的任务不是重写整篇内容，而是在保留原意的前提下，输出满足格式约束的结果。',
      '输出必须只包含 <markdown> 和 <json> 两个区块。',
    ].join('\n'),
    userPrompt: [
      `当前阶段：${definition.label}`,
      `失败原因：${reason}`,
      `JSON 合同：${definition.jsonContract}`,
      '原始输出如下：',
      badOutput,
      '请修复成以下格式：',
      '<markdown>...</markdown>',
      '<json>...</json>',
      '不要输出其它解释。',
    ].join('\n\n'),
  }
}
