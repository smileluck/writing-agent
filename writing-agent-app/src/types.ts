export type WorkflowMode = 'quick' | 'deep'

export type AppView =
  | 'onboarding'
  | 'home'
  | 'workspace'
  | 'workspace-new'
  | 'archive'
  | 'styles'
  | 'settings'

export type StageKey =
  | 'theme'
  | 'position'
  | 'research'
  | 'outline'
  | 'titles'
  | 'draft'
  | 'review'
  | 'humanize'

export type PresetReadiness = 'ready' | 'manual'

export interface ProviderPreset {
  id: string
  label: string
  protocol: 'anthropic-compatible'
  officialUrl: string
  docsUrl?: string
  description: string
  defaultBaseUrl?: string
  recommendedModels: string[]
  readiness: PresetReadiness
  includeAnthropicVersionHeader: boolean
}

export interface ModelProfile {
  id: string
  presetId: string | null
  providerLabel: string
  protocol: 'anthropic-compatible'
  baseUrl: string
  model: string
  sourceUrl: string | null
  policyNote: string | null
  includeAnthropicVersionHeader: boolean
  isDefault: boolean
  lastTestStatus: string | null
  lastTestError: string | null
  lastTestedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectSummary {
  id: string
  slug: string
  title: string
  mode: WorkflowMode
  topic: string
  audience: string
  wordTarget: number | null
  styleProfileId: string | null
  modelProfileId: string
  currentStage: StageKey
  status: string
  isArchived: boolean
  archivedAt: string | null
  workspacePath: string
  createdAt: string
  updatedAt: string
}

export interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
}

export interface StageOutput {
  id: string
  projectId: string
  runId: string | null
  stageKey: StageKey
  version: number
  summary: string | null
  wordCount: number
  markdown: string
  structured: unknown
  rawText: string | null
  artifactPath: string
  status: string
  usage: TokenUsage | null
  createdAt: string
  updatedAt: string
}

export interface ProjectDetail extends ProjectSummary {
  outputs: StageOutput[]
}

export interface BootstrapPayload {
  needsOnboarding: boolean
  profiles: ModelProfile[]
  projects: ProjectSummary[]
  workspaceSettings: WorkspaceSettings
}

export interface ConnectionHealthResult {
  success: boolean
  providerLabel: string
  model: string
  endpoint: string
  responsePreview: string | null
  message: string
}

export interface SaveModelProfileInput {
  profileId?: string | null
  presetId: string | null
  providerLabel: string
  baseUrl: string
  model: string
  apiKey: string
  sourceUrl: string | null
  policyNote: string | null
  isDefault: boolean
  includeAnthropicVersionHeader: boolean
}

export interface WorkspaceSettings {
  rootPath: string
  defaultRootPath: string
  usesDefault: boolean
}

export interface SaveWorkspaceSettingsInput {
  rootPath: string | null
}

export interface CreateProjectInput {
  title: string
  topic: string
  audience: string
  wordTarget: number | null
  mode: WorkflowMode
  modelProfileId: string
  styleProfileId: string | null
}

export interface UpdateProjectModelProfileInput {
  projectId: string
  modelProfileId: string
}

export interface RunModelRequestInput {
  profileId: string
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
  requestId?: string
}

export interface RunModelRequestResult {
  text: string
  endpoint: string
  statusCode: number
  usage: TokenUsage | null
}

export interface SaveStageOutputInput {
  projectId: string
  stageKey: StageKey
  artifactName: string
  markdown: string
  structured: unknown
  rawText: string
  summary: string | null
  usage: TokenUsage | null
}

export interface UpdateProjectProgressInput {
  projectId: string
  currentStage: StageKey
  status: string
}

export interface ExportProjectResult {
  filePath: string
}
