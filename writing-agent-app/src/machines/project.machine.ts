import { assign, fromPromise, setup } from 'xstate'

import { appApi } from '../lib/invoke'
import { parseStageEnvelope } from '../lib/model-output'
import {
  buildRepairPrompts,
  buildStagePrompts,
  getCurrentStageDefinition,
  getLatestStageOutput,
  getNextStageKey,
} from '../modules/workflow/stage-definitions'
import type { ProjectDetail, ProjectSummary, StageKey } from '../types'

interface ProjectContext {
  projectId: string | null
  detail: ProjectDetail | null
  error: string | null
  lastExportPath: string | null
  generationNote: string | null
  generationRequestId: string | null
  rewindStageKey: StageKey | null
}

type ProjectEvent =
  | { type: 'LOAD'; projectId: string }
  | { type: 'REFRESH' }
  | { type: 'GENERATE'; note?: string; requestId?: string }
  | { type: 'ACCEPT_CURRENT_STAGE' }
  | { type: 'ACCEPT_AND_CONTINUE'; note?: string; requestId?: string }
  | { type: 'COMPLETE_PROJECT' }
  | { type: 'REOPEN_STAGE'; stageKey: StageKey }
  | { type: 'EXPORT' }
  | { type: 'CLEAR_ERROR' }

function describeUnknownError(error: unknown, fallback: string) {
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

function extractEmergencyMarkdown(rawText: string) {
  const tagMatched = rawText.match(/<markdown>([\s\S]*?)<\/markdown>/i)?.[1]?.trim()

  if (tagMatched) {
    return tagMatched
  }

  const trimmed = rawText.trim()

  return trimmed || '这一轮模型已经返回内容，但格式没有完全对齐，先保留这版原文供你继续处理。'
}

function getMeaningfulLines(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*#>\d.\s]+/, '').trim())
    .filter(Boolean)
}

function buildEmergencyStructured(stageKey: StageKey, markdown: string) {
  const lines = getMeaningfulLines(markdown)
  const summary = lines[0] ?? '这一轮内容已保留'
  const pick = (count: number, fallbackPrefix: string) =>
    Array.from({ length: count }, (_, index) => lines[index + 1] ?? `${fallbackPrefix}${index + 1}`)

  switch (stageKey) {
    case 'theme':
      return {
        summary,
        audienceNotes: pick(2, '待补读者判断'),
        angleOptions: pick(2, '待补切入角度'),
        nextFocus: lines[3] ?? '下一步先把立场和重点问题压实。',
        _formatFallback: true,
      }
    case 'position':
      return {
        coreClaim: summary,
        supportPoints: pick(3, '待补支撑论据'),
        redLines: pick(2, '待补表达边界'),
        _formatFallback: true,
      }
    case 'research':
      return {
        summary,
        evidence: pick(3, '待补证据点').map((point) => ({
          point,
          implication: `${point} 可以继续展开成文章里的论据。`,
        })),
        unansweredQuestions: [lines[4] ?? '这一步还需要补一个更具体的案例或数据。'],
        _formatFallback: true,
      }
    case 'outline':
      return {
        summary,
        sections: pick(3, '待补章节').map((heading) => ({
          heading,
          goal: `${heading} 这一段要解决一个明确问题。`,
          bullets: [lines[4] ?? '补一条关键论据', lines[5] ?? '补一条推进动作'],
        })),
        _formatFallback: true,
      }
    case 'titles':
      return {
        summary,
        candidates: pick(3, '标题候选').map((title) => ({
          title,
          angle: `${title} 的切入口待你确认`,
          hook: `${title} 适合继续打磨成真正的标题钩子`,
        })),
        selected: null,
        _formatFallback: true,
      }
    case 'draft':
      return {
        summary,
        sectionsCompleted: pick(3, '已完成段落'),
        revisionFocus: pick(2, '待修订重点'),
        _formatFallback: true,
      }
    case 'review':
      return {
        summary,
        strengths: pick(2, '已有优点'),
        issues: pick(2, '待修问题'),
        revisionPlan: pick(2, '待执行修订'),
        _formatFallback: true,
      }
    case 'humanize':
      return {
        summary,
        voiceAdjustments: pick(2, '待调语气点'),
        phrasesToKeep: pick(2, '建议保留表达'),
        finalChecks: pick(2, '待确认终稿检查'),
        _formatFallback: true,
      }
    default:
      return {
        summary,
        _formatFallback: true,
      }
  }
}

async function saveEmergencyStageOutput(
  detail: ProjectDetail,
  stageKey: StageKey,
  artifactName: string,
  rawText: string,
  usage: ProjectDetail['outputs'][number]['usage'],
) {
  const markdown = extractEmergencyMarkdown(rawText)
  const lines = getMeaningfulLines(markdown)
  const summary = (lines[0] ?? '这一轮内容已保留').slice(0, 96)
  const structured = buildEmergencyStructured(stageKey, markdown)

  await appApi.saveStageOutput({
    projectId: detail.id,
    stageKey,
    artifactName,
    markdown,
    structured,
    rawText,
    summary,
    usage: usage ?? null,
  })
}

async function generateStage(
  detail: ProjectDetail,
  note?: string | null,
  requestId?: string | null,
) {
  const definition = getCurrentStageDefinition(detail.mode, detail.currentStage)
  const prompts = buildStagePrompts(detail, detail.currentStage, note ?? null)
  let firstPass

  try {
    firstPass = await appApi.runModelRequest({
      profileId: detail.modelProfileId,
      ...prompts,
      maxTokens: 3200,
      temperature: 0.45,
      requestId: requestId ?? undefined,
    })
  } catch (error) {
    console.error('[projectMachine.generateStage:firstPass]', error)
    throw new Error(`模型请求失败：${describeUnknownError(error, '首轮生成失败')}`)
  }

  try {
    const parsed = parseStageEnvelope(definition, firstPass.text)
    try {
      await appApi.saveStageOutput({
        projectId: detail.id,
        stageKey: definition.key,
        artifactName: definition.artifactName,
        markdown: parsed.markdown,
        structured: parsed.structured,
        rawText: firstPass.text,
        summary: parsed.summary,
        usage: firstPass.usage,
      })
    } catch (error) {
      console.error('[projectMachine.generateStage:saveFirstPass]', error)
      throw new Error(`保存阶段产物失败：${describeUnknownError(error, '保存首轮结果失败')}`)
    }
    } catch (error) {
      const reason = describeUnknownError(error, '结构化解析失败')
      const repairPrompts = buildRepairPrompts(detail, detail.currentStage, firstPass.text, reason)
      let secondPass: Awaited<ReturnType<typeof appApi.runModelRequest>> | null = null

      try {
        secondPass = await appApi.runModelRequest({
          profileId: detail.modelProfileId,
          ...repairPrompts,
        maxTokens: 3200,
        temperature: 0.2,
        requestId: requestId ?? undefined,
      })
    } catch (repairError) {
      console.error('[projectMachine.generateStage:repairPass]', repairError)
      try {
        await saveEmergencyStageOutput(
          detail,
          definition.key,
          definition.artifactName,
          firstPass.text,
          firstPass.usage,
        )
      } catch (saveEmergencyError) {
        console.error('[projectMachine.generateStage:saveEmergencyAfterRepairRequest]', saveEmergencyError)
        throw new Error(
          `格式修复请求失败：${describeUnknownError(repairError, '格式修复失败')}；且救援保存失败：${describeUnknownError(saveEmergencyError, '救援保存失败')}`,
        )
      }
    }

    if (secondPass) {
      let repaired

      try {
        repaired = parseStageEnvelope(definition, secondPass.text)
      } catch (repairParseError) {
        console.error('[projectMachine.generateStage:repairParse]', repairParseError, secondPass.text)
        try {
          await saveEmergencyStageOutput(
            detail,
            definition.key,
            definition.artifactName,
            secondPass.text,
            secondPass.usage,
          )
        } catch (saveEmergencyError) {
          console.error('[projectMachine.generateStage:saveEmergencyAfterRepairParse]', saveEmergencyError)
          throw new Error(
            `格式修复后仍解析失败：${describeUnknownError(repairParseError, '修复结果仍不符合格式')}；且救援保存失败：${describeUnknownError(saveEmergencyError, '救援保存失败')}`,
          )
        }
      }

      if (repaired) {
        try {
          await appApi.saveStageOutput({
            projectId: detail.id,
            stageKey: definition.key,
            artifactName: definition.artifactName,
            markdown: repaired.markdown,
            structured: repaired.structured,
            rawText: secondPass.text,
            summary: repaired.summary,
            usage: secondPass.usage,
          })
        } catch (saveRepairError) {
          console.error('[projectMachine.generateStage:saveRepairPass]', saveRepairError)
          throw new Error(
            `保存修复后的阶段产物失败：${describeUnknownError(saveRepairError, '保存修复结果失败')}`,
          )
        }
      }
    }
  }

  try {
    return await appApi.getProjectDetail(detail.id)
  } catch (error) {
    console.error('[projectMachine.generateStage:reloadDetail]', error)
    throw new Error(`阶段产物已生成，但刷新项目详情失败：${describeUnknownError(error, '刷新项目失败')}`)
  }
}

async function acceptCurrentStage(detail: ProjectDetail) {
  const latest = getLatestStageOutput(detail.outputs, detail.currentStage)

  if (!latest) {
    throw new Error('当前阶段还没有可接受的产物。')
  }

  const nextStage = getNextStageKey(detail.mode, detail.currentStage)

  return appApi.updateProjectProgress({
    projectId: detail.id,
    currentStage: (nextStage ?? detail.currentStage) as StageKey,
    status: nextStage ? 'active' : 'completed',
  })
}

async function advanceAndGenerate(
  detail: ProjectDetail,
  note?: string | null,
  requestId?: string | null,
) {
  const nextStage = getNextStageKey(detail.mode, detail.currentStage)

  if (!nextStage) {
    throw new Error('当前已经是最后一个阶段，不能继续交给下一步。')
  }

  const advancedDetail = await acceptCurrentStage(detail)
  return generateStage(advancedDetail, note, requestId)
}

async function finalizeProject(detail: ProjectDetail) {
  await acceptCurrentStage(detail)
  const exportResult = await appApi.exportProject(detail.id)
  const refreshedDetail = await appApi.getProjectDetail(detail.id)

  return {
    detail: refreshedDetail,
    filePath: exportResult.filePath,
  }
}

async function reopenStage(detail: ProjectDetail, stageKey: StageKey) {
  return appApi.updateProjectProgress({
    projectId: detail.id,
    currentStage: stageKey,
    status: 'active',
  })
}

function projectToSummary(project: ProjectDetail): ProjectSummary {
  return {
    id: project.id,
    slug: project.slug,
    title: project.title,
    mode: project.mode,
    topic: project.topic,
    audience: project.audience,
    wordTarget: project.wordTarget,
    styleProfileId: project.styleProfileId,
    modelProfileId: project.modelProfileId,
    currentStage: project.currentStage,
    status: project.status,
    isArchived: project.isArchived,
    archivedAt: project.archivedAt,
    workspacePath: project.workspacePath,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

export { projectToSummary }

export const projectMachine = setup({
  types: {
    context: {} as ProjectContext,
    events: {} as ProjectEvent,
  },
  actors: {
    loadProject: fromPromise(async ({ input }: { input: { projectId: string } }) =>
      appApi.getProjectDetail(input.projectId),
    ),
    generateStage: fromPromise(
      async ({
        input,
      }: {
        input: { detail: ProjectDetail; note?: string | null; requestId?: string | null }
      }) => generateStage(input.detail, input.note, input.requestId),
    ),
    acceptStage: fromPromise(async ({ input }: { input: { detail: ProjectDetail } }) =>
      acceptCurrentStage(input.detail),
    ),
    advanceAndGenerate: fromPromise(
      async ({
        input,
      }: {
        input: { detail: ProjectDetail; note?: string | null; requestId?: string | null }
      }) => advanceAndGenerate(input.detail, input.note, input.requestId),
    ),
    finalizeProject: fromPromise(async ({ input }: { input: { detail: ProjectDetail } }) =>
      finalizeProject(input.detail),
    ),
    reopenStage: fromPromise(
      async ({
        input,
      }: {
        input: { detail: ProjectDetail; stageKey: StageKey }
      }) => reopenStage(input.detail, input.stageKey),
    ),
    exportProject: fromPromise(async ({ input }: { input: { detail: ProjectDetail } }) => {
      const exportResult = await appApi.exportProject(input.detail.id)
      const refreshedDetail = await appApi.getProjectDetail(input.detail.id)

      return {
        detail: refreshedDetail,
        filePath: exportResult.filePath,
      }
    }),
  },
}).createMachine({
  id: 'project',
  initial: 'idle',
  context: {
    projectId: null,
    detail: null,
    error: null,
    lastExportPath: null,
    generationNote: null,
    generationRequestId: null,
    rewindStageKey: null,
  },
  states: {
    idle: {
      on: {
        LOAD: {
          target: 'loading',
          actions: assign({
            projectId: ({ event }) => event.projectId,
            error: null,
            lastExportPath: null,
            generationNote: null,
            generationRequestId: null,
            rewindStageKey: null,
          }),
        },
      },
    },
    loading: {
      invoke: {
        src: 'loadProject',
        input: ({ context }) => ({ projectId: context.projectId ?? '' }),
        onDone: {
          target: 'ready',
          actions: assign({
            detail: ({ event }) => event.output,
            error: null,
            generationNote: null,
            generationRequestId: null,
            rewindStageKey: null,
          }),
        },
        onError: {
          target: 'failure',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : '项目加载失败',
          }),
        },
      },
    },
    ready: {
      on: {
        LOAD: {
          target: 'loading',
          actions: assign({
            projectId: ({ event }) => event.projectId,
            error: null,
            lastExportPath: null,
            generationNote: null,
            generationRequestId: null,
          }),
        },
        REFRESH: {
          target: 'loading',
        },
        GENERATE: {
          target: 'generating',
          actions: assign({
            generationNote: ({ event }) => event.note?.trim() || null,
            generationRequestId: ({ event }) => event.requestId?.trim() || null,
          }),
        },
        ACCEPT_CURRENT_STAGE: {
          target: 'advancing',
        },
        ACCEPT_AND_CONTINUE: {
          target: 'handoff',
          actions: assign({
            generationNote: ({ event }) => event.note?.trim() || null,
            generationRequestId: ({ event }) => event.requestId?.trim() || null,
          }),
        },
        COMPLETE_PROJECT: {
          target: 'finalizing',
        },
        REOPEN_STAGE: {
          target: 'rewinding',
          actions: assign({
            rewindStageKey: ({ event }) => event.stageKey,
            error: null,
          }),
        },
        EXPORT: {
          target: 'exporting',
        },
      },
    },
    generating: {
      invoke: {
        src: 'generateStage',
        input: ({ context }) => ({
          detail: context.detail as ProjectDetail,
          note: context.generationNote,
          requestId: context.generationRequestId,
        }),
        onDone: {
          target: 'ready',
          actions: assign({
            detail: ({ event }) => event.output,
            error: null,
            generationNote: null,
            generationRequestId: null,
            rewindStageKey: null,
          }),
        },
        onError: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => describeUnknownError(event.error, '阶段生成失败'),
            generationNote: null,
            generationRequestId: null,
          }),
        },
      },
    },
    handoff: {
      invoke: {
        src: 'advanceAndGenerate',
        input: ({ context }) => ({
          detail: context.detail as ProjectDetail,
          note: context.generationNote,
          requestId: context.generationRequestId,
        }),
        onDone: {
          target: 'ready',
          actions: assign({
            detail: ({ event }) => event.output,
            error: null,
            generationNote: null,
            generationRequestId: null,
            rewindStageKey: null,
          }),
        },
        onError: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => describeUnknownError(event.error, '阶段接力失败'),
            generationNote: null,
            generationRequestId: null,
            rewindStageKey: null,
          }),
        },
      },
    },
    advancing: {
      invoke: {
        src: 'acceptStage',
        input: ({ context }) => ({ detail: context.detail as ProjectDetail }),
        onDone: {
          target: 'ready',
          actions: assign({
            detail: ({ event }) => event.output,
            error: null,
            generationNote: null,
            generationRequestId: null,
            rewindStageKey: null,
          }),
        },
        onError: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => describeUnknownError(event.error, '阶段确认失败'),
          }),
        },
      },
    },
    rewinding: {
      invoke: {
        src: 'reopenStage',
        input: ({ context }) => ({
          detail: context.detail as ProjectDetail,
          stageKey: (context.rewindStageKey ?? context.detail?.currentStage) as StageKey,
        }),
        onDone: {
          target: 'ready',
          actions: assign({
            detail: ({ event }) => event.output,
            error: null,
            generationNote: null,
            generationRequestId: null,
            rewindStageKey: null,
          }),
        },
        onError: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => describeUnknownError(event.error, '阶段回退失败'),
            rewindStageKey: null,
          }),
        },
      },
    },
    finalizing: {
      invoke: {
        src: 'finalizeProject',
        input: ({ context }) => ({ detail: context.detail as ProjectDetail }),
        onDone: {
          target: 'ready',
          actions: assign({
            detail: ({ event }) => event.output.detail,
            lastExportPath: ({ event }) => event.output.filePath,
            error: null,
            generationNote: null,
            generationRequestId: null,
            rewindStageKey: null,
          }),
        },
        onError: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => describeUnknownError(event.error, '终稿封版失败'),
          }),
        },
      },
    },
    exporting: {
      invoke: {
        src: 'exportProject',
        input: ({ context }) => ({ detail: context.detail as ProjectDetail }),
        onDone: {
          target: 'ready',
          actions: assign({
            detail: ({ event }) => event.output.detail,
            lastExportPath: ({ event }) => event.output.filePath,
            error: null,
            generationNote: null,
            generationRequestId: null,
            rewindStageKey: null,
          }),
        },
        onError: {
          target: 'failure',
          actions: assign({
            error: ({ event }) => describeUnknownError(event.error, '导出失败'),
          }),
        },
      },
    },
    failure: {
      on: {
        CLEAR_ERROR: {
          target: 'ready',
          actions: assign({
            error: null,
          }),
        },
        GENERATE: {
          target: 'generating',
          actions: assign({
            error: null,
            generationNote: ({ event }) => event.note?.trim() || null,
            generationRequestId: ({ event }) => event.requestId?.trim() || null,
          }),
        },
        ACCEPT_AND_CONTINUE: {
          target: 'handoff',
          actions: assign({
            error: null,
            generationNote: ({ event }) => event.note?.trim() || null,
            generationRequestId: ({ event }) => event.requestId?.trim() || null,
          }),
        },
        COMPLETE_PROJECT: {
          target: 'finalizing',
          actions: assign({
            error: null,
          }),
        },
        REOPEN_STAGE: {
          target: 'rewinding',
          actions: assign({
            error: null,
            rewindStageKey: ({ event }) => event.stageKey,
          }),
        },
        EXPORT: {
          target: 'exporting',
          actions: assign({
            error: null,
          }),
        },
        LOAD: {
          target: 'loading',
          actions: assign({
            projectId: ({ event }) => event.projectId,
            error: null,
            lastExportPath: null,
            generationNote: null,
            generationRequestId: null,
            rewindStageKey: null,
          }),
        },
        REFRESH: {
          target: 'loading',
          actions: assign({
            error: null,
            generationNote: null,
            generationRequestId: null,
            rewindStageKey: null,
          }),
        },
      },
    },
  },
})
