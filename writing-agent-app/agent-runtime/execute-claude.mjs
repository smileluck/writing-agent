import { query } from '@anthropic-ai/claude-agent-sdk'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const runtimeDir = dirname(__filename)
const appRoot = dirname(runtimeDir)

function readStdin() {
  return new Promise((resolve, reject) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      raw += chunk
    })
    process.stdin.on('end', () => resolve(raw))
    process.stdin.on('error', reject)
  })
}

function outputLine(record) {
  process.stdout.write(`${JSON.stringify(record)}\n`)
}

function exitWithError(message, details = {}) {
  outputLine({
    kind: 'error',
    error: message,
    details,
  })
  process.exit(1)
}

function buildSandboxHome(input) {
  const base =
    input.sandboxHomeBase && input.sandboxHomeBase.trim()
      ? input.sandboxHomeBase.trim()
      : join(tmpdir(), 'writing-agent-app', 'claude-runtime')

  return join(base, input.requestId || crypto.randomUUID())
}

function buildChildEnv(input, sandboxHome) {
  const nodeDir = dirname(process.execPath)

  const env = {
    ...process.env,
    HOME: sandboxHome,
    USERPROFILE: sandboxHome,
    APPDATA: join(sandboxHome, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(sandboxHome, 'AppData', 'Local'),
    ANTHROPIC_BASE_URL: input.baseUrl,
    ANTHROPIC_API_KEY: input.apiKey,
    ANTHROPIC_MODEL: input.model,
    CLAUDE_AGENT_SDK_CLIENT_APP: 'writing-agent-app/0.1.0',
    CLAUDE_CODE_ENTRYPOINT: 'writing-agent-app',
    PATH: `${nodeDir};${process.env.PATH ?? ''}`,
  }

  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.ANTHROPIC_CUSTOM_HEADERS
  delete env.NODE_OPTIONS

  return env
}

function ensureSandboxDirectories(env) {
  mkdirSync(env.APPDATA, { recursive: true })
  mkdirSync(env.LOCALAPPDATA, { recursive: true })
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return null
  }

  return {
    inputTokens: usage.inputTokens ?? usage.input_tokens ?? null,
    outputTokens: usage.outputTokens ?? usage.output_tokens ?? null,
  }
}

function extractAssistantText(message) {
  if (!message?.message?.content || !Array.isArray(message.message.content)) {
    return ''
  }

  return message.message.content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

function eventRawType(message) {
  if (message.type !== 'stream_event') {
    return message.subtype ? `${message.type}/${message.subtype}` : message.type
  }

  const eventType = message.event?.type ?? 'unknown'
  const deltaType = message.event?.delta?.type
  return deltaType ? `stream_event/${eventType}:${deltaType}` : `stream_event/${eventType}`
}

function emitProgress(input, payload) {
  if (!input.requestId) {
    return
  }

  outputLine({
    kind: 'progress',
    payload: {
      requestId: input.requestId,
      timestamp: new Date().toISOString(),
      ...payload,
    },
  })
}

async function main() {
  const raw = await readStdin()
  if (!raw.trim()) {
    exitWithError('运行时输入为空。')
    return
  }

  let input
  try {
    input = JSON.parse(raw)
  } catch (error) {
    exitWithError('运行时输入不是合法 JSON。', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return
  }

  if (!input.baseUrl || !input.apiKey || !input.model) {
    exitWithError('缺少必要的模型配置。', {
      hasBaseUrl: Boolean(input.baseUrl),
      hasApiKey: Boolean(input.apiKey),
      hasModel: Boolean(input.model),
    })
    return
  }

  const sandboxHome = buildSandboxHome(input)
  const env = buildChildEnv(input, sandboxHome)
  ensureSandboxDirectories(env)

  let sessionId = null
  let thinkingEvents = 0
  let writingStarted = false
  let partialText = ''
  let lastWritingEmitChars = 0
  let sawMessageStart = false
  let finalResult = null

  try {
    const runtime = query({
      prompt: input.userPrompt ?? '',
      options: {
        cwd: input.cwd || appRoot,
        model: input.model,
        maxTurns: input.maxTurns ?? 1,
        permissionMode: 'dontAsk',
        tools: [],
        settingSources: [],
        includePartialMessages: true,
        systemPrompt: input.systemPrompt ?? '',
        env,
        executable: 'node',
      },
    })

    for await (const message of runtime) {
      sessionId = message.session_id ?? sessionId
      const rawType = eventRawType(message)

      if (message.type === 'system' && message.subtype === 'init') {
        emitProgress(input, {
          phase: 'session_init',
          label: '已建立写作会话',
          detail: 'Claude runtime 已接受这次写作请求。',
          rawType,
          sessionId,
        })
        continue
      }

      if (message.type === 'stream_event') {
        const event = message.event
        const eventType = event?.type ?? 'unknown'
        const deltaType = event?.delta?.type

        if (eventType === 'message_start' && !sawMessageStart) {
          sawMessageStart = true
          emitProgress(input, {
            phase: 'message_start',
            label: '模型开始处理这一轮请求',
            detail: '已经进入本轮生成。',
            rawType,
            sessionId,
          })
          continue
        }

        if (eventType === 'content_block_delta' && deltaType === 'thinking_delta') {
          thinkingEvents += 1

          if (thinkingEvents === 1 || thinkingEvents % 6 === 0) {
            emitProgress(input, {
              phase: 'thinking',
              label: '模型正在内部组织内容',
              detail: `已收到 ${thinkingEvents} 个 thinking_delta 事件。`,
              rawType,
              sessionId,
              thinkingEvents,
            })
          }
          continue
        }

        if (eventType === 'content_block_start' && event?.content_block?.type === 'text') {
          writingStarted = true
          emitProgress(input, {
            phase: 'writing_start',
            label: '开始输出正文',
            detail: '已经进入 text 内容块。',
            rawType,
            sessionId,
            partialText,
            charsGenerated: partialText.length,
          })
          continue
        }

        if (eventType === 'content_block_delta' && deltaType === 'text_delta') {
          const deltaText = typeof event?.delta?.text === 'string' ? event.delta.text : ''

          if (deltaText) {
            partialText += deltaText
          }

          if (
            partialText.length === deltaText.length ||
            partialText.length - lastWritingEmitChars >= 90
          ) {
            lastWritingEmitChars = partialText.length
            emitProgress(input, {
              phase: 'writing',
              label: '正在持续输出正文',
              detail: `已收到 ${partialText.length} 个字符的实时草稿。`,
              rawType,
              sessionId,
              partialText,
              charsGenerated: partialText.length,
            })
          }
          continue
        }

        if (eventType === 'message_stop') {
          emitProgress(input, {
            phase: 'message_stop',
            label: '这一轮消息输出结束',
            detail: 'Claude 已结束当前回合的输出。',
            rawType,
            sessionId,
            partialText,
            charsGenerated: partialText.length,
          })
        }

        continue
      }

      if (message.type === 'assistant') {
        const text = extractAssistantText(message)

        if (!text.trim()) {
          continue
        }

        emitProgress(input, {
          phase: 'assistant',
          label: '拿到一版可读草稿',
          detail: `assistant 消息已产出，当前可读内容约 ${text.length} 个字符。`,
          rawType,
          sessionId,
          partialText: text,
          charsGenerated: text.length,
        })
        continue
      }

      if (message.type === 'result') {
        const finalText =
          typeof message.result === 'string' && message.result.trim()
            ? message.result
            : partialText

        emitProgress(input, {
          phase: 'completed',
          label: '已收到完整结果',
          detail: `result 已返回，本轮共生成约 ${finalText.length} 个字符。`,
          rawType,
          sessionId,
          partialText: finalText,
          charsGenerated: finalText.length,
        })

        finalResult = {
          kind: 'result',
          ok: message.subtype === 'success',
          text: finalText,
          usage: normalizeUsage(message.usage),
          raw: {
            type: message.type,
            subtype: message.subtype,
            sessionId,
          },
        }
      }
    }

    if (!finalResult) {
      throw new Error('Claude runtime 没有返回最终结果。')
    }

    outputLine(finalResult)
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : 'Claude runtime 执行失败。', {
      sessionId,
      partialTextPreview: partialText.slice(-500),
      writingStarted,
      thinkingEvents,
    })
    return
  } finally {
    if (!input.keepSandbox) {
      rmSync(sandboxHome, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  exitWithError('Claude runtime 执行失败。', {
    reason: error instanceof Error ? error.message : String(error),
  })
})
