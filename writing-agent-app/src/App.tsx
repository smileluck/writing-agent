import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMachine } from '@xstate/react'
import { listen } from '@tauri-apps/api/event'

import { appApi } from './lib/invoke'
import { appMachine } from './machines/app.machine'
import { projectMachine, projectToSummary } from './machines/project.machine'
import { getPresetById, providerPresets } from './modules/presets/provider-presets'
import {
  getCurrentStageDefinition,
  getLatestStageOutput,
  getNextStageKey,
  getStageSequence,
} from './modules/workflow/stage-definitions'
import type {
  ConnectionHealthResult,
  CreateProjectInput,
  ModelProfile,
  ProjectDetail,
  ProjectSummary,
  ProviderPreset,
  SaveModelProfileInput,
  StageKey,
  WorkspaceSettings,
} from './types'

type ProfileDraft = SaveModelProfileInput & {
  selectedPresetId: string
}

function createProfileDraft(
  preset: ProviderPreset,
  overrides: Partial<ProfileDraft> = {},
): ProfileDraft {
  return {
    profileId: null,
    selectedPresetId: preset.id,
    presetId: preset.id === 'custom' ? null : preset.id,
    providerLabel: preset.label,
    baseUrl: preset.defaultBaseUrl ?? '',
    model: preset.recommendedModels[0] ?? '',
    apiKey: '',
    sourceUrl: preset.docsUrl ?? preset.officialUrl,
    policyNote: null,
    isDefault: false,
    includeAnthropicVersionHeader: preset.includeAnthropicVersionHeader,
    ...overrides,
  }
}

function createProfileDraftFromProfile(profile: ModelProfile): ProfileDraft {
  const preset = getPresetById(profile.presetId) ?? getPresetById('custom') ?? providerPresets[0]

  return createProfileDraft(preset, {
    profileId: profile.id,
    selectedPresetId: preset.id,
    presetId: profile.presetId,
    providerLabel: profile.providerLabel,
    baseUrl: profile.baseUrl,
    model: profile.model,
    apiKey: '',
    sourceUrl: profile.sourceUrl,
    policyNote: null,
    isDefault: profile.isDefault,
    includeAnthropicVersionHeader: profile.includeAnthropicVersionHeader,
  })
}

function applyPresetToDraft(currentDraft: ProfileDraft, preset: ProviderPreset) {
  return createProfileDraft(preset, {
    profileId: currentDraft.profileId,
    apiKey: currentDraft.apiKey,
    isDefault: currentDraft.isDefault,
  })
}

function createProjectDraft(defaultProfileId: string | null): CreateProjectInput {
  return {
    title: '',
    topic: '',
    audience: '',
    wordTarget: 2000,
    mode: 'deep',
    modelProfileId: defaultProfileId ?? '',
    styleProfileId: null,
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function FieldLabel(props: { text: string; required?: boolean }) {
  return (
    <span className="field-label">
      {props.text}
      {props.required ? <span className="required-star">*</span> : null}
    </span>
  )
}

function formatWordCount(wordCount: number | null | undefined) {
  return typeof wordCount === 'number' && wordCount > 0 ? `${wordCount} 字` : '未统计字数'
}

function getArtifactFileName(path: string | null | undefined) {
  if (!path) {
    return null
  }

  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? path
}

function describeUnknownAppError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  if (error && typeof error === 'object') {
    const withMessage = error as { message?: unknown }

    if (typeof withMessage.message === 'string' && withMessage.message.trim()) {
      return withMessage.message
    }

    try {
      return JSON.stringify(error)
    } catch {
      return fallback
    }
  }

  return fallback
}

function normalizeTopicInput(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function deriveProjectTitleFromTopic(topic: string) {
  const normalized = normalizeTopicInput(topic)

  if (!normalized) {
    return '未命名文章'
  }

  const firstSegment =
    normalized
      .split(/[。！？!?；;：:]/)
      .map((segment) => segment.trim())
      .find(Boolean) ?? normalized
  const cleaned = firstSegment.replace(/[“”"'《》【】[\]()（）]/g, '').trim()
  const truncated = Array.from(cleaned).slice(0, 24).join('').trim()

  return truncated || Array.from(normalized).slice(0, 24).join('').trim() || '未命名文章'
}

function shouldRenderProjectTopic(title: string, topic: string) {
  const normalizedTitle = normalizeTopicInput(title)
  const normalizedTopic = normalizeTopicInput(topic)

  if (!normalizedTopic) {
    return false
  }

  if (!normalizedTitle) {
    return true
  }

  if (normalizedTitle === normalizedTopic) {
    return false
  }

  return !normalizedTopic.startsWith(normalizedTitle)
}

function uniqueCandidateValues(values: string[]) {
  return values.filter((value, index) => value && values.indexOf(value) === index)
}

function includesAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword))
}

function deriveAudienceCandidatesFromTopic(topic: string) {
  const normalized = normalizeTopicInput(topic)

  if (!normalized) {
    return []
  }

  const projectTitle = deriveProjectTitleFromTopic(topic)
  const shortTopic = Array.from(projectTitle).slice(0, 12).join('')
  const lowered = normalized.toLowerCase()

  if (
    includesAnyKeyword(lowered, [
      '老板',
      '职场',
      '公司',
      '办公室',
      '打工',
      '上班',
      '领导',
      '同事',
      '升职',
      '汇报',
      '管理',
      '牛马',
    ])
  ) {
    return [
      '刚进职场、还摸不清潜规则的人',
      '已经在公司里吃过闷亏、想把局势看明白的人',
      '带团队或做管理、想理解这类问题的人',
    ]
  }

  if (
    includesAnyKeyword(lowered, [
      'ai',
      '模型',
      '提示词',
      '编程',
      '代码',
      '产品',
      '技术',
      '创业',
      '效率',
      '工具',
      'vibe',
      'coding',
    ])
  ) {
    return [
      '想用新工具提效、但不想看术语堆砌的人',
      '正在做产品、运营或创业，想判断值不值得跟进的人',
      '对技术变化有兴趣、但更关心实际影响的普通从业者',
    ]
  }

  if (
    includesAnyKeyword(lowered, [
      '孩子',
      '家长',
      '老师',
      '教育',
      '学习',
      '学校',
      '高考',
      '中考',
      '作业',
      '培训',
    ])
  ) {
    return [
      '正在为孩子学习发愁、想看明白问题的家长',
      '一线老师和教育从业者',
      '关心教育议题、但不想听空话的普通读者',
    ]
  }

  if (
    includesAnyKeyword(lowered, [
      '情绪',
      '关系',
      '婚姻',
      '恋爱',
      '相亲',
      '心理',
      '焦虑',
      '内耗',
      '家庭',
      '亲密',
    ])
  ) {
    return [
      '正在关系里反复内耗、想看清问题的人',
      '准备进入长期关系、想少踩坑的人',
      '喜欢看真实关系分析、不想听鸡汤的普通读者',
    ]
  }

  if (
    includesAnyKeyword(lowered, [
      '商业',
      '赚钱',
      '副业',
      '生意',
      '销售',
      '营销',
      '客户',
      '流量',
      '变现',
      '品牌',
    ])
  ) {
    return [
      '想把生意讲明白、但不想看空洞方法论的人',
      '正在做业务、销售或副业的人',
      '想先看清利害，再决定要不要跟进的人',
    ]
  }

  return uniqueCandidateValues([
    `对“${shortTopic}”已经有切身感受的人`,
    `已经碰到这个问题、想尽快看明白的人`,
    `想先看清利害，再决定怎么做的人`,
  ]).slice(0, 3)
}

type WorkspaceTone = 'ready' | 'working' | 'warning' | 'error' | 'archived'

interface RuntimeProgressEntry {
  requestId: string
  timestamp: string
  phase: string
  label: string
  detail: string
  rawType: string
  sessionId?: string | null
  partialText?: string | null
  charsGenerated?: number | null
  thinkingEvents?: number | null
}

interface RuntimeTraceState {
  projectId: string | null
  stageKey: StageKey | null
  requestId: string | null
  startedAt: number | null
  entries: RuntimeProgressEntry[]
}

interface StageDeskCopy {
  mission: string
  checklist: string[]
  deliverable: string
  acceptance: string
}

interface StageMaterial {
  stageKey: StageKey
  label: string
  version: number
  summary: string
  wordCount: number
  isCurrentOutput: boolean
}

interface TitleCandidateOption {
  title: string
  angle: string
  hook: string
}

const stageCompanionMap: Record<
  StageKey,
  {
    name: string
    role: string
    summary: string
  }
> = {
  theme: {
    name: '小李',
    role: '需求澄清同事',
    summary: '像编辑部里最会问问题的同事，先把题目、读者和落点锁准。',
  },
  position: {
    name: '大张',
    role: '立场编辑',
    summary: '先把观点站稳，再决定后面该支持什么、反对什么。',
  },
  research: {
    name: '小丽',
    role: '调研同事',
    summary: '把后面写作真正能引用的证据、案例和争议点先拎出来。',
  },
  outline: {
    name: '老周',
    role: '结构编辑',
    summary: '负责把文章的节奏排顺，避免后面一股脑堆内容。',
  },
  titles: {
    name: '阿凯',
    role: '标题策划',
    summary: '专门找入口，确保内容有抓手，不死在标题上。',
  },
  draft: {
    name: '阿文',
    role: '主笔同事',
    summary: '按既定结构把内容真正写成文，不再停留在提纲层。',
  },
  review: {
    name: '陈姐',
    role: '审稿编辑',
    summary: '专门挑结构、逻辑和语气的问题，给出明确修改方案。',
  },
  humanize: {
    name: '阿宁',
    role: '润色同事',
    summary: '负责把腔调拉回真人表达，减少模板味和空话。',
  },
}

const stageDeskMap: Record<StageKey, StageDeskCopy> = {
  theme: {
    mission: '先把题目真正缩成一个可写、可判断、可交付的问题。',
    checklist: [
      '收窄读者范围，别让“所有人都能看”变成谁都打不中。',
      '把真正要回答的问题说死，避免后面越写越散。',
      '确认这篇文章最终要做到什么程度，才算交差。',
    ],
    deliverable: '一份可以直接交给立场和调研阶段的需求澄清稿。',
    acceptance: '你看完后应该能明确知道：写给谁、回答什么、最后打到哪里。',
  },
  position: {
    mission: '把这篇文章到底站哪边、反对什么、避开什么话术先定下来。',
    checklist: [
      '明确中心主张，不能一边写一边摇摆。',
      '列出能支撑这个判断的论据骨架。',
      '划清不采用的说法和不碰的边界。',
    ],
    deliverable: '一份带有明确主张和表达边界的立场说明。',
    acceptance: '看完后，后续每一段材料都知道是为哪条主张服务。',
  },
  research: {
    mission: '把后面真正能写进文里的事实、案例、争议点先整理好。',
    checklist: [
      '提炼可引用的证据和案例，不做空转背景介绍。',
      '补出反方声音和潜在争议，避免文章单薄。',
      '标出仍需补充或需要谨慎处理的空档。',
    ],
    deliverable: '一份可供写稿直接调用的调研整理稿。',
    acceptance: '后面写正文时，不需要再凭空发明论据。',
  },
  outline: {
    mission: '把文章的推进顺序排顺，让每一段都知道自己负责什么。',
    checklist: [
      '先定开头怎么破题，再定主体怎么展开。',
      '每一节都要有明确目标，不是把要点堆成清单。',
      '处理承接关系，避免章节之间像硬拼接。',
    ],
    deliverable: '一份能直接交给写稿阶段落文的大纲。',
    acceptance: '你看完大纲，应该能预判整篇文章的节奏和力度。',
  },
  titles: {
    mission: '替文章找更强的入口，让内容别死在标题上。',
    checklist: [
      '至少试出几种不同入口，不把希望押在一个标题上。',
      '区分结论先行、问题切入、案例切入等不同打法。',
      '挑出最适合当前读者和平台的主标题方向。',
    ],
    deliverable: '一组可比较、可挑选、可直接上手的标题方案。',
    acceptance: '你看标题时，应该能明显感到每种方案的抓手差异。',
  },
  draft: {
    mission: '把结构真正写成文，不再停留在大纲和要点层。',
    checklist: [
      '按既定结构完整展开，不缺引子、主体和收束。',
      '把调研材料真正落进段落，而不是摆在边上。',
      '先保证主论证链打通，再考虑局部润色。',
    ],
    deliverable: '一版完整初稿，可以进入审稿或去模板化处理。',
    acceptance: '这版读起来应该已经像一篇文章，而不是材料拼盘。',
  },
  review: {
    mission: '像编辑一样挑问题，不讲空话，只给能执行的修改方案。',
    checklist: [
      '拆出结构、逻辑、节奏和语言上的主要毛病。',
      '区分什么是小修，什么必须重写。',
      '把修改建议排出先后顺序，方便回炉。',
    ],
    deliverable: '一份带优先级的审稿修订意见。',
    acceptance: '你看完应该知道要改什么、先改什么、为什么改。',
  },
  humanize: {
    mission: '把腔调拉回真人表达，清掉模板味、套话和过度工整。',
    checklist: [
      '去掉空泛衔接词和明显的模型套句。',
      '调整句长、停顿和语气，让人读起来更像真人。',
      '做最后一轮封版检查，避免终稿再掉回“AI腔”。',
    ],
    deliverable: '一版可以直接交付的最终稿。',
    acceptance: '终稿应该自然、有判断、有信息密度，不再像模板拼装。 ',
  },
}

function buildMaterialSnippet(markdown: string) {
  return markdown.replace(/\s+/g, ' ').trim().slice(0, 92)
}

function escapeHtml(raw: string) {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInlineMarkdown(markdown: string) {
  return escapeHtml(markdown)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function renderMarkdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let inCodeBlock = false
  let codeLines: string[] = []
  let listMode: 'ul' | 'ol' | null = null

  const closeList = () => {
    if (listMode) {
      html.push(`</${listMode}>`)
      listMode = null
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      closeList()
      if (inCodeBlock) {
        html.push(`<pre><code>${codeLines.join('\n')}</code></pre>`)
        codeLines = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(escapeHtml(line))
      continue
    }

    if (!trimmed) {
      closeList()
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      closeList()
      const level = headingMatch[1].length
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`)
      continue
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/)
    if (unorderedMatch) {
      if (listMode !== 'ul') {
        closeList()
        html.push('<ul>')
        listMode = 'ul'
      }
      html.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`)
      continue
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/)
    if (orderedMatch) {
      if (listMode !== 'ol') {
        closeList()
        html.push('<ol>')
        listMode = 'ol'
      }
      html.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`)
      continue
    }

    const quoteMatch = trimmed.match(/^>\s?(.*)$/)
    if (quoteMatch) {
      closeList()
      html.push(`<blockquote><p>${renderInlineMarkdown(quoteMatch[1])}</p></blockquote>`)
      continue
    }

    closeList()
    html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`)
  }

  closeList()

  if (inCodeBlock) {
    html.push(`<pre><code>${codeLines.join('\n')}</code></pre>`)
  }

  return html.join('')
}

function getStageMaterials(
  detail: ProjectDetail,
  stageKey = detail.currentStage,
  options?: { includeCurrentOutput?: boolean },
): StageMaterial[] {
  const sequence = getStageSequence(detail.mode)
  const currentIndex = sequence.indexOf(stageKey)

  if (currentIndex <= 0) {
    if (!options?.includeCurrentOutput) {
      return []
    }
  }

  const stageKeys = sequence.slice(0, Math.max(0, currentIndex))

  if (options?.includeCurrentOutput) {
    stageKeys.push(stageKey)
  }

  return stageKeys
    .map((stageKey) => {
      const output = getLatestStageOutput(detail.outputs, stageKey)

      if (!output) {
        return null
      }

      return {
        stageKey,
        label: getCurrentStageDefinition(detail.mode, stageKey).label,
        version: output.version,
        summary: output.summary ?? buildMaterialSnippet(output.markdown),
        wordCount: output.wordCount,
        isCurrentOutput: options?.includeCurrentOutput ? stageKey === detail.currentStage : false,
      }
    })
    .filter((item): item is StageMaterial => Boolean(item))
    .slice(-4)
}

function getTitleCandidates(structured: unknown): TitleCandidateOption[] {
  if (!structured || typeof structured !== 'object') {
    return []
  }

  const maybeCandidates = (structured as { candidates?: unknown }).candidates

  if (!Array.isArray(maybeCandidates)) {
    return []
  }

  return maybeCandidates
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const candidate = item as Record<string, unknown>

      if (
        typeof candidate.title !== 'string' ||
        typeof candidate.angle !== 'string' ||
        typeof candidate.hook !== 'string'
      ) {
        return null
      }

      return {
        title: candidate.title,
        angle: candidate.angle,
        hook: candidate.hook,
      }
    })
    .filter((item): item is TitleCandidateOption => Boolean(item))
}

function getSelectedTitleIndex(structured: unknown) {
  if (!structured || typeof structured !== 'object') {
    return null
  }

  const selected = (structured as { selected?: unknown }).selected
  return typeof selected === 'number' ? selected : null
}

function getQuickSuggestions(stageKey: StageKey, structured: unknown) {
  if (!structured || typeof structured !== 'object') {
    return []
  }

  const value = structured as Record<string, unknown>

  const pickStringArray = (field: string) =>
    Array.isArray(value[field])
      ? value[field].filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        )
      : []

  const unique = (items: string[]) => Array.from(new Set(items))

  switch (stageKey) {
    case 'theme':
      return unique([
        ...pickStringArray('angleOptions'),
        ...(typeof value.nextFocus === 'string' && value.nextFocus.trim()
          ? [`下一步重点：${value.nextFocus.trim()}`]
          : []),
      ])
    case 'draft':
      return unique([
        ...pickStringArray('revisionFocus'),
        ...pickStringArray('sectionsCompleted').map((item) => `保留并强化：${item}`),
      ])
    case 'review':
      return unique([
        ...pickStringArray('revisionPlan'),
        ...pickStringArray('issues').map((item) => `优先修：${item}`),
      ])
    case 'humanize':
      return unique([...pickStringArray('voiceAdjustments'), ...pickStringArray('finalChecks')])
    default:
      return []
  }
}

function describeRuntimeEntryForUser(
  entry: RuntimeProgressEntry,
  companion: { name: string; role: string },
) {
  switch (entry.phase) {
    case 'session_init':
      return {
        title: `${companion.name} 已接手这一步`,
        body: `${companion.name} 已经收到你的题目和上下文，准备开始处理。`,
      }
    case 'message_start':
      return {
        title: `${companion.name} 开始动手了`,
        body: `${companion.name} 已正式进入这一轮生成，不再只是等待。`,
      }
    case 'thinking':
      return {
        title: `${companion.name} 正在捋思路`,
        body:
          typeof entry.thinkingEvents === 'number'
            ? `${companion.name} 还在内部来回推敲，这一轮已经反复斟酌了 ${entry.thinkingEvents} 次。`
            : `${companion.name} 还在内部整理思路，暂时还没开始往外写。`,
      }
    case 'writing_start':
      return {
        title: `${companion.name} 开始落字`,
        body: `${companion.name} 已经从内部推敲切到正文输出，这一轮开始真正成稿。`,
      }
    case 'writing':
      return {
        title: `${companion.name} 正在写这一版`,
        body:
          typeof entry.charsGenerated === 'number'
            ? `${companion.name} 这一轮已经写到约 ${entry.charsGenerated} 个字符。`
            : `${companion.name} 正在持续输出正文。`,
      }
    case 'assistant':
      return {
        title: `${companion.name} 交出了一版可读稿`,
        body: `${companion.name} 已经把内容整理成完整段落，现在这版已经可以审。`,
      }
    case 'message_stop':
      return {
        title: `${companion.name} 这一轮已经收笔`,
        body: `${companion.name} 本轮输出结束，正在准备把最终结果交回来。`,
      }
    case 'completed':
      return {
        title: `${companion.name} 已完成这一步`,
        body: `${companion.name} 已经把这一阶段的结果交回来了，你现在可以继续审阅、批注或手改。`,
      }
    default:
      return {
        title: `${companion.name} 正在处理`,
        body: entry.detail,
      }
  }
}

function describeRuntimeWaitingState(
  elapsedMs: number,
  companion: { name: string; role: string },
  stageKey: StageKey,
  stageLabel: string,
) {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const busyCopyMap: Record<StageKey, string> = {
    theme: '正在把题目、读者和要回答的问题压成一个真正能写的口子。',
    position: '正在把文章立场和核心判断掐准，避免后面一路写散。',
    research: '正在把前两步的判断拆成可用证据、案例和争议点。',
    outline: '正在给材料排顺序，先把骨架搭稳，再决定段落推进。',
    titles: '正在试不同标题入口，找最能带出这篇文章力度的那个。',
    draft: '正在把骨架和材料串成正文，先做出一版完整能读的稿。',
    review: '正在像编辑一样挑问题，分清哪些地方该小修，哪些该重写。',
    humanize: '正在把腔调往真人表达上拉，清掉模板味、套话和空转句子。',
  }
  const busyCopy = busyCopyMap[stageKey]

  if (elapsedSeconds < 3) {
    return {
      title: `${companion.name} 正在接稿`,
      body: `${companion.name} 正在把这一步要写的题目、读者和阶段要求接完整，马上就会开始动笔。`,
      elapsedText: `${companion.name} 已忙 ${elapsedSeconds} 秒`,
    }
  }

  if (elapsedSeconds < 8) {
    return {
      title: `${companion.name} 正在整理前序材料`,
      body: `${companion.name} ${busyCopy}`,
      elapsedText: `${companion.name} 已忙 ${elapsedSeconds} 秒`,
    }
  }

  if (elapsedSeconds < 15) {
    return {
      title: `${companion.name} 正在憋第一版`,
      body: `${companion.name} 正在把这一轮 ${stageLabel} 往成稿方向收，马上就会有结果。`,
      elapsedText: `${companion.name} 已忙 ${elapsedSeconds} 秒`,
    }
  }

  return {
    title: `${companion.name} 这一轮还在写`,
    body: `${companion.name} 还在继续处理这一轮 ${stageLabel}，现在先不用操作。`,
    elapsedText: `${companion.name} 已忙 ${elapsedSeconds} 秒`,
  }
}

function getWorkspaceStatus(
  stateValue: string,
  hasOutput: boolean,
  hasError: boolean,
  isCompleted: boolean,
  isArchived: boolean,
  isInterruptedStage: boolean,
) {
  const normalized = stateValue.toLowerCase()

  if (isArchived) {
    return {
      tone: 'archived' as WorkspaceTone,
      title: '这个项目已归档',
      description: '归档项目默认只读。要继续往下写，先恢复到活跃项目。',
    }
  }

  if (hasError || normalized.includes('failure')) {
    return {
      tone: 'error' as WorkspaceTone,
      title: '这一步没跑通',
      description: '已经停下来等你决定。你可以直接重试，或者先给修改要求再重写。',
    }
  }

  if (normalized.includes('loading')) {
    return {
      tone: 'working' as WorkspaceTone,
      title: '正在载入项目',
      description: '先把这个项目的最新版本和阶段记录取回来。',
    }
  }

  if (normalized.includes('generating')) {
    return {
      tone: 'working' as WorkspaceTone,
      title: '正在生成这一阶段',
      description: '当前写作同事正在处理材料、起草内容，并把结果整理成你能直接审的版本。',
    }
  }

  if (normalized.includes('advancing')) {
    return {
      tone: 'working' as WorkspaceTone,
      title: '正在推进到下一步',
      description: '当前版本已确认，系统正在更新阶段指针。',
    }
  }

  if (normalized.includes('handoff')) {
    return {
      tone: 'working' as WorkspaceTone,
      title: '正在交给下一位同事',
      description: '当前版本已经确认，下一阶段会自动开始，不需要你再点一次生成。',
    }
  }

  if (normalized.includes('rewinding')) {
    return {
      tone: 'working' as WorkspaceTone,
      title: '正在回炉到前一阶段',
      description: '系统正在把项目切回你指定的工位，方便重新加工。',
    }
  }

  if (normalized.includes('finalizing')) {
    return {
      tone: 'working' as WorkspaceTone,
      title: '正在确认终稿',
      description: '终稿已经确认，系统正在把最终稿写入项目目录。',
    }
  }

  if (normalized.includes('export')) {
    return {
      tone: 'working' as WorkspaceTone,
      title: '正在导出',
      description: '把当前项目整理成你可以直接拿走的 Markdown 成稿。',
    }
  }

  if (isCompleted && hasOutput) {
    return {
      tone: 'ready' as WorkspaceTone,
      title: '终稿已完成',
      description: '你现在可以继续润色，或者把项目打回上一阶段重新回炉。',
    }
  }

  if (isInterruptedStage) {
    return {
      tone: 'warning' as WorkspaceTone,
      title: '这一轮上次停住了',
      description: '上次已经交接到这一步，但这一轮还没交稿。直接点下面“继续这一轮”即可恢复。',
    }
  }

  if (hasOutput) {
    return {
      tone: 'ready' as WorkspaceTone,
      title: '这一阶段已完成',
      description: '先看这版方向对不对。方向对，就拉到最下面确认并交给下一环节；不对，就在下面补要求后重写。',
    }
  }

  return {
    tone: 'warning' as WorkspaceTone,
    title: '这一步还没开始',
    description: '先生成一个初版，再决定要不要调整。',
  }
}

function shouldOfferResumeCurrentStage(detail: ProjectDetail | null, hasOutput: boolean) {
  if (!detail || hasOutput || detail.isArchived || detail.status === 'completed') {
    return false
  }

  const stages = getStageSequence(detail.mode)
  const currentIndex = stages.findIndex((stageKey) => stageKey === detail.currentStage)

  if (currentIndex <= 0) {
    return false
  }

  return stages
    .slice(0, currentIndex)
    .some((stageKey) => Boolean(getLatestStageOutput(detail.outputs, stageKey)))
}

function App() {
  const [appSnapshot, sendApp] = useMachine(appMachine)
  const [projectSnapshot, sendProject] = useMachine(projectMachine)
  const boot = appSnapshot.context.boot
  const profiles = boot?.profiles ?? []
  const projects = boot?.projects ?? []
  const activeProjects = projects.filter((project) => !project.isArchived)
  const archivedProjects = projects.filter((project) => project.isArchived)
  const defaultProfileId = profiles.find((profile) => profile.isDefault)?.id ?? null

  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() =>
    createProfileDraft(providerPresets[0]),
  )
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [profileTestResult, setProfileTestResult] = useState<ConnectionHealthResult | null>(null)
  const [profileBusy, setProfileBusy] = useState<'idle' | 'testing' | 'saving'>('idle')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [defaultProfileBusyId, setDefaultProfileBusyId] = useState<string | null>(null)
  const [projectProfileBusy, setProjectProfileBusy] = useState(false)

  const [projectDraft, setProjectDraft] = useState<CreateProjectInput>(() =>
    createProjectDraft(defaultProfileId),
  )
  const [projectBusy, setProjectBusy] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [projectToast, setProjectToast] = useState<{
    tone: 'success' | 'error'
    text: string
  } | null>(null)
  const [archivingProjectId, setArchivingProjectId] = useState<string | null>(null)
  const [restoringProjectId, setRestoringProjectId] = useState<string | null>(null)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [pendingAutoStartProjectId, setPendingAutoStartProjectId] = useState<string | null>(null)
  const [workspaceRootDraft, setWorkspaceRootDraft] = useState('')
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [workspaceMessage, setWorkspaceMessage] = useState<{
    tone: 'success' | 'error'
    text: string
  } | null>(null)
  const [runtimeTrace, setRuntimeTrace] = useState<RuntimeTraceState>({
    projectId: null,
    stageKey: null,
    requestId: null,
    startedAt: null,
    entries: [],
  })
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now())
  const appReady = appSnapshot.matches('ready')
  const activeProjectId = appSnapshot.context.activeProjectId
  const workspaceSettings = boot?.workspaceSettings ?? null
  const workspaceLoadProjectId =
    appReady && appSnapshot.context.view === 'workspace' ? activeProjectId : null

  useEffect(() => {
    if (workspaceLoadProjectId) {
      sendProject({
        type: 'LOAD',
        projectId: workspaceLoadProjectId,
      })
    }
  }, [workspaceLoadProjectId, sendProject])

  useEffect(() => {
    if (!projectToast) {
      return
    }

    const timeout = window.setTimeout(() => {
      setProjectToast(null)
    }, 2200)

    return () => window.clearTimeout(timeout)
  }, [projectToast])

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) {
      return
    }

    let isMounted = true
    let cleanup: (() => void) | undefined

    void listen<RuntimeProgressEntry>('writing-runtime-progress', (event) => {
      if (!isMounted) {
        return
      }

      const payload = event.payload

      setRuntimeTrace((current) => {
        if (!current.requestId || current.requestId !== payload.requestId) {
          return current
        }

        const nextEntries = [...current.entries]
        const lastEntry = nextEntries.at(-1)

        if (
          lastEntry &&
          lastEntry.phase === payload.phase &&
          (payload.phase === 'thinking' || payload.phase === 'writing')
        ) {
          nextEntries[nextEntries.length - 1] = payload
        } else {
          nextEntries.push(payload)
        }

        return {
          projectId: current.projectId,
          stageKey: current.stageKey,
          requestId: current.requestId,
          startedAt: current.startedAt,
          entries: nextEntries,
        }
      })
    }).then((unlisten) => {
      cleanup = unlisten
    })

    return () => {
      isMounted = false
      cleanup?.()
    }
  }, [])

  useEffect(() => {
    setRuntimeTrace({
      projectId: null,
      stageKey: null,
      requestId: null,
      startedAt: null,
      entries: [],
    })
  }, [workspaceLoadProjectId])

  useEffect(() => {
    const detail = projectSnapshot.context.detail

    if (!detail) {
      return
    }

    setRuntimeTrace((current) => {
      if (!current.requestId) {
        return current
      }

      if (current.projectId !== detail.id) {
        return {
          projectId: null,
          stageKey: null,
          requestId: null,
          startedAt: null,
          entries: [],
        }
      }

      if (current.stageKey !== detail.currentStage && projectSnapshot.matches('ready')) {
        return {
          projectId: null,
          stageKey: null,
          requestId: null,
          startedAt: null,
          entries: [],
        }
      }

      return current
    })
  }, [projectSnapshot, projectSnapshot.context.detail])

  useEffect(() => {
    if (!runtimeTrace.requestId || runtimeTrace.entries.length > 0) {
      return
    }

    const timer = window.setInterval(() => {
      setRuntimeNow(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [runtimeTrace.entries.length, runtimeTrace.requestId])

  useEffect(() => {
    if (defaultProfileId && !projectDraft.modelProfileId) {
      setProjectDraft((current) => ({
        ...current,
        modelProfileId: defaultProfileId,
      }))
    }
  }, [defaultProfileId, projectDraft.modelProfileId])

  useEffect(() => {
    if (!workspaceSettings) {
      return
    }

    setWorkspaceRootDraft(workspaceSettings.usesDefault ? '' : workspaceSettings.rootPath)
  }, [workspaceSettings])

  useEffect(() => {
    const detail = projectSnapshot.context.detail

    if (!detail) {
      return
    }

    sendApp({
      type: 'SYNC_PROJECT',
      project: projectToSummary(detail),
    })
  }, [projectSnapshot.context.detail, sendApp])

  const activePreset = useMemo(
    () => getPresetById(profileDraft.selectedPresetId) ?? providerPresets[0],
    [profileDraft.selectedPresetId],
  )
  const editingProfile =
    editingProfileId ? profiles.find((profile) => profile.id === editingProfileId) ?? null : null
  const isEditingProfile = Boolean(editingProfile)

  const activeProject = projectSnapshot.context.detail
  const activeView = appSnapshot.context.view
  const activeProjectSummary =
    activeProjectId ? projects.find((project) => project.id === activeProjectId) ?? null : null
  const visibleRuntimeEntries =
    activeProject && runtimeTrace.projectId === activeProject.id ? runtimeTrace.entries : []
  const runtimeWaitingState =
    activeProject &&
    runtimeTrace.projectId === activeProject.id &&
    runtimeTrace.requestId &&
    runtimeTrace.entries.length === 0 &&
    runtimeTrace.startedAt &&
    !projectSnapshot.matches('ready') &&
    !projectSnapshot.matches('failure')
      ? describeRuntimeWaitingState(
          runtimeNow - runtimeTrace.startedAt,
          stageCompanionMap[runtimeTrace.stageKey ?? activeProject.currentStage],
          runtimeTrace.stageKey ?? activeProject.currentStage,
          getCurrentStageDefinition(activeProject.mode, runtimeTrace.stageKey ?? activeProject.currentStage)
            .label,
        )
      : null

  const beginStageGeneration = useCallback((project: ProjectDetail, note?: string) => {
    if (project.isArchived) {
      setProjectError('归档项目默认只读，先恢复到活跃项目，再继续生成新阶段。')
      return
    }

    const requestId = crypto.randomUUID()

    setRuntimeTrace({
      projectId: project.id,
      stageKey: project.currentStage,
      requestId,
      startedAt: Date.now(),
      entries: [],
    })

    sendProject({ type: 'GENERATE', note, requestId })
  }, [sendProject])

  useEffect(() => {
    if (!pendingAutoStartProjectId || !activeProject || !projectSnapshot.matches('ready')) {
      return
    }

    if (activeProject.id !== pendingAutoStartProjectId) {
      return
    }

    const firstStageKey = getStageSequence(activeProject.mode)[0]
    const hasCurrentOutput = Boolean(
      getLatestStageOutput(activeProject.outputs, activeProject.currentStage),
    )

    if (activeProject.currentStage !== firstStageKey || hasCurrentOutput) {
      setPendingAutoStartProjectId(null)
      return
    }

    beginStageGeneration(activeProject)
    setPendingAutoStartProjectId(null)
  }, [activeProject, beginStageGeneration, pendingAutoStartProjectId, projectSnapshot])

  async function handleTestProfile() {
    const hasApiKey = profileDraft.apiKey.trim().length > 0 || Boolean(profileDraft.profileId)

    if (!profileDraft.providerLabel || !profileDraft.baseUrl || !profileDraft.model || !hasApiKey) {
      setProfileError('服务商名称、Base URL、Model 不能为空。编辑已有配置时，API Key 可以留空以继续使用原值。')
      return
    }

    setProfileBusy('testing')
    setProfileError(null)

    try {
      const result = await appApi.healthCheckProfile(profileDraft)
      setProfileTestResult(result)
    } catch (error) {
      setProfileTestResult(null)
      setProfileError(error instanceof Error ? error.message : '连接测试失败')
    } finally {
      setProfileBusy('idle')
    }
  }

  async function handleSaveProfile() {
    const hasApiKey = profileDraft.apiKey.trim().length > 0 || Boolean(profileDraft.profileId)

    if (!profileDraft.providerLabel || !profileDraft.baseUrl || !profileDraft.model || !hasApiKey) {
      setProfileError('服务商名称、Base URL、Model 不能为空。编辑已有配置时，API Key 可以留空以继续使用原值。')
      return
    }

    setProfileBusy('saving')
    setProfileError(null)

    try {
      const savedProfile = await appApi.saveModelProfile({
        ...profileDraft,
        isDefault: profiles.length === 0 ? true : profileDraft.isDefault,
      })
      setEditingProfileId(null)
      setProfileDraft(createProfileDraft(providerPresets[0], { isDefault: profiles.length === 0 }))
      setProfileTestResult(null)
      setProjectDraft((current) => ({
        ...current,
        modelProfileId:
          !current.modelProfileId ||
          current.modelProfileId === editingProfileId ||
          savedProfile.isDefault
            ? savedProfile.id
            : current.modelProfileId,
      }))
      startTransition(() => {
        sendApp({ type: 'RELOAD', view: profiles.length === 0 ? 'home' : 'settings' })
      })
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '保存配置失败')
    } finally {
      setProfileBusy('idle')
    }
  }

  async function handleCreateProject() {
    if (!projectDraft.topic || !projectDraft.audience) {
      setProjectError('你想写啥和目标读者不能为空。先点一个候选读者，或者自己填一个。')
      return
    }

    if (!projectDraft.modelProfileId) {
      setProjectError('请先选择模型配置。')
      return
    }

    setProjectBusy(true)
    setProjectError(null)

    try {
      const created = await appApi.createProject({
        ...projectDraft,
        title: deriveProjectTitleFromTopic(projectDraft.topic),
      })
      setProjectDraft(createProjectDraft(defaultProfileId))
      setPendingAutoStartProjectId(created.id)
      startTransition(() => {
        sendApp({
          type: 'RELOAD',
          view: 'workspace',
          activeProjectId: created.id,
        })
      })
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : '创建项目失败')
    } finally {
      setProjectBusy(false)
    }
  }

  function handleOpenNewProfile() {
    setEditingProfileId(null)
    setProfileDraft(createProfileDraft(providerPresets[0], { isDefault: profiles.length === 0 }))
    setProfileTestResult(null)
    setProfileError(null)
    sendApp({ type: 'NAVIGATE', view: 'onboarding' })
  }

  function handleEditProfile(profile: ModelProfile) {
    setEditingProfileId(profile.id)
    setProfileDraft(createProfileDraftFromProfile(profile))
    setProfileTestResult(null)
    setProfileError(null)
    sendApp({ type: 'NAVIGATE', view: 'onboarding' })
  }

  function openWorkspaceCreate() {
    setProjectError(null)
    sendApp({ type: 'OPEN_WORKSPACE_CREATE' })
  }

  async function handleOpenExternal(url: string) {
    try {
      await appApi.openExternalUrl(url)
    } catch (error) {
      setProfileError(describeUnknownAppError(error, '打开外部链接失败'))
    }
  }

  async function handleSetDefaultProfile(profileId: string) {
    setDefaultProfileBusyId(profileId)
    setProjectToast(null)

    try {
      const updated = await appApi.setDefaultModelProfile(profileId)
      setProjectDraft((current) => ({
        ...current,
        modelProfileId:
          !current.modelProfileId || current.modelProfileId === defaultProfileId
            ? updated.id
            : current.modelProfileId,
      }))
      setProjectToast({
        tone: 'success',
        text: `已切换默认配置：${updated.providerLabel} / ${updated.model}`,
      })
      startTransition(() => {
        sendApp({ type: 'RELOAD', view: 'settings' })
      })
    } catch (error) {
      setProjectToast({
        tone: 'error',
        text: describeUnknownAppError(error, '切换默认配置失败'),
      })
    } finally {
      setDefaultProfileBusyId(null)
    }
  }

  async function handleChangeProjectProfile(projectId: string, modelProfileId: string) {
    if (!modelProfileId) {
      return
    }

    setProjectProfileBusy(true)
    setProjectError(null)
    setProjectToast(null)

    try {
      const updated = await appApi.updateProjectModelProfile({
        projectId,
        modelProfileId,
      })
      const nextProfile = profiles.find((profile) => profile.id === modelProfileId) ?? null

      setRuntimeTrace({
        projectId: null,
        stageKey: null,
        requestId: null,
        startedAt: null,
        entries: [],
      })

      sendApp({
        type: 'SYNC_PROJECT',
        project: projectToSummary(updated),
      })
      sendProject({ type: 'LOAD', projectId: updated.id })
      setProjectToast({
        tone: 'success',
        text: nextProfile
          ? `这篇项目已切换到 ${nextProfile.providerLabel} / ${nextProfile.model}。`
          : '这篇项目的运行配置已更新。',
      })
    } catch (error) {
      setProjectToast({
        tone: 'error',
        text: describeUnknownAppError(error, '更新项目运行配置失败'),
      })
    } finally {
      setProjectProfileBusy(false)
    }
  }

  async function handleDeleteProject(project: ProjectSummary) {
    const confirmed = window.confirm(
      `确认删除项目“${project.title}”？\n\n会同时删除这个项目的阶段稿、导出稿和项目目录，不能恢复。`,
    )

    if (!confirmed) {
      return
    }

    setDeletingProjectId(project.id)
    setProjectError(null)

    try {
      await appApi.deleteProject(project.id)

      if (activeProject?.id === project.id) {
        setRuntimeTrace({
          projectId: null,
          stageKey: null,
          requestId: null,
          startedAt: null,
          entries: [],
        })
      }

      startTransition(() => {
        sendApp({
          type: 'RELOAD',
          view: 'home',
          activeProjectId: activeProjectId === project.id ? null : activeProjectId,
        })
      })
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : '删除项目失败')
    } finally {
      setDeletingProjectId(null)
    }
  }

  async function handleArchiveProject(project: ProjectSummary) {
    const confirmed = window.confirm(
      `确认归档项目“${project.title}”？\n\n归档后它会从项目总览移走，只能在“归档”页面查看或恢复。`,
    )

    if (!confirmed) {
      return
    }

    setArchivingProjectId(project.id)
    setProjectError(null)
    setProjectToast(null)

    try {
      const archived = await appApi.archiveProject(project.id)

      if (activeProject?.id === project.id) {
        setRuntimeTrace({
          projectId: null,
          stageKey: null,
          requestId: null,
          startedAt: null,
          entries: [],
        })
      }

      startTransition(() => {
        sendApp({
          type: 'RELOAD',
          view: 'home',
          activeProjectId: activeProjectId === archived.id ? null : activeProjectId,
        })
      })
      setProjectToast({
        tone: 'success',
        text: `“${archived.title}”已归档，可稍后在“归档”页查看。`,
      })
    } catch (error) {
      setProjectError(describeUnknownAppError(error, '归档项目失败'))
    } finally {
      setArchivingProjectId(null)
    }
  }

  async function handleRestoreProject(project: ProjectSummary, view: 'archive' | 'workspace' | 'home' = 'archive') {
    setRestoringProjectId(project.id)
    setProjectError(null)

    try {
      const restored = await appApi.restoreProject(project.id)

      startTransition(() => {
        sendApp({
          type: 'RELOAD',
          view,
          activeProjectId: view === 'workspace' ? restored.id : null,
        })
      })
    } catch (error) {
      setProjectError(describeUnknownAppError(error, '恢复项目失败'))
    } finally {
      setRestoringProjectId(null)
    }
  }

  async function handleSaveWorkspaceSettings() {
    setWorkspaceBusy(true)
    setWorkspaceMessage(null)

    try {
      await appApi.saveWorkspaceSettings({
        rootPath: workspaceRootDraft.trim() || null,
      })
      setWorkspaceMessage({
        tone: 'success',
        text: workspaceRootDraft.trim()
          ? '项目主目录已更新，后续新项目会写到这个目录下。'
          : '已恢复默认工作区目录，后续新项目会写到默认 workspace 下。',
      })
      startTransition(() => {
        sendApp({ type: 'RELOAD', view: 'settings', activeProjectId })
      })
    } catch (error) {
      setWorkspaceMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '保存工作区目录失败',
      })
    } finally {
      setWorkspaceBusy(false)
    }
  }

  async function handleManualStageSave(detail: ProjectDetail, markdown: string) {
    const activeStage = getCurrentStageDefinition(detail.mode, detail.currentStage)
    const activeOutput = getLatestStageOutput(detail.outputs, detail.currentStage)

    await appApi.saveStageOutput({
      projectId: detail.id,
      stageKey: detail.currentStage,
      artifactName: activeStage.artifactName,
      markdown,
      structured: activeOutput?.structured ?? { source: 'manual-edit' },
      rawText: activeOutput?.rawText ?? markdown,
      summary: activeOutput?.summary ?? '人工修订版本',
      usage: null,
    })

    sendProject({
      type: 'LOAD',
      projectId: detail.id,
    })
  }

  function renderContent() {
    if (appSnapshot.matches('booting')) {
      return <section className="panel hero-panel">正在初始化桌面工作区和本地数据库…</section>
    }

    if (appSnapshot.matches('error')) {
      return (
        <section className="panel stack">
          <h2>启动失败</h2>
          <p className="muted">{appSnapshot.context.error}</p>
          <button className="primary-button" onClick={() => sendApp({ type: 'RELOAD' })}>
            重新加载
          </button>
        </section>
      )
    }

    if (!boot) {
      return null
    }

    if (activeView === 'onboarding') {
      return (
        <OnboardingView
          activePreset={activePreset}
          draft={profileDraft}
          error={profileError}
          busy={profileBusy}
          testResult={profileTestResult}
          isEditing={isEditingProfile}
          canKeepExistingApiKey={Boolean(profileDraft.profileId)}
          defaultLocked={Boolean(editingProfile?.isDefault)}
          onSelectPreset={(preset) => {
            setProfileDraft((current) => applyPresetToDraft(current, preset))
            setProfileError(null)
            setProfileTestResult(null)
          }}
          onChange={(field, value) =>
            setProfileDraft((current) => ({
              ...current,
              [field]: value,
            }))
          }
          onOpenExternal={handleOpenExternal}
          onTest={handleTestProfile}
          onSave={handleSaveProfile}
        />
      )
    }

    if (activeView === 'workspace-new') {
      return (
        <WorkspaceStartView
          profiles={profiles}
          draft={projectDraft}
          busy={projectBusy}
          error={projectError}
          workspaceSettings={workspaceSettings}
          activeProject={activeProjectSummary && !activeProjectSummary.isArchived ? activeProjectSummary : null}
          onChangeDraft={(field, value) =>
            setProjectDraft((current) => ({
              ...current,
              [field]: value,
            }))
          }
          onCreateProject={handleCreateProject}
          onOpenSettings={() => sendApp({ type: 'NAVIGATE', view: 'settings' })}
          onResumeProject={(projectId) => sendApp({ type: 'OPEN_PROJECT', projectId })}
        />
      )
    }

    if (activeView === 'workspace') {
      if (!activeProject) {
        return (
          <WorkspaceStartView
            profiles={profiles}
            draft={projectDraft}
            busy={projectBusy}
            error={projectError}
            workspaceSettings={workspaceSettings}
            activeProject={activeProjectSummary && !activeProjectSummary.isArchived ? activeProjectSummary : null}
            onChangeDraft={(field, value) =>
              setProjectDraft((current) => ({
                ...current,
                [field]: value,
              }))
            }
            onCreateProject={handleCreateProject}
            onOpenSettings={() => sendApp({ type: 'NAVIGATE', view: 'settings' })}
            onResumeProject={(projectId) => sendApp({ type: 'OPEN_PROJECT', projectId })}
          />
        )
      }

      return (
        <WorkspaceView
          detail={activeProject}
          profiles={profiles}
          projectProfile={profiles.find((profile) => profile.id === activeProject.modelProfileId) ?? null}
          projectProfileBusy={projectProfileBusy}
          error={projectSnapshot.context.error}
          exportPath={projectSnapshot.context.lastExportPath}
          stateValue={String(projectSnapshot.value)}
          isBusy={!projectSnapshot.matches('ready') && !projectSnapshot.matches('failure')}
          runtimeStageKey={runtimeTrace.stageKey}
          runtimeEntries={visibleRuntimeEntries}
          runtimeWaitingState={runtimeWaitingState}
          onRefresh={() => sendProject({ type: 'REFRESH' })}
          onGenerate={(note) => {
            if (!activeProject) {
              return
            }

            beginStageGeneration(activeProject, note)
          }}
          onAcceptAndContinue={(note) => {
            if (!activeProject) {
              return
            }

            const nextStage = getNextStageKey(activeProject.mode, activeProject.currentStage)

            if (!nextStage) {
              return
            }

            const requestId = crypto.randomUUID()

            setRuntimeTrace({
              projectId: activeProject.id,
              stageKey: nextStage,
              requestId,
              startedAt: Date.now(),
              entries: [],
            })

            sendProject({ type: 'ACCEPT_AND_CONTINUE', requestId, note })
          }}
          onCompleteProject={() => {
            setRuntimeTrace({
              projectId: null,
              stageKey: null,
              requestId: null,
              startedAt: null,
              entries: [],
            })
            sendProject({ type: 'COMPLETE_PROJECT' })
          }}
          onExport={() => sendProject({ type: 'EXPORT' })}
          onReopenStage={(stageKey) => {
            setRuntimeTrace({
              projectId: null,
              stageKey: null,
              requestId: null,
              startedAt: null,
              entries: [],
            })
            sendProject({ type: 'REOPEN_STAGE', stageKey })
          }}
          onManualSave={handleManualStageSave}
          onChangeProjectProfile={(modelProfileId) => {
            if (!activeProject) {
              return
            }

            void handleChangeProjectProfile(activeProject.id, modelProfileId)
          }}
          onRestoreProject={() => {
            if (!activeProject) {
              return
            }

            void handleRestoreProject(projectToSummary(activeProject), 'workspace')
          }}
        />
      )
    }

    if (activeView === 'archive') {
      return (
        <ArchiveView
          projects={archivedProjects}
          deletingProjectId={deletingProjectId}
          restoringProjectId={restoringProjectId}
          error={projectError}
          onDeleteProject={handleDeleteProject}
          onOpenProject={(projectId) => sendApp({ type: 'OPEN_PROJECT', projectId })}
          onRestoreProject={(project) => handleRestoreProject(project)}
        />
      )
    }

    if (activeView === 'styles') {
      return <StylesView onOpenSettings={() => sendApp({ type: 'NAVIGATE', view: 'settings' })} />
    }

    if (activeView === 'settings') {
      return (
        <SettingsView
          profiles={profiles}
          workspaceSettings={workspaceSettings}
          workspaceRootDraft={workspaceRootDraft}
          workspaceBusy={workspaceBusy}
          workspaceMessage={workspaceMessage}
          switchingDefaultProfileId={defaultProfileBusyId}
          onChangeWorkspaceRoot={setWorkspaceRootDraft}
          onSaveWorkspaceSettings={handleSaveWorkspaceSettings}
          onAddProfile={handleOpenNewProfile}
          onEditProfile={handleEditProfile}
          onSetDefaultProfile={handleSetDefaultProfile}
          onReturnHome={() => sendApp({ type: 'NAVIGATE', view: 'home' })}
        />
      )
    }

    return (
      <HomeView
        projects={activeProjects}
        profiles={profiles}
        archivingProjectId={archivingProjectId}
        workspaceSettings={workspaceSettings}
        onOpenProject={(projectId) => sendApp({ type: 'OPEN_PROJECT', projectId })}
        onArchiveProject={handleArchiveProject}
        deletingProjectId={deletingProjectId}
        onDeleteProject={handleDeleteProject}
        onOpenWorkspace={openWorkspaceCreate}
        onOpenSettings={() => sendApp({ type: 'NAVIGATE', view: 'settings' })}
      />
    )
  }

  const currentSectionLabel =
    activeView === 'workspace' || activeView === 'workspace-new'
      ? '当前工作区'
      : activeView === 'home'
        ? '项目总览'
        : activeView === 'archive'
          ? '归档'
        : activeView === 'styles'
          ? '风格库'
          : activeView === 'settings'
            ? '设置'
            : '模型接入'

  return (
    <div className="app-shell">
      {projectToast ? (
        <div className={projectToast.tone === 'success' ? 'app-toast success' : 'app-toast error'}>
          {projectToast.text}
        </div>
      ) : null}
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div className="app-brand">
            <div>
              <p className="eyebrow">Writing Agent</p>
              <h1>写作工作台</h1>
            </div>
            <span className="app-current-tag">{currentSectionLabel}</span>
          </div>
          <nav className="app-nav">
            <button
              className={activeView === 'home' ? 'app-nav-button active' : 'app-nav-button'}
              onClick={() => sendApp({ type: 'NAVIGATE', view: 'home' })}
            >
              项目总览
            </button>
            <button
              className={
                activeView === 'workspace' || activeView === 'workspace-new'
                  ? 'app-nav-button active'
                  : 'app-nav-button'
              }
              onClick={openWorkspaceCreate}
            >
              当前工作区
            </button>
            <button
              className={activeView === 'archive' ? 'app-nav-button active' : 'app-nav-button'}
              onClick={() => sendApp({ type: 'NAVIGATE', view: 'archive' })}
            >
              归档
            </button>
            <button
              className={activeView === 'styles' ? 'app-nav-button active' : 'app-nav-button'}
              onClick={() => sendApp({ type: 'NAVIGATE', view: 'styles' })}
            >
              风格库
            </button>
            <button
              className={activeView === 'settings' ? 'app-nav-button active' : 'app-nav-button'}
              onClick={() => sendApp({ type: 'NAVIGATE', view: 'settings' })}
            >
              设置
            </button>
          </nav>
        </div>
      </header>

      <main className="app-content-shell">{renderContent()}</main>
    </div>
  )
}

interface OnboardingViewProps {
  activePreset: ProviderPreset
  draft: ProfileDraft
  error: string | null
  busy: 'idle' | 'testing' | 'saving'
  testResult: ConnectionHealthResult | null
  isEditing: boolean
  canKeepExistingApiKey: boolean
  defaultLocked: boolean
  onSelectPreset: (preset: ProviderPreset) => void
  onChange: (field: keyof ProfileDraft, value: string | boolean | null) => void
  onOpenExternal: (url: string) => Promise<void>
  onTest: () => Promise<void>
  onSave: () => Promise<void>
}

function OnboardingView(props: OnboardingViewProps) {
  const isProviderLabelReady = props.draft.providerLabel.trim().length > 0
  const isBaseUrlReady = props.draft.baseUrl.trim().length > 0
  const isModelReady = props.draft.model.trim().length > 0
  const isApiKeyReady = props.draft.apiKey.trim().length > 0 || props.canKeepExistingApiKey
  const isProfileReady =
    isProviderLabelReady && isBaseUrlReady && isModelReady && isApiKeyReady

  return (
    <div className="stack gap-large">
      <section className="panel hero-panel">
        <p className="eyebrow">{props.isEditing ? '编辑模型配置' : '首次配置'}</p>
        <h2>{props.isEditing ? '更新这份配置' : '先选服务商，再填 Key'}</h2>
        <p className="muted">
          默认按 Anthropic-compatible 接口接入。预设只负责带入官方入口、接口文档、Base URL 和推荐模型。
        </p>
      </section>

      {!props.isEditing ? (
        <section className="preset-grid">
          {providerPresets.map((preset) => (
            <button
              key={preset.id}
              className={
                preset.id === props.draft.selectedPresetId ? 'preset-card selected' : 'preset-card'
              }
              onClick={() => props.onSelectPreset(preset)}
            >
              <div className="preset-head">
                <strong>{preset.label}</strong>
                <span className={preset.readiness === 'ready' ? 'tag ready' : 'tag manual'}>
                  {preset.readiness === 'ready' ? '可直接接入' : '需手动补充'}
                </span>
              </div>
              <p>{preset.description}</p>
            </button>
          ))}
        </section>
      ) : null}

      <section className="panel split-panel">
        <div className="stack">
          {props.isEditing ? (
            <label className="field">
              <span className="field-label">服务商预设</span>
              <select
                value={props.draft.selectedPresetId}
                onChange={(event) => {
                  const preset =
                    providerPresets.find((item) => item.id === event.target.value) ?? providerPresets[0]
                  props.onSelectPreset(preset)
                }}
              >
                {providerPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <p className="caption">切换预设会自动带入官方链接、Base URL 和推荐模型。</p>
            </label>
          ) : null}
          <label className="field">
            <FieldLabel text="服务商名称" required />
            <input
              value={props.draft.providerLabel}
              onChange={(event) => props.onChange('providerLabel', event.target.value)}
            />
          </label>
          <label className="field">
            <FieldLabel text="Base URL" required />
            <input
              value={props.draft.baseUrl}
              placeholder="https://..."
              onChange={(event) => props.onChange('baseUrl', event.target.value)}
            />
          </label>
          <label className="field">
            <FieldLabel text="默认 Model" required />
            <input
              value={props.draft.model}
              placeholder="例如：claude-sonnet-4-20250514"
              onChange={(event) => props.onChange('model', event.target.value)}
            />
          </label>
          <label className="field">
            <FieldLabel text="API Key" required={!props.canKeepExistingApiKey} />
            <input
              value={props.draft.apiKey}
              type="password"
              placeholder={
                props.canKeepExistingApiKey ? '留空则继续使用当前已保存的 Key' : '输入后只保存到本机安全存储'
              }
              onChange={(event) => props.onChange('apiKey', event.target.value)}
            />
          </label>
          {props.canKeepExistingApiKey ? (
            <p className="caption">这是编辑已有配置。API Key 留空时，会继续沿用本机里已保存的旧 Key。</p>
          ) : null}
          <label className="field">
            <span className="field-label">默认配置</span>
            <label className="caption">
              <input
                type="checkbox"
                checked={props.draft.isDefault}
                disabled={props.defaultLocked}
                onChange={(event) => props.onChange('isDefault', event.target.checked)}
              />{' '}
              保存后设为默认配置
            </label>
          </label>
          {props.defaultLocked ? (
            <p className="caption">这份配置当前已经是默认配置。要切换默认，直接回列表点“设为默认”。</p>
          ) : null}
          <p className="required-note">带 * 的字段不填完，不能测试连接，也不能保存配置。</p>
        </div>

        <div className="stack">
          <div className="panel inset-panel">
            <p className="eyebrow">预设链接</p>
            <h3>{props.activePreset.label}</h3>
            <div className="link-row">
              <button
                className="link-button"
                type="button"
                onClick={() => void props.onOpenExternal(props.activePreset.officialUrl)}
              >
                官方入口
              </button>
              {props.activePreset.docsUrl ? (
                <button
                  className="link-button"
                  type="button"
                  onClick={() => void props.onOpenExternal(props.activePreset.docsUrl!)}
                >
                  接口文档
                </button>
              ) : null}
            </div>
          </div>

          <div className="panel inset-panel">
            <p className="eyebrow">推荐模型</p>
            <div className="chips">
              {props.activePreset.recommendedModels.length > 0 ? (
                props.activePreset.recommendedModels.map((model) => (
                  <button
                    key={model}
                    className="chip"
                    onClick={() => props.onChange('model', model)}
                  >
                    {model}
                  </button>
                ))
              ) : (
                <span className="muted">这个预设暂不提供固定模型，请手动填写。</span>
              )}
            </div>
          </div>

          {props.error ? <p className="error-banner">{props.error}</p> : null}
          {props.testResult ? (
            <div className={props.testResult.success ? 'success-banner' : 'error-banner'}>
              <strong>{props.testResult.success ? '连接成功' : '连接失败'}</strong>
              <span>
                {props.testResult.message} · {props.testResult.endpoint}
              </span>
            </div>
          ) : null}

          <div className="button-row">
            <button
              className="secondary-button"
              disabled={props.busy !== 'idle' || !isProfileReady}
              onClick={() => void props.onTest()}
            >
              {props.busy === 'testing' ? '测试中…' : '测试连接'}
            </button>
            <button
              className="primary-button"
              disabled={props.busy !== 'idle' || !isProfileReady}
              onClick={() => void props.onSave()}
            >
              {props.busy === 'saving' ? '保存中…' : props.isEditing ? '保存配置' : '保存并进入工作台'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

interface HomeViewProps {
  projects: ProjectSummary[]
  profiles: ModelProfile[]
  archivingProjectId: string | null
  deletingProjectId: string | null
  workspaceSettings: WorkspaceSettings | null
  onOpenProject: (projectId: string) => void
  onArchiveProject: (project: ProjectSummary) => Promise<void>
  onDeleteProject: (project: ProjectSummary) => Promise<void>
  onOpenWorkspace: () => void
  onOpenSettings: () => void
}

function HomeView(props: HomeViewProps) {
  const currentProfile = props.profiles.find((profile) => profile.isDefault) ?? null
  const activeProjectCount = props.projects.length
  const profileMap = useMemo(
    () => new Map(props.profiles.map((profile) => [profile.id, profile])),
    [props.profiles],
  )

  return (
    <div className="stack gap-large">
      <section className="panel home-overview-shell">
        <div className="home-overview-head">
          <div className="stack compact">
            <p className="eyebrow">项目总览</p>
            <h2>先看手头项目，再决定继续还是新开</h2>
            <p className="muted">
              这里专门管活跃项目、默认模型和工作目录。新建文章统一留在“当前工作区”。
            </p>
          </div>
          <div className="chips">
            <span className="tag neutral">活跃项目 {activeProjectCount}</span>
            <span className={currentProfile ? 'tag ready' : 'tag manual'}>
              {currentProfile
                ? '默认模型已就绪'
                : props.profiles.length > 0
                  ? '未指定默认模型'
                  : '还没接入模型'}
            </span>
          </div>
        </div>

        <div className="home-summary-grid">
          <article className="panel inset-panel home-summary-card">
            <div className="stack compact">
              <p className="eyebrow">新项目默认模型</p>
              <h3>
                {currentProfile
                  ? `${currentProfile.providerLabel} / ${currentProfile.model}`
                  : props.profiles.length > 0
                    ? '还没有默认模型'
                    : '还没有模型配置'}
              </h3>
              {currentProfile ? (
                <>
                  <p className="caption compact-line">{currentProfile.baseUrl}</p>
                  <p className="caption compact-copy">只影响后面新建的项目，不会自动改掉已有项目的运行配置。</p>
                </>
              ) : props.profiles.length > 0 ? (
                <p className="warning-text compact-copy">已经保存了模型配置，但还没指定默认项。先去设置里选一份默认配置。</p>
              ) : (
                <p className="warning-text compact-copy">还没有模型配置，先去设置里接入 Anthropic-compatible 服务。</p>
              )}
            </div>
            <div className="button-row compact wrap-actions">
              <button className="secondary-button" onClick={props.onOpenSettings}>
                去设置
              </button>
              <button className="primary-button" onClick={props.onOpenWorkspace}>
                去工作区新建文章
              </button>
            </div>
          </article>

          {props.workspaceSettings ? (
            <article className="panel inset-panel home-summary-card">
              <div className="stack compact">
                <p className="eyebrow">项目主目录</p>
                <strong className="path-value compact-path">{props.workspaceSettings.rootPath}</strong>
                <p className="caption compact-copy">
                  {props.workspaceSettings.usesDefault
                    ? '当前仍在用默认 workspace。项目多了之后，建议去设置里改成专门目录。'
                    : '后续项目会继续写到这个主目录下。'}
                </p>
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section className="panel inset-panel home-project-panel">
        <div className="panel-head">
          <div className="stack compact">
            <p className="eyebrow">已有项目</p>
            <h3>直接从这里继续</h3>
          </div>
          <span className="caption">{activeProjectCount === 0 ? '还没有活跃项目' : `${activeProjectCount} 个活跃项目`}</span>
        </div>
        <div className="stack">
          {props.projects.length === 0 ? (
            <p className="muted">还没有项目，去“当前工作区”新建第一篇文章。</p>
          ) : (
            props.projects.map((project) => {
              const projectProfile = profileMap.get(project.modelProfileId)

              return (
                <article key={project.id} className="project-card">
                  <div className="project-card-top">
                    <div className="stack compact">
                      <strong>{project.title}</strong>
                      <p className="caption">
                        {project.mode === 'deep' ? '深度模式' : '快速模式'} · 当前阶段：
                        {getCurrentStageDefinition(project.mode, project.currentStage).label}
                      </p>
                      <p className="caption">
                        这篇文章实际跑的是：
                        {projectProfile
                          ? `${projectProfile.providerLabel} / ${projectProfile.model}`
                          : '未找到对应模型配置'}
                      </p>
                    </div>
                    <div className="button-row compact wrap-actions">
                      <button
                        className="ghost-button danger"
                        disabled={props.deletingProjectId === project.id}
                        onClick={() => void props.onDeleteProject(project)}
                      >
                        {props.deletingProjectId === project.id ? '删除中…' : '删除'}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={props.archivingProjectId === project.id}
                        onClick={() => void props.onArchiveProject(project)}
                      >
                        {props.archivingProjectId === project.id ? '归档中…' : '归档'}
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => props.onOpenProject(project.id)}
                      >
                        继续
                      </button>
                    </div>
                  </div>
                  {shouldRenderProjectTopic(project.title, project.topic) ? <p>{project.topic}</p> : null}
                  <p className="caption">
                    最近更新 {formatDate(project.updatedAt)} · 工作目录{' '}
                    {getArtifactFileName(project.workspacePath) ?? project.workspacePath}
                  </p>
                </article>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}

interface WorkspaceStartViewProps {
  profiles: ModelProfile[]
  draft: CreateProjectInput
  busy: boolean
  error: string | null
  workspaceSettings: WorkspaceSettings | null
  activeProject: ProjectSummary | null
  onChangeDraft: (field: keyof CreateProjectInput, value: string | number | null) => void
  onCreateProject: () => Promise<void>
  onOpenSettings: () => void
  onResumeProject: (projectId: string) => void
}

function WorkspaceStartView(props: WorkspaceStartViewProps) {
  const isTopicReady = props.draft.topic.trim().length > 0
  const isAudienceReady = props.draft.audience.trim().length > 0
  const isModelProfileReady = props.draft.modelProfileId.trim().length > 0
  const isProjectDraftReady = isTopicReady && isAudienceReady && isModelProfileReady
  const audienceCandidates = useMemo(
    () => deriveAudienceCandidatesFromTopic(props.draft.topic),
    [props.draft.topic],
  )
  const audiencePlaceholder =
    audienceCandidates[0] ?? '比如：给刚入职场、还摸不清办公室政治的人看。'

  return (
    <div className="stack gap-large">
      <section className="panel workspace-start-shell">
        <div className="workspace-start-head">
          <div className="stack compact">
            <p className="eyebrow">当前工作区</p>
            <h2>新建文章项目</h2>
            <p className="muted">
              填完主题、读者和模型后，创建成功会直接进入工作区，并自动启动第一轮需求澄清。
            </p>
          </div>
          {props.activeProject ? (
            <button
              className="secondary-button"
              onClick={() => props.onResumeProject(props.activeProject!.id)}
            >
              回到当前项目：{props.activeProject.title}
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel workspace-start-grid">
        <div className="stack">
          <label className="field">
            <FieldLabel text="你今天想写啥" required />
            <textarea
              value={props.draft.topic}
              rows={5}
              placeholder="比如：为什么很多人喜欢抱老板大腿，想写给刚入职场、还不太懂办公室政治的人看。"
              onChange={(event) => props.onChangeDraft('topic', event.target.value)}
            />
            <p className="caption">系统会根据这段内容自动生成项目名，你不用单独再起标题。</p>
          </label>
          <div className="field">
            <FieldLabel text="目标读者" required />
            {audienceCandidates.length > 0 ? (
              <div className="audience-suggestion-list">
                {audienceCandidates.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    className={
                      props.draft.audience.trim() === candidate
                        ? 'audience-suggestion selected'
                        : 'audience-suggestion'
                    }
                    onClick={() => props.onChangeDraft('audience', candidate)}
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            ) : (
              <div className="audience-suggestion-empty">
                先把“你今天想写啥”写清楚，这里会自动给你 3 个候选读者。
              </div>
            )}
            <input
              value={props.draft.audience}
              placeholder={audiencePlaceholder}
              onChange={(event) => props.onChangeDraft('audience', event.target.value)}
            />
            <p className="caption">先点一个最接近的，也可以继续手改。</p>
          </div>
          <div className="project-meta-grid">
            <label className="field">
              <FieldLabel text="目标字数" />
              <input
                type="number"
                value={props.draft.wordTarget ?? 0}
                onChange={(event) =>
                  props.onChangeDraft('wordTarget', Number(event.target.value) || null)
                }
              />
            </label>
            <label className="field">
              <FieldLabel text="工作模式" />
              <select
                value={props.draft.mode}
                onChange={(event) => props.onChangeDraft('mode', event.target.value)}
              >
                <option value="deep">深度模式</option>
                <option value="quick">快速模式</option>
              </select>
            </label>
            <label className="field">
              <FieldLabel text="模型配置" required />
              <select
                value={props.draft.modelProfileId}
                onChange={(event) => props.onChangeDraft('modelProfileId', event.target.value)}
              >
                <option value="">请选择</option>
                {props.profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.providerLabel} / {profile.model}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="required-note">带 * 的字段不填完，不能创建项目。项目名会根据“你今天想写啥”自动生成。</p>
          {props.error ? <p className="error-banner">{props.error}</p> : null}
          <div className="button-row">
            <button className="secondary-button" onClick={props.onOpenSettings}>
              去设置里调整模型配置
            </button>
            <button
              className="primary-button"
              disabled={props.busy || props.profiles.length === 0 || !isProjectDraftReady}
              onClick={() => void props.onCreateProject()}
            >
              {props.busy ? '创建中…' : '创建项目并开始第一轮'}
            </button>
          </div>
        </div>
        <div className="stack">
          {props.workspaceSettings ? (
            <div className="panel inset-panel compact-side-panel">
              <p className="eyebrow">项目主目录</p>
              <strong className="path-value">{props.workspaceSettings.rootPath}</strong>
              <p className="caption">
                {props.workspaceSettings.usesDefault
                  ? '当前还没单独设置主目录，后续新项目会默认写到这个 workspace。建议改成你平时集中管理文章项目的目录。'
                  : '后续新项目会在这个主目录下按日期建立独立文件夹。'}
              </p>
            </div>
          ) : null}
          <div className="panel inset-panel compact-side-panel">
            <p className="eyebrow">创建动作</p>
            <h3>创建后自动启动小李第一轮</h3>
            <p className="muted">
              这里不需要再单独点“开始”。创建成功后会直接跳进工作区，并自动启动需求澄清。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
interface WorkspaceViewProps {
  detail: ProjectDetail | null
  profiles: ModelProfile[]
  projectProfile: ModelProfile | null
  projectProfileBusy: boolean
  error: string | null
  exportPath: string | null
  stateValue: string
  isBusy: boolean
  runtimeStageKey: StageKey | null
  runtimeEntries: RuntimeProgressEntry[]
  runtimeWaitingState: {
    title: string
    body: string
    elapsedText: string
  } | null
  onRefresh: () => void
  onGenerate: (note?: string) => void
  onAcceptAndContinue: (note?: string) => void
  onCompleteProject: () => void
  onExport: () => void
  onReopenStage: (stageKey: StageKey) => void
  onManualSave: (detail: ProjectDetail, markdown: string) => Promise<void>
  onChangeProjectProfile: (modelProfileId: string) => void
  onRestoreProject: () => void
}

function WorkspaceView(props: WorkspaceViewProps) {
  const loadedDetail = props.detail
  const stages = loadedDetail ? getStageSequence(loadedDetail.mode) : []
  const runtimePanelRef = useRef<HTMLElement | null>(null)
  const [stageViewMode, setStageViewMode] = useState<'auto' | 'current' | 'history'>('auto')
  const [inspectedStageKey, setInspectedStageKey] = useState<StageKey | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [contentView, setContentView] = useState<'preview' | 'structure' | 'edit'>('preview')
  const [feedback, setFeedback] = useState('')
  const [editorValue, setEditorValue] = useState('')
  const [selectedTitleIndex, setSelectedTitleIndex] = useState<number | null>(null)
  const [selectedReviewDirections, setSelectedReviewDirections] = useState<string[]>([])
  const [manualBusy, setManualBusy] = useState(false)
  const [manualMessage, setManualMessage] = useState<{
    tone: 'success' | 'error'
    text: string
  } | null>(null)
  const displayStageKey =
    loadedDetail
      ? stageViewMode === 'history' && inspectedStageKey
        ? inspectedStageKey
        : loadedDetail.currentStage
      : null
  const activeStage =
    loadedDetail && displayStageKey
      ? getCurrentStageDefinition(loadedDetail.mode, displayStageKey)
      : null
  const activeOutput =
    loadedDetail && displayStageKey
      ? getLatestStageOutput(loadedDetail.outputs, displayStageKey)
      : null
  const stageOutputs =
    loadedDetail && displayStageKey
      ? [...loadedDetail.outputs]
          .filter((output) => output.stageKey === displayStageKey)
          .sort((left, right) => right.version - left.version)
      : []
  const displayedOutput =
    (selectedVersionId ? stageOutputs.find((output) => output.id === selectedVersionId) ?? null : null) ??
    activeOutput
  const companion = displayStageKey ? stageCompanionMap[displayStageKey] : null
  const isArchived = loadedDetail?.isArchived ?? false
  const isCompleted = loadedDetail?.status === 'completed'
  const isInspectingHistory = Boolean(
    loadedDetail &&
      stageViewMode === 'history' &&
      inspectedStageKey &&
      inspectedStageKey !== loadedDetail.currentStage,
  )
  const currentStageDefinition = loadedDetail
    ? getCurrentStageDefinition(loadedDetail.mode, loadedDetail.currentStage)
    : null
  const nextStageKey =
    loadedDetail ? getNextStageKey(loadedDetail.mode, loadedDetail.currentStage) : null
  const nextStage =
    loadedDetail && nextStageKey ? getCurrentStageDefinition(loadedDetail.mode, nextStageKey) : null
  const nextCompanion = nextStageKey ? stageCompanionMap[nextStageKey] : null
  const displayNextStageKey =
    loadedDetail && displayStageKey ? getNextStageKey(loadedDetail.mode, displayStageKey) : null
  const displayNextStage =
    loadedDetail && displayNextStageKey
      ? getCurrentStageDefinition(loadedDetail.mode, displayNextStageKey)
      : null
  const displayNextCompanion = displayNextStageKey ? stageCompanionMap[displayNextStageKey] : null
  const titleCandidates = getTitleCandidates(activeOutput?.structured)
  const structuredSelectedTitleIndex = getSelectedTitleIndex(activeOutput?.structured)
  const quickSuggestions = displayStageKey
    ? getQuickSuggestions(displayStageKey, activeOutput?.structured)
    : []
  const previousStageKey =
    loadedDetail
      ? stages[stages.findIndex((stageKey) => stageKey === loadedDetail.currentStage) - 1] ?? null
      : null
  const previousStage =
    loadedDetail && previousStageKey
      ? getCurrentStageDefinition(loadedDetail.mode, previousStageKey)
      : null
  const draftStageKey =
    loadedDetail && loadedDetail.currentStage !== 'draft' && stages.includes('draft') ? 'draft' : null
  const stageDesk = displayStageKey ? stageDeskMap[displayStageKey] : null
  const stageMaterials =
    loadedDetail && displayStageKey
      ? getStageMaterials(loadedDetail, displayStageKey, {
          includeCurrentOutput: Boolean(activeOutput),
        })
      : []
  const fallbackMaterialCount = 3
  const visibleMaterialCount = stageMaterials.length > 0 ? stageMaterials.length : fallbackMaterialCount
  const isInterruptedStage = shouldOfferResumeCurrentStage(loadedDetail, Boolean(activeOutput))
  const workspaceStatus = getWorkspaceStatus(
    props.stateValue,
    Boolean(activeOutput),
    Boolean(props.error),
    Boolean(isCompleted),
    Boolean(isArchived),
    Boolean(isInterruptedStage),
  )
  const generateCompanionName = companion?.name ?? '这位同事'
  const runtimeDisplayStageKey =
    !isInspectingHistory && loadedDetail && props.isBusy && props.runtimeStageKey
      ? props.runtimeStageKey
      : displayStageKey
  const runtimeStageDefinition =
    loadedDetail && runtimeDisplayStageKey
      ? getCurrentStageDefinition(loadedDetail.mode, runtimeDisplayStageKey)
      : activeStage
  const runtimeCompanion = runtimeDisplayStageKey ? stageCompanionMap[runtimeDisplayStageKey] : companion
  const runtimeCompanionName = runtimeCompanion?.name ?? generateCompanionName
  const resolvedRuntimeCompanion = (runtimeCompanion ?? companion)!
  const versionText = displayedOutput ? `版本 v${displayedOutput.version}` : '尚未生成'
  const wordCountText = displayedOutput ? formatWordCount(displayedOutput.wordCount) : '未统计字数'
  const displayedFileName = displayedOutput ? getArtifactFileName(displayedOutput.artifactPath) : null
  const runtimeProfileText = props.projectProfile
    ? `${props.projectProfile.providerLabel} / ${props.projectProfile.model}`
    : '未找到对应模型配置'
  const isViewingLatestVersion = !selectedVersionId || selectedVersionId === activeOutput?.id
  const canEditCurrentStage =
    Boolean(activeOutput) && !isInspectingHistory && !isArchived && !isCompleted && isViewingLatestVersion
  const generateLabel = !activeOutput
    ? isInterruptedStage
      ? '继续这一轮'
      : `让${generateCompanionName}先出一版`
    : feedback.trim()
      ? '按要求重写这一版'
      : `让${generateCompanionName}再出一版`
  const continueLabel = nextStage && nextCompanion
    ? `确认这版，进入 ${nextStage.label}（${nextCompanion.name} · ${nextCompanion.role}）`
    : '确认这版，继续下一步'
  const runtimeHintLabel = isArchived
    ? '恢复项目'
    : isCompleted
      ? '继续润色当前终稿'
      : isInterruptedStage
        ? '继续这一轮'
        : '让这一步先出一版'
  const finalPolishLabel = feedback.trim() ? '按新要求继续润色' : '继续润色当前终稿'
  const disableContinueForTitle = displayStageKey === 'titles' && selectedTitleIndex === null
  const nextActionGuide = activeOutput
    ? nextStage && nextCompanion
      ? `如果这版方向对，拉到最下面点击“${continueLabel}”；如果还要改，就先在这里补要求，再让${companion?.name ?? '这位同事'}重写。`
      : '如果这版已经可以交付，就拉到最下面确认终稿；如果还要改，就先在这里补要求，再重写一版。'
    : isInterruptedStage
      ? `上次已经交接到 ${activeStage?.label}，但这一轮还没交稿。现在直接点下面“继续这一轮”，就会从 ${companion?.name ?? '这位同事'} 这一步接着跑。`
      : activeStage?.userGuide ?? ''
  const resultOnlyRuntimeState =
    props.runtimeEntries.length === 0 &&
    Boolean(displayedOutput) &&
    !props.runtimeWaitingState &&
    !isArchived &&
    runtimeDisplayStageKey === displayStageKey
  const latestRuntimeEntry = props.runtimeEntries.at(-1) ?? null
  const latestRuntimeNarrative =
    latestRuntimeEntry ? describeRuntimeEntryForUser(latestRuntimeEntry, resolvedRuntimeCompanion) : null
  const runtimePanelTitle = isInspectingHistory
    ? `查看 ${activeStage?.label ?? '历史阶段'}`
    : resultOnlyRuntimeState
      ? `${runtimeCompanionName} 这一轮结果`
      : `${runtimeCompanionName} 刚刚做了什么`
  const runtimePanelCaption = props.isBusy
    ? '实时状态'
    : isInspectingHistory
      ? '历史阶段只读查看'
    : resultOnlyRuntimeState
      ? '展示最近一轮结果'
      : '只展示当前这一步'

  function scrollToRuntimePanel() {
    window.setTimeout(() => {
      runtimePanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 80)
  }

  function returnToCurrentStage() {
    setStageViewMode('current')
    setInspectedStageKey(null)
    setSelectedVersionId(null)
    setContentView('preview')
  }

  function resumeInterruptedStage() {
    scrollToRuntimePanel()
    props.onGenerate(feedback.trim() || undefined)
  }

  useEffect(() => {
    setEditorValue(activeOutput?.markdown ?? '')
    setFeedback('')
    setSelectedTitleIndex(structuredSelectedTitleIndex)
    setSelectedReviewDirections([])
  }, [activeOutput?.id, activeOutput?.markdown, structuredSelectedTitleIndex])

  useEffect(() => {
    setSelectedVersionId(null)
    setContentView('preview')
  }, [displayStageKey])

  useEffect(() => {
    setInspectedStageKey(null)
    setStageViewMode('auto')
    setSelectedVersionId(null)
    setContentView('preview')
  }, [loadedDetail?.id])

  useEffect(() => {
    setManualMessage(null)
  }, [displayStageKey])

  if (!loadedDetail) {
    return (
      <section className="panel hero-panel">
        <h2>正在载入项目…</h2>
      </section>
    )
  }

  if (!activeStage || !companion || !displayStageKey || !stageDesk) {
    return null
  }

  async function handleManualSave() {
    const markdown = editorValue.trim()

    if (!markdown) {
      setManualMessage({
        tone: 'error',
        text: '正文不能为空，至少保留一版可继续流转的内容。',
      })
      return
    }

    setManualBusy(true)
    setManualMessage(null)

    try {
      await props.onManualSave(loadedDetail!, markdown)
      setManualMessage({
        tone: 'success',
        text: '你的修改已保存为新版本。现在可以继续接受到下一阶段，或者再补批注重写。',
      })
    } catch (error) {
      setManualMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '保存手动修改失败',
      })
    } finally {
      setManualBusy(false)
    }
  }

  function appendFeedbackSuggestion(suggestion: string) {
    setFeedback((current) => {
      const normalized = suggestion.trim()

      if (!normalized) {
        return current
      }

      if (current.includes(normalized)) {
        return current
      }

      return current.trim() ? `${current.trim()}\n- ${normalized}` : `- ${normalized}`
    })
  }

  function toggleReviewDirection(direction: string) {
    setSelectedReviewDirections((current) =>
      current.includes(direction)
        ? current.filter((item) => item !== direction)
        : [...current, direction],
    )
  }

  async function persistTitleSelection(index: number) {
    if (displayStageKey !== 'titles' || !activeOutput || !titleCandidates[index]) {
      return
    }

    const selectedCandidate = titleCandidates[index]
    const nextStructured =
      activeOutput.structured && typeof activeOutput.structured === 'object'
        ? {
            ...(activeOutput.structured as Record<string, unknown>),
            selected: index,
          }
        : { selected: index }

    const nextMarkdown = [
      `## 已确认标题`,
      '',
      `- 标题：${selectedCandidate.title}`,
      `- 角度：${selectedCandidate.angle}`,
      `- 钩子：${selectedCandidate.hook}`,
      '',
      activeOutput.markdown,
    ].join('\n')

    await appApi.saveStageOutput({
      projectId: loadedDetail!.id,
      stageKey: 'titles',
      artifactName: activeStage!.artifactName,
      markdown: nextMarkdown,
      structured: nextStructured,
      rawText: activeOutput.rawText ?? activeOutput.markdown,
      summary: `已确认标题：${selectedCandidate.title}`,
      usage: activeOutput.usage,
    })
  }

  async function handleTitleHandoff() {
    if (selectedTitleIndex === null) {
      setManualMessage({
        tone: 'error',
        text: '标题阶段必须先选定一个标题，才能继续往下走。',
      })
      return
    }

    setManualBusy(true)
    setManualMessage(null)

    try {
      const selectedCandidate = titleCandidates[selectedTitleIndex]

      await persistTitleSelection(selectedTitleIndex)

      const handoffNote = selectedCandidate
        ? `已确认标题，请后续阶段默认采用这个标题继续写作：${selectedCandidate.title}。角度：${selectedCandidate.angle}。钩子：${selectedCandidate.hook}。`
        : undefined

      props.onAcceptAndContinue(handoffNote)
      scrollToRuntimePanel()
    } catch (error) {
      setManualMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '保存标题选择失败',
      })
    } finally {
      setManualBusy(false)
    }
  }

  return (
    <div className="stack gap-large">
      <section className="panel hero-panel">
        <div>
          <p className="eyebrow">{loadedDetail.mode === 'deep' ? '深度模式' : '快速模式'}</p>
          <h2>{loadedDetail.title}</h2>
        </div>
        <p className="muted">{loadedDetail.topic}</p>
        <div className="meta-strip">
          <span>读者：{loadedDetail.audience}</span>
          <span>当前项目配置：{runtimeProfileText}</span>
          <span>{isInspectingHistory ? `当前推进：${currentStageDefinition?.label}` : `当前阶段：${activeStage.label}`}</span>
          {isInspectingHistory ? <span>正在查看：{activeStage.label}</span> : null}
          <span>{versionText}</span>
          <span>{wordCountText}</span>
          {isArchived ? (
            <span>归档于：{loadedDetail.archivedAt ? formatDate(loadedDetail.archivedAt) : '未记录时间'}</span>
          ) : null}
        </div>
        <div className="project-profile-bar">
          <label className="field project-profile-field">
            <span className="field-label">切换这篇项目的运行配置</span>
            <select
              value={loadedDetail.modelProfileId}
              disabled={props.projectProfileBusy || props.isBusy || isArchived}
              onChange={(event) => props.onChangeProjectProfile(event.target.value)}
            >
              {!props.projectProfile ? (
                <option value={loadedDetail.modelProfileId}>未找到当前配置</option>
              ) : null}
              {props.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.providerLabel} / {profile.model}
                  {profile.isDefault ? '（默认）' : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="caption">
            默认模型只影响新建项目。这里切换的是这篇文章后续实际使用的模型配置。
          </p>
        </div>
        <div className="status-row">
          <span className={`status-pill ${workspaceStatus.tone}`}>{workspaceStatus.title}</span>
          <span className="caption">{workspaceStatus.description}</span>
        </div>
        {isInspectingHistory && currentStageDefinition ? (
          <div className="history-banner">
            <div className="stack compact">
              <strong>你现在查看的是历史阶段，只读模式</strong>
              <span className="caption">
                项目实际仍停在 {currentStageDefinition.label}。这里只做回看，不会改动流程推进位置。
              </span>
            </div>
            <button className="secondary-button" type="button" onClick={returnToCurrentStage}>
              回到当前阶段：{currentStageDefinition.label}
            </button>
          </div>
        ) : null}
      </section>

        <article className="panel desk-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">{isArchived ? '归档项目' : isCompleted ? '终稿控制台' : '阶段交接单'}</p>
            <h3>
              {isArchived
                ? '这个项目已经收进归档区'
                : isCompleted
                  ? '这篇文章已经封版'
                  : `${companion.name} 这一轮要怎么干`}
            </h3>
          </div>
          <span className={`status-pill ${workspaceStatus.tone}`}>{workspaceStatus.title}</span>
        </div>

        <div className="companion-title desk-lead">
          <span className="companion-avatar">{companion.name.slice(0, 2)}</span>
          <div className="stack compact">
            <h3>
              {companion.name} · {companion.role}
            </h3>
            <span className="caption">
              {isArchived
                ? '这个项目现在处于只读归档状态'
                : isCompleted
                ? `${companion.name} 已把终稿交回来了`
                : `这一阶段暂时由 ${companion.name} 负责`}
              </span>
            </div>
          </div>

          {isInterruptedStage && !activeOutput && !isInspectingHistory ? (
            <div className="button-row wrap-actions">
              <button
                className="primary-button"
                disabled={props.isBusy || manualBusy}
                onClick={resumeInterruptedStage}
              >
                {props.isBusy ? '处理中…' : '继续这一轮'}
              </button>
              <span className="caption">上次交接后这一轮中断了，先从这里继续，不用再往下翻找按钮。</span>
            </div>
          ) : null}

          {isArchived ? (
            <div className="desk-grid">
              <article className="desk-block">
              <p className="eyebrow">归档状态</p>
              <h4>它已经从主工作流里收起来了</h4>
              <p className="muted">
                归档项目不会再出现在项目总览，也不会继续自动流转。这里保留查看和导出；真要继续写，先恢复。
              </p>
            </article>
            <article className="desk-block">
              <p className="eyebrow">现在还能做什么</p>
              <div className="desk-checklist">
                <span>查看各阶段成稿和版本。</span>
                <span>导出当前整篇文章。</span>
                <span>恢复到活跃项目后，再继续生成后续阶段。</span>
              </div>
            </article>
            <article className="desk-block desk-block-wide">
              <p className="eyebrow">为什么要先恢复</p>
              <p className="caption">
                归档的语义是“先收起来，不让它继续混在主工作流里”。恢复后，这个项目才会重新回到项目总览和当前工作区。
              </p>
            </article>
          </div>
        ) : isCompleted ? (
          <div className="desk-grid">
            <article className="desk-block">
              <p className="eyebrow">终稿状态</p>
              <h4>现在已经不再是草稿</h4>
              <p className="muted">
                去 AI 味阶段已经跑完，当前这版就是默认导出稿。后续动作不再叫“进入下一阶段”，而是继续润色或打回回炉。
              </p>
            </article>
            <article className="desk-block">
              <p className="eyebrow">这次交付了什么</p>
              <h4>{stageDesk.deliverable}</h4>
              <p className="caption">{stageDesk.acceptance.trim()}</p>
            </article>
            <article className="desk-block desk-block-wide">
              <p className="eyebrow">如果还不满意</p>
              <div className="desk-checklist">
                <span>继续润色：在当前终稿上再出一个新版本，不覆盖旧稿。</span>
                <span>打回上一阶段：回到 {previousStage?.label ?? '上一阶段'} 再重新加工。</span>
                {draftStageKey ? <span>打回初稿：直接回到“初稿生成”重新起文。</span> : null}
              </div>
            </article>
          </div>
        ) : (
          <>
            <p className="muted">{companion.summary}</p>
            <article className="desk-block desk-briefing">
              <div className="desk-briefing-top">
                <div className="desk-briefing-copy">
                  <p className="eyebrow">这一步要解决什么</p>
                  <h4>{stageDesk.mission}</h4>
                </div>
                <div className="desk-briefing-copy">
                  <p className="eyebrow">这一轮会交回来什么</p>
                  <h4>{stageDesk.deliverable}</h4>
                  <p className="caption">{stageDesk.acceptance.trim()}</p>
                </div>
              </div>

              <div className="desk-checklist desk-checklist-tight">
                {stageDesk.checklist.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>

              <div className="desk-material-head">
                <div className="stack compact">
                  <p className="eyebrow">这位同事现在手里有 {visibleMaterialCount} 份材料</p>
                  <p className="caption">
                    {displayNextStage && displayNextCompanion
                      ? `这一版确认后，会直接进入 ${displayNextStage.label}，由 ${displayNextCompanion.name} · ${displayNextCompanion.role} 接手。`
                      : '这一步就是最后封版前的终稿工位。'}
                  </p>
                </div>
              </div>

              {stageMaterials.length === 0 ? (
                <div className="desk-material-strip empty">
                  <div className="material-chip compact">
                    <div className="material-chip-head">
                      <strong>题目</strong>
                    </div>
                    <p>{loadedDetail.topic}</p>
                  </div>
                  <div className="material-chip compact">
                    <div className="material-chip-head">
                      <strong>目标读者</strong>
                    </div>
                    <p>{loadedDetail.audience}</p>
                  </div>
                  <div className="material-chip compact">
                    <div className="material-chip-head">
                      <strong>目标字数</strong>
                    </div>
                    <p>{loadedDetail.wordTarget ?? '未设置'} 字</p>
                  </div>
                </div>
              ) : (
                <div className="desk-material-strip">
                  {stageMaterials.map((material) => (
                    <div key={material.stageKey} className="material-chip compact">
                      <div className="material-chip-head">
                        <strong>
                          {material.label} · v{material.version}
                        </strong>
                        <div className="material-chip-meta">
                          <span className="caption compact-inline">{formatWordCount(material.wordCount)}</span>
                          {material.isCurrentOutput ? <span className="material-chip-badge">当前稿</span> : null}
                        </div>
                      </div>
                      <p>{material.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </>
        )}
      </article>

      <section className="workspace-grid">
        <aside className="panel stage-rail">
          <p className="eyebrow">流程阶段</p>
          {stages.map((stageKey, index) => {
            const stage = getCurrentStageDefinition(loadedDetail.mode, stageKey)
            const output = getLatestStageOutput(loadedDetail.outputs, stageKey)
            const isActive = stageKey === displayStageKey
            const isCurrentProgress = stageKey === loadedDetail.currentStage
            const canInspect = Boolean(output) || isCurrentProgress
            const stageCompanion = stageCompanionMap[stageKey]

            return (
              <button
                key={stageKey}
                type="button"
                className={
                  isActive
                    ? 'stage-row active'
                    : canInspect
                      ? 'stage-row'
                      : 'stage-row disabled'
                }
                disabled={!canInspect}
                onClick={() => {
                  if (isCurrentProgress) {
                    returnToCurrentStage()
                    return
                  }

                  setStageViewMode('history')
                  setInspectedStageKey(stageKey)
                  setContentView('preview')
                }}
              >
                <div className="stage-order">{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <strong>{stage.label}</strong>
                  <p className="caption stage-companion">
                    {stageCompanion.name} · {stageCompanion.role}
                  </p>
                  <div className="stage-row-meta">
                    {isCurrentProgress ? <span className="mini-badge">当前推进</span> : null}
                    {isActive && isInspectingHistory ? <span className="mini-badge subtle">正在查看</span> : null}
                  </div>
                  <p className="caption">
                    {output
                      ? `已生成 v${output.version} · ${formatWordCount(output.wordCount)}`
                      : isCurrentProgress && isInterruptedStage
                        ? '待继续'
                        : '待生成'}
                  </p>
                </div>
              </button>
            )
          })}
        </aside>

        <section className="stack gap-large">
          <article ref={runtimePanelRef} className="panel runtime-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">过程播报</p>
                <h3>{runtimePanelTitle}</h3>
              </div>
              <span className="caption">{runtimePanelCaption}</span>
            </div>
            {!isInspectingHistory && props.runtimeEntries.length === 0 ? (
              <div className="runtime-empty">
                {isArchived ? (
                  <>
                    <strong>归档项目不再继续跑新流程</strong>
                    <p className="caption">
                      如果只是想查看旧稿或导出，现在就可以；如果想继续写下去，先点“恢复到活跃项目”。
                    </p>
                  </>
                ) : props.runtimeWaitingState ? (
                  <div className="runtime-entry runtime-entry-waiting">
                    <div className="runtime-entry-marker">{runtimeCompanionName}</div>
                    <div className="runtime-entry-head">
                      <strong>{props.runtimeWaitingState.title}</strong>
                      <span className="caption">{props.runtimeWaitingState.elapsedText}</span>
                    </div>
                    <p className="runtime-body">{props.runtimeWaitingState.body}</p>
                  </div>
                  ) : displayedOutput ? (
                    <article className="runtime-summary-card">
                      <div className="runtime-summary-head">
                        <div className="runtime-entry-marker">{runtimeCompanionName}</div>
                        <div className="stack compact">
                        <strong>{runtimeCompanionName} 这一轮已经交稿</strong>
                        <span className="caption">
                          {runtimeStageDefinition?.label ?? activeStage.label} · {versionText} · {wordCountText}
                        </span>
                      </div>
                    </div>
                    <p className="runtime-body">
                      {runtimeCompanionName} 已经把这一轮 {runtimeStageDefinition?.label ?? activeStage.label} 交回来了。先看下面这版成稿，再决定是继续改，还是直接交给下一环节。
                      </p>
                      <p className="caption">{nextActionGuide}</p>
                    </article>
                  ) : isInterruptedStage ? (
                    <article className="runtime-summary-card">
                      <div className="runtime-summary-head">
                        <div className="runtime-entry-marker">{runtimeCompanionName}</div>
                        <div className="stack compact">
                          <strong>{runtimeCompanionName} 这一轮上次停住了</strong>
                          <span className="caption">{runtimeStageDefinition?.label ?? activeStage.label} · 等你继续</span>
                        </div>
                      </div>
                      <p className="runtime-body">
                        上次已经把项目交接到 {runtimeCompanionName} 这一步了，但刷新前这一轮还没来得及交稿。
                        现在直接点上面的“继续这一轮”，就会从这里接着跑。
                      </p>
                    </article>
                  ) : (
                    <>
                      <strong>{runtimeCompanionName} 还没开始这一轮</strong>
                      <p className="caption">
                        {`点击“${runtimeHintLabel}”之后，这里会把真实动作翻成用户能看懂的话。`}
                    </p>
                  </>
                )}
              </div>
            ) : isInspectingHistory ? (
              <article className="runtime-summary-card">
                <div className="runtime-summary-head">
                  <div className="runtime-entry-marker">{companion.name}</div>
                  <div className="stack compact">
                    <strong>{activeStage.label} 的历史结果</strong>
                    <span className="caption">
                      {displayedOutput ? `版本 v${displayedOutput.version} · ${formatWordCount(displayedOutput.wordCount)}` : '这一阶段还没有可查看的成稿'}
                    </span>
                  </div>
                </div>
                <p className="runtime-body">
                  {displayedOutput
                    ? `你现在在回看 ${activeStage.label} 的历史稿。项目实际仍在 ${currentStageDefinition?.label} 推进，这里只做查看，不会改动流程。`
                    : `你现在在查看 ${activeStage.label}，但这一步还没有保存过成稿。`}
                </p>
                <p className="caption">
                  {currentStageDefinition
                    ? `想继续往下写，点“回到当前阶段：${currentStageDefinition.label}”。`
                    : '这里只读查看历史阶段。'}
                </p>
              </article>
            ) : latestRuntimeEntry && latestRuntimeNarrative ? (
              <div className="runtime-feed">
                <div className="runtime-entry">
                  <div className="runtime-entry-marker">{runtimeCompanionName}</div>
                  <div className="runtime-entry-head">
                    <strong>{latestRuntimeNarrative.title}</strong>
                    <span className="caption">{formatClock(latestRuntimeEntry.timestamp)}</span>
                  </div>
                  <p className="runtime-body">{latestRuntimeNarrative.body}</p>
                </div>
              </div>
            ) : null}
          </article>

          {isArchived ? (
            <section className="panel feedback-panel final-actions-panel">
              <div className="hero-topline">
                <div>
                  <p className="eyebrow">归档后的动作</p>
                  <h3>先恢复，再继续写</h3>
                </div>
              </div>
              <p className="muted">
                当前项目已经归档，所以这里不再提供“重写这一版”“进入下一阶段”这类动作。
              </p>
              {props.error ? <p className="error-banner">{props.error}</p> : null}
              {props.exportPath ? (
                <p className="success-banner">最近一次导出文件：{props.exportPath}</p>
              ) : null}
              <div className="desk-checklist">
                <span>想继续写：先恢复到活跃项目。</span>
                <span>只想留存：保持归档，按当前版本导出即可。</span>
              </div>
              <div className="button-row wrap-actions">
                <button
                  className="primary-button"
                  disabled={props.isBusy}
                  onClick={props.onRestoreProject}
                >
                  恢复到活跃项目
                </button>
                <button className="secondary-button" disabled={props.isBusy} onClick={props.onExport}>
                  导出当前整篇文章
                </button>
              </div>
            </section>
          ) : isCompleted ? (
            <section className="panel feedback-panel final-actions-panel">
              <div className="hero-topline">
                <div>
                  <p className="eyebrow">终稿后续动作</p>
                  <h3>继续润色，还是打回回炉</h3>
                </div>
              </div>
              <p className="muted">
                终稿已经完成。这里不再出现“进入下一阶段”这种按钮，因为流程已经走完了。
              </p>
              {props.error ? <p className="error-banner">{props.error}</p> : null}
              {props.exportPath ? (
                <p className="success-banner">终稿已写入项目目录：{props.exportPath}</p>
              ) : null}
              <label className="field">
                <span>继续给 {companion.name} 的修改要求</span>
                <textarea
                  rows={4}
                  placeholder="例如：结尾再收得更狠一点，删掉解释性废话，把判断再说死一点。"
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                />
              </label>
              {quickSuggestions.length > 0 ? (
                <div className="choice-panel">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">可直接套用的润色方向</p>
                      <h4>不想自己写，也可以直接点下面的建议</h4>
                    </div>
                  </div>
                  <div className="choice-chip-row">
                    {quickSuggestions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className="choice-chip"
                        onClick={() => appendFeedbackSuggestion(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="caption">
                继续润色会在当前终稿基础上再出一个新版本；如果方向不对，就直接打回前一阶段回炉。
              </p>
              <div className="button-row wrap-actions">
                <button
                  className="primary-button"
                  disabled={props.isBusy || manualBusy}
                  onClick={() => props.onGenerate(feedback.trim() || undefined)}
                >
                  {props.isBusy ? '处理中…' : finalPolishLabel}
                </button>
                {previousStage ? (
                  <button
                    className="secondary-button"
                    disabled={props.isBusy || manualBusy}
                    onClick={() => props.onReopenStage(previousStage.key)}
                  >
                    打回 {previousStage.label}
                  </button>
                ) : null}
                {draftStageKey && previousStageKey !== 'draft' ? (
                  <button
                    className="secondary-button"
                    disabled={props.isBusy || manualBusy}
                    onClick={() => props.onReopenStage('draft')}
                  >
                    打回 初稿生成
                  </button>
                ) : null}
              </div>
            </section>
          ) : isInspectingHistory ? (
            <section className="panel feedback-panel final-actions-panel">
              <div className="hero-topline">
                <div>
                  <p className="eyebrow">历史阶段查看</p>
                  <h3>{activeStage.label} 现在是只读模式</h3>
                </div>
              </div>
              <p className="muted">
                你现在回看的是历史阶段，所以这里不提供“重写这一版”“确认交接”这类动作。
              </p>
              <div className="desk-checklist">
                <span>先用上面的版本条查看这一步不同版本的稿子。</span>
                <span>看完如果要继续推进，回到当前阶段再决定是否交给下一环节。</span>
              </div>
              {currentStageDefinition ? (
                <div className="button-row wrap-actions">
                  <button className="primary-button" type="button" onClick={returnToCurrentStage}>
                    回到当前阶段：{currentStageDefinition.label}
                  </button>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="panel feedback-panel">
              <div className="hero-topline">
                <div>
                  <p className="eyebrow">这一步如果要调整</p>
                  <h3>{activeStage.label}的补充说明和选择</h3>
                </div>
              </div>
              <p className="muted">{activeStage.purpose}</p>
              <p className="caption">{nextActionGuide}</p>
              {props.error ? <p className="error-banner">{props.error}</p> : null}
              <label className="field">
                <span>给这位同事的修改要求</span>
                <textarea
                  rows={4}
                  placeholder="例如：目标读者再收窄一点，别泛泛讲家长和老师；核心问题要更尖锐。"
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                />
              </label>
              {displayStageKey === 'titles' && titleCandidates.length > 0 ? (
                <div className="choice-panel">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">必须确认的选择</p>
                      <h4>
                        单选 1 个标题，再进入下一环节
                        <span className="required-star inline">*</span>
                      </h4>
                    </div>
                    <span className="caption">
                      {selectedTitleIndex === null ? '当前未选中' : `已选中第 ${selectedTitleIndex + 1} 个`}
                    </span>
                  </div>
                  <div className="title-choice-list">
                    {titleCandidates.map((candidate, index) => (
                      <button
                        key={`${candidate.title}-${index}`}
                        type="button"
                        className={
                          selectedTitleIndex === index ? 'title-choice selected' : 'title-choice'
                        }
                        onClick={() => setSelectedTitleIndex(index)}
                      >
                        <strong>{candidate.title}</strong>
                        <p>角度：{candidate.angle}</p>
                        <p>钩子：{candidate.hook}</p>
                      </button>
                    ))}
                  </div>
                  <p className="caption">
                    标题阶段必须先确认一个标题，后面的初稿才知道该往哪个入口发力。
                  </p>
                </div>
              ) : null}
              {displayStageKey === 'review' && quickSuggestions.length > 0 ? (
                <div className="choice-panel">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">修订方向选择</p>
                      <h4>先选陈姐给的具体修法，再决定要不要自己补充</h4>
                    </div>
                    <span className="caption">已选 {selectedReviewDirections.length} 项</span>
                  </div>
                  <div className="review-choice-list">
                    {quickSuggestions.map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        className={
                          selectedReviewDirections.includes(direction)
                            ? 'review-choice selected'
                            : 'review-choice'
                        }
                        onClick={() => toggleReviewDirection(direction)}
                      >
                        {direction}
                      </button>
                    ))}
                  </div>
                  <div className="button-row wrap-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setSelectedReviewDirections(quickSuggestions)}
                    >
                      全选修订方向
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setSelectedReviewDirections([])}
                    >
                      清空选择
                    </button>
                    <button
                      type="button"
                      className="primary-button subtle"
                      disabled={selectedReviewDirections.length === 0 || props.isBusy || manualBusy}
                      onClick={() =>
                        props.onGenerate(
                          `请只按以下修订方向重写当前稿件：\n- ${selectedReviewDirections.join('\n- ')}`,
                        )
                      }
                    >
                      按选中方向重写
                    </button>
                  </div>
                </div>
              ) : null}
              {displayStageKey !== 'titles' &&
              displayStageKey !== 'review' &&
              quickSuggestions.length > 0 ? (
                <div className="choice-panel">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">可直接套用的建议</p>
                      <h4>不想自己写，也可以直接点下面的方向</h4>
                    </div>
                  </div>
                  <div className="choice-chip-row">
                    {quickSuggestions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className="choice-chip"
                        onClick={() => appendFeedbackSuggestion(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="caption">
                不满意当前版本时，有两条路：直接点上面的可选方案，或者自己补充修改要求后再让这一步重写一版。
              </p>
              {disableContinueForTitle ? (
                <p className="required-note">标题还没确认，当前不能推进到下一步。</p>
              ) : null}
                <div className="button-row wrap-actions">
                  {!isInterruptedStage ? (
                    <button
                      className={activeOutput ? 'secondary-button' : 'primary-button'}
                      disabled={props.isBusy || manualBusy}
                      onClick={() => {
                        scrollToRuntimePanel()
                        props.onGenerate(feedback.trim() || undefined)
                      }}
                    >
                      {props.isBusy ? '处理中…' : generateLabel}
                    </button>
                  ) : null}
                  {activeOutput
                    ? nextStage
                      ? (
                      <button
                        className="primary-button"
                        disabled={props.isBusy || manualBusy || disableContinueForTitle}
                        onClick={() => {
                          if (displayStageKey === 'titles') {
                            void handleTitleHandoff()
                            return
                          }

                          scrollToRuntimePanel()
                          props.onAcceptAndContinue()
                        }}
                      >
                        {continueLabel}
                      </button>
                    )
                    : (
                      <button
                        className="primary-button"
                        disabled={props.isBusy || manualBusy}
                        onClick={props.onCompleteProject}
                      >
                        确认终稿并写入项目目录
                      </button>
                    )
                  : null}
              </div>
            </section>
          )}

          <section className="stage-output-shell">
            <article className="panel stage-output-panel">
              <div className="content-panel-head">
                <div>
                  <p className="eyebrow">阶段正文</p>
                  <h3>{activeStage.label}成稿</h3>
                  <p className="caption compact-meta-line">
                    {versionText} · {wordCountText}
                    {displayedFileName ? ` · ${displayedFileName}` : ''}
                  </p>
                </div>
              </div>
              <div className="stage-content-toolbar">
                {stageOutputs.length > 0 ? (
                  <div className="version-switcher">
                    {stageOutputs.map((output) => (
                      <button
                        key={output.id}
                        type="button"
                        className={
                          selectedVersionId === output.id || (!selectedVersionId && output.id === activeOutput?.id)
                            ? 'version-chip active'
                            : 'version-chip'
                        }
                        onClick={() => {
                          setSelectedVersionId(output.id)
                          setContentView('preview')
                        }}
                      >
                        v{output.version}
                        {output.id === activeOutput?.id ? <span className="version-chip-tag">当前</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="stage-tab-switcher">
                  <button
                    className={contentView === 'preview' ? 'stage-tab active' : 'stage-tab'}
                    type="button"
                    disabled={!displayedOutput}
                    onClick={() => setContentView('preview')}
                  >
                    正文
                  </button>
                  <button
                    className={contentView === 'structure' ? 'stage-tab active' : 'stage-tab'}
                    type="button"
                    disabled={!displayedOutput}
                    onClick={() => setContentView('structure')}
                  >
                    结构
                  </button>
                  {canEditCurrentStage ? (
                    <button
                      className={contentView === 'edit' ? 'stage-tab active' : 'stage-tab'}
                      type="button"
                      onClick={() => setContentView('edit')}
                    >
                      编辑
                    </button>
                  ) : null}
                </div>
                <div className="button-row wrap-actions compact-actions">
                  {selectedVersionId && activeOutput ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setSelectedVersionId(null)
                        setContentView('preview')
                      }}
                    >
                      回到最新版本
                    </button>
                  ) : null}
                </div>
              </div>
              {displayedOutput ? (
                <div className="inline-meta-row compact">
                  <span className="caption">
                    {selectedVersionId && activeOutput
                      ? '你现在查看的是旧版本，只读。'
                      : '当前查看的是最新版本。'}
                  </span>
                  <span className="caption">{contentView === 'preview' ? '看正文' : contentView === 'structure' ? '看结构' : '直接手改'}</span>
                </div>
              ) : null}
              {contentView === 'preview' ? (
                <div
                  className={displayedOutput?.markdown.trim() ? 'markdown-preview' : 'markdown-preview empty'}
                  dangerouslySetInnerHTML={{
                    __html: displayedOutput?.markdown.trim()
                      ? renderMarkdownToHtml(displayedOutput.markdown)
                      : '<p>这一阶段还没有可查看的正文。</p>',
                  }}
                />
              ) : contentView === 'structure' ? (
                displayedOutput ? (
                  <div className="structure-compact">
                    <div className="structure-inline-card">
                      <strong>{displayedOutput.summary ?? '这一版已生成结构化结果'}</strong>
                      <span className="caption">这里保留最关键的判断信息，需要细看时再展开完整结构。</span>
                    </div>
                    <details className="structured-details">
                      <summary>展开完整结构化结果</summary>
                      <pre className="json-preview">
                        {JSON.stringify(displayedOutput.structured, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : (
                  <p className="caption compact-placeholder">这一版还没有结构化结果。</p>
                )
              ) : canEditCurrentStage ? (
                <>
                  <label className="field editor-field">
                    <span>直接手动改这版</span>
                    <textarea
                      className="editor-area"
                      value={editorValue}
                      placeholder="这里是当前最新版本，你可以直接手动修改。"
                      onChange={(event) => setEditorValue(event.target.value)}
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      disabled={props.isBusy || manualBusy || !activeOutput}
                      onClick={() => setEditorValue(activeOutput?.markdown ?? '')}
                    >
                      恢复到当前版本
                    </button>
                    <button
                      className="primary-button subtle"
                      disabled={props.isBusy || manualBusy || !activeOutput}
                      onClick={() => void handleManualSave()}
                    >
                      {manualBusy ? '保存中…' : '保存我的手动修改'}
                    </button>
                  </div>
                </>
              ) : (
                <p className="caption compact-placeholder">
                  {displayedOutput ? '这一版当前不可编辑。' : '先让这一步出一版，这里才会出现正文。'}
                </p>
              )}
              {!canEditCurrentStage && displayedOutput ? (
                <p className="caption">
                  {isInspectingHistory
                    ? '你现在查看的是历史阶段，只读模式。要继续修改，请先回到当前推进阶段。'
                    : !isViewingLatestVersion
                      ? '你现在查看的是旧版本，只读模式。想直接修改，请先切回最新版本。'
                      : '当前阶段暂时不提供手动修改。'}
                </p>
              ) : null}
              {manualMessage ? (
                <p className={manualMessage.tone === 'success' ? 'success-banner' : 'error-banner'}>
                  {manualMessage.text}
                </p>
              ) : null}
            </article>
          </section>
        </section>
      </section>
    </div>
  )
}

function ArchiveView(props: {
  projects: ProjectSummary[]
  deletingProjectId: string | null
  restoringProjectId: string | null
  error: string | null
  onDeleteProject: (project: ProjectSummary) => Promise<void>
  onOpenProject: (projectId: string) => void
  onRestoreProject: (project: ProjectSummary) => Promise<void>
}) {
  return (
    <div className="stack gap-large">
      <section className="panel hero-panel">
        <p className="eyebrow">归档</p>
        <h2>这里只放暂时收起来的项目</h2>
        <p className="muted">
          归档项目不会出现在主工作区。要继续写，先恢复到活跃项目；只是查看则可以直接打开。
        </p>
      </section>

      <section className="panel inset-panel">
        <p className="eyebrow">归档项目</p>
        {props.error ? <p className="error-banner">{props.error}</p> : null}
        <div className="stack">
          {props.projects.length === 0 ? (
            <p className="muted">当前还没有归档项目。</p>
          ) : (
            props.projects.map((project) => (
              <article key={project.id} className="project-card">
                <div className="project-card-top">
                  <div className="stack compact">
                    <strong>{project.title}</strong>
                    <p className="caption">
                      归档于 {project.archivedAt ? formatDate(project.archivedAt) : '未知时间'} · 当前阶段：
                      {getCurrentStageDefinition(project.mode, project.currentStage).label}
                    </p>
                  </div>
                  <div className="button-row compact wrap-actions">
                    <button
                      className="ghost-button danger"
                      disabled={props.deletingProjectId === project.id}
                      onClick={() => void props.onDeleteProject(project)}
                    >
                      {props.deletingProjectId === project.id ? '删除中…' : '删除'}
                    </button>
                    <button
                      className="ghost-button"
                      disabled={props.restoringProjectId === project.id}
                      onClick={() => void props.onRestoreProject(project)}
                    >
                      {props.restoringProjectId === project.id ? '恢复中…' : '恢复'}
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => props.onOpenProject(project.id)}
                    >
                      查看
                    </button>
                  </div>
                </div>
                {shouldRenderProjectTopic(project.title, project.topic) ? <p>{project.topic}</p> : null}
                <p className="caption">工作目录 {getArtifactFileName(project.workspacePath) ?? project.workspacePath}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function StylesView(props: { onOpenSettings: () => void }) {
  return (
    <section className="panel hero-panel stack">
      <p className="eyebrow">风格库</p>
      <h2>V0 先占位，主链路优先</h2>
      <p className="muted">
        当前版本还没有把原项目的风格建模完整搬进来。下一步会在这里接入样本导入、风格总结和项目绑定。
      </p>
      <button className="primary-button" onClick={props.onOpenSettings}>
        先去确认模型配置
      </button>
    </section>
  )
}

function SettingsView(props: {
  profiles: ModelProfile[]
  workspaceSettings: WorkspaceSettings | null
  workspaceRootDraft: string
  workspaceBusy: boolean
  workspaceMessage: { tone: 'success' | 'error'; text: string } | null
  switchingDefaultProfileId: string | null
  onChangeWorkspaceRoot: (value: string) => void
  onSaveWorkspaceSettings: () => Promise<void>
  onAddProfile: () => void
  onEditProfile: (profile: ModelProfile) => void
  onSetDefaultProfile: (profileId: string) => Promise<void>
  onReturnHome: () => void
}) {
  return (
    <div className="stack gap-large">
      <section className="panel hero-panel">
        <p className="eyebrow">工作区与模型</p>
        <h2>先定项目主目录，再管理模型配置</h2>
        <p className="muted">
          当前实现使用本机安全存储保存 API Key，SQLite 只保存公开配置。新项目会在主目录下按日期创建独立文件夹。
        </p>
      </section>

      <section className="panel stack">
        <div className="panel-head">
          <div>
            <p className="eyebrow">项目主目录</p>
            <h3>建议单独设置一个长期 workspace</h3>
          </div>
          {props.workspaceSettings?.usesDefault ? <span className="tag manual">当前使用默认目录</span> : <span className="tag ready">当前使用自定义目录</span>}
        </div>
        {props.workspaceSettings ? <p className="path-value muted">{props.workspaceSettings.rootPath}</p> : null}
        <label className="field">
          <FieldLabel text="主目录路径" />
          <input
            value={props.workspaceRootDraft}
            placeholder={props.workspaceSettings?.defaultRootPath ?? '留空则使用默认 workspace'}
            onChange={(event) => props.onChangeWorkspaceRoot(event.target.value)}
          />
        </label>
        <p className="caption">
          {props.workspaceSettings
            ? `留空会回退到默认目录：${props.workspaceSettings.defaultRootPath}`
            : '留空会回退到默认 workspace。'}
        </p>
        <p className="caption">新项目目录会按 `YYYY-MM-DD-标题` 的形式创建，方便按天归档。</p>
        {props.workspaceMessage ? (
          <p className={props.workspaceMessage.tone === 'success' ? 'success-banner' : 'error-banner'}>
            {props.workspaceMessage.text}
          </p>
        ) : null}
        <div className="button-row">
          <button className="secondary-button" onClick={props.onReturnHome}>
            返回总览
          </button>
          <button
            className="primary-button"
            disabled={props.workspaceBusy}
            onClick={() => void props.onSaveWorkspaceSettings()}
          >
            {props.workspaceBusy ? '保存中…' : '保存主目录'}
          </button>
        </div>
      </section>

      <section className="panel stack">
        <div className="button-row">
          <button className="primary-button" onClick={props.onAddProfile}>
            新增配置
          </button>
        </div>
        {props.profiles.length === 0 ? (
          <p className="warning-text">还没有任何配置。</p>
        ) : (
          props.profiles.map((profile) => (
            <div key={profile.id} className="settings-card">
              <div>
                <strong>{profile.providerLabel}</strong>
                <p className="caption">
                  {profile.model} · {profile.baseUrl}
                </p>
              </div>
              <div className="stack compact">
                {profile.isDefault ? <span className="tag ready">默认配置</span> : null}
                <span className="caption">
                  {profile.lastTestedAt ? `上次测试 ${formatDate(profile.lastTestedAt)}` : '尚未记录测试时间'}
                </span>
                <div className="button-row wrap-actions">
                  <button className="secondary-button" onClick={() => props.onEditProfile(profile)}>
                    编辑
                  </button>
                  {!profile.isDefault ? (
                    <button
                      className="primary-button subtle"
                      disabled={props.switchingDefaultProfileId === profile.id}
                      onClick={() => void props.onSetDefaultProfile(profile.id)}
                    >
                      {props.switchingDefaultProfileId === profile.id ? '切换中…' : '设为默认'}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

export default App

