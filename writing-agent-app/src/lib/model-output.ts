import type { StageDefinition } from '../modules/workflow/stage-definitions'

function extractTag(tag: 'markdown' | 'json', raw: string) {
  const matcher = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i')
  const matched = raw.match(matcher)

  return matched?.[1]?.trim() ?? null
}

export function parseStageEnvelope(definition: StageDefinition, rawText: string) {
  const markdown = extractTag('markdown', rawText)
  const jsonText = extractTag('json', rawText)

  if (!markdown) {
    throw new Error('模型结果缺少 <markdown> 区块。')
  }

  if (!jsonText) {
    throw new Error('模型结果缺少 <json> 区块。')
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(jsonText)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON 解析失败'
    throw new Error(`JSON 解析失败：${message}`)
  }

  const structured = definition.outputSchema.parse(parsed)
  const firstContentLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return {
    markdown,
    structured,
    rawText,
    summary: firstContentLine ? firstContentLine.replace(/^#+\s*/, '').slice(0, 96) : null,
  }
}
