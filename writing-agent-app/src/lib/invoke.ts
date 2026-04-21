import { invoke } from '@tauri-apps/api/core'

import type {
  BootstrapPayload,
  ConnectionHealthResult,
  CreateProjectInput,
  ExportProjectResult,
  ModelProfile,
  ProjectDetail,
  RunModelRequestInput,
  RunModelRequestResult,
  SaveModelProfileInput,
  SaveWorkspaceSettingsInput,
  SaveStageOutputInput,
  StageOutput,
  UpdateProjectModelProfileInput,
  UpdateProjectProgressInput,
  WorkspaceSettings,
} from '../types'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

function ensureTauriRuntime() {
  if (!window.__TAURI_INTERNALS__) {
    throw new Error('当前环境不是 Tauri 运行时，无法调用本地命令。')
  }
}

async function invokeCommand<T>(command: string, payload?: Record<string, unknown>) {
  ensureTauriRuntime()
  return invoke<T>(command, payload)
}

export const appApi = {
  bootstrapApp() {
    return invokeCommand<BootstrapPayload>('bootstrap_app')
  },
  healthCheckProfile(input: SaveModelProfileInput) {
    return invokeCommand<ConnectionHealthResult>('health_check_profile', { input })
  },
  saveModelProfile(input: SaveModelProfileInput) {
    return invokeCommand<ModelProfile>('save_model_profile', { input })
  },
  openExternalUrl(url: string) {
    return invokeCommand<void>('open_external_url', { url })
  },
  setDefaultModelProfile(profileId: string) {
    return invokeCommand<ModelProfile>('set_default_model_profile', { profileId })
  },
  saveWorkspaceSettings(input: SaveWorkspaceSettingsInput) {
    return invokeCommand<WorkspaceSettings>('save_workspace_settings', { input })
  },
  createProject(input: CreateProjectInput) {
    return invokeCommand<ProjectDetail>('create_project', { input })
  },
  updateProjectModelProfile(input: UpdateProjectModelProfileInput) {
    return invokeCommand<ProjectDetail>('update_project_model_profile', { input })
  },
  archiveProject(projectId: string) {
    return invokeCommand<ProjectDetail>('archive_project', { projectId })
  },
  restoreProject(projectId: string) {
    return invokeCommand<ProjectDetail>('restore_project', { projectId })
  },
  deleteProject(projectId: string) {
    return invokeCommand<void>('delete_project', { projectId })
  },
  getProjectDetail(projectId: string) {
    return invokeCommand<ProjectDetail>('get_project_detail', { projectId })
  },
  runModelRequest(input: RunModelRequestInput) {
    return invokeCommand<RunModelRequestResult>('run_model_request', { input })
  },
  saveStageOutput(input: SaveStageOutputInput) {
    return invokeCommand<StageOutput>('save_stage_output', { input })
  },
  updateProjectProgress(input: UpdateProjectProgressInput) {
    return invokeCommand<ProjectDetail>('update_project_progress', { input })
  },
  exportProject(projectId: string) {
    return invokeCommand<ExportProjectResult>('export_project', { projectId })
  },
}
